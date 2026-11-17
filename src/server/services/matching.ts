import { haversineKm } from '../../shared/format.ts';
import type { BookingMode, MatchCandidateDTO, ServiceMode, SlotRule } from '../../shared/types.ts';
import { getDb, getSettingNumber } from '../db.ts';
import { getLotById } from './lots.ts';

export type MatchSortKey = 'net_price' | 'nearest' | 'earliest';

export interface MatchingRecyclerInput {
  recyclerId: string;
  recyclerUserId: string;
  businessName: string;
  registrationNumber: string;
  address?: string;
  verificationStatus: string;
  registrationExpiry: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  mode: ServiceMode;
  minQtyKg: number;
  acceptsHazardous: boolean;
  slotRules: SlotRule[];
  ratesByCategory: Record<string, { pricePerKg: number; active: boolean }>;
}

export interface MatchingLotInput {
  lat: number;
  lng: number;
  totalKg: number;
  hasHazardous: boolean;
  items: { categoryId: string; categoryName: string; declaredKg: number }[];
}

export function computeTransportCost(distanceKm: number, mode: BookingMode, costPerKm: number): number {
  if (mode === 'PICKUP') return 0;
  return Math.round(distanceKm * 2 * costPerKm);
}

export function computeNextSlotsFromRules(slotRules: SlotRule[], now = new Date()): {
  start: string;
  end: string;
  label: string;
}[] {
  const slots: { start: string; end: string; label: string }[] = [];
  const baseDate = new Date(now);

  for (let dayOffset = 0; dayOffset < 3 && slots.length < 4; dayOffset++) {
    const rule = slotRules[dayOffset] || slotRules[dayOffset % Math.max(1, slotRules.length)];
    if (!rule || !Array.isArray(rule.windows)) continue;

    const targetDate = new Date(baseDate.getTime() + dayOffset * 86400000);
    const dayStr =
      dayOffset === 0
        ? 'Today'
        : dayOffset === 1
        ? 'Tomorrow'
        : targetDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

    for (const w of rule.windows) {
      const start = new Date(targetDate);
      start.setHours(w.startHour, 0, 0, 0);
      const end = new Date(targetDate);
      end.setHours(w.endHour, 0, 0, 0);

      if (end.getTime() <= now.getTime() + 15 * 60 * 1000) {
        continue;
      }
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${dayStr} · ${w.label}`,
      });
      if (slots.length >= 4) break;
    }
  }

  if (slots.length === 0) {
    const tomorrowMorning = new Date(now.getTime() + 86400000);
    tomorrowMorning.setHours(10, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowMorning);
    tomorrowEnd.setHours(13, 0, 0, 0);
    slots.push({
      start: tomorrowMorning.toISOString(),
      end: tomorrowEnd.toISOString(),
      label: 'Tomorrow · 10:00 AM - 1:00 PM',
    });
  }

  return slots;
}

export function matchRecyclersCore(params: {
  lot: MatchingLotInput;
  recyclers: MatchingRecyclerInput[];
  costPerKm: number;
  sort?: MatchSortKey;
  now?: Date;
}): {
  eligible: MatchCandidateDTO[];
  partial: MatchCandidateDTO[];
  costPerKm: number;
} {
  const { lot, recyclers, costPerKm, sort = 'net_price', now = new Date() } = params;
  const eligible: MatchCandidateDTO[] = [];
  const partial: MatchCandidateDTO[] = [];

  for (const r of recyclers) {
    if (r.verificationStatus !== 'APPROVED') continue;
    if (new Date(r.registrationExpiry).getTime() <= now.getTime()) continue;

    const distanceKm = haversineKm(lot.lat, lot.lng, r.lat, r.lng);
    if (distanceKm > r.serviceRadiusKm) continue;

    const ineligibleReasons: string[] = [];
    const missingCategories: string[] = [];
    const perMaterialRates: MatchCandidateDTO['perMaterialRates'] = [];
    let offerTotal = 0;

    for (const item of lot.items) {
      const rate = r.ratesByCategory[item.categoryId];
      if (!rate || !rate.active || rate.pricePerKg <= 0) {
        missingCategories.push(item.categoryName);
      } else {
        const lineTotal = Math.round(item.declaredKg * rate.pricePerKg);
        offerTotal += lineTotal;
        perMaterialRates.push({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          declaredKg: item.declaredKg,
          ratePerKg: rate.pricePerKg,
          lineTotal,
        });
      }
    }

    if (lot.totalKg < r.minQtyKg) {
      ineligibleReasons.push(`Minimum lot weight is ${r.minQtyKg} kg (your lot is ${lot.totalKg} kg)`);
    }
    if (lot.hasHazardous && !r.acceptsHazardous) {
      ineligibleReasons.push('Does not accept hazardous categories (batteries/CRT)');
    }
    if (missingCategories.length > 0) {
      ineligibleReasons.push(`No active buying rate for: ${missingCategories.join(', ')}`);
    }

    const effectiveMode: BookingMode = r.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const transportCost = computeTransportCost(distanceKm, effectiveMode, costPerKm);
    const netAmount = Math.max(0, offerTotal - transportCost);
    const nextSlots = computeNextSlotsFromRules(r.slotRules, now);

    const candidate: MatchCandidateDTO = {
      recyclerId: r.recyclerId,
      recyclerUserId: r.recyclerUserId,
      businessName: r.businessName,
      registrationNumber: r.registrationNumber,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      distanceKm,
      mode: r.mode,
      effectiveMode,
      minQtyKg: r.minQtyKg,
      acceptsHazardous: r.acceptsHazardous,
      eligible: ineligibleReasons.length === 0,
      partial: ineligibleReasons.length > 0,
      ineligibleReasons,
      missingCategories,
      perMaterialRates,
      offerTotal,
      transportCost,
      netAmount,
      nextSlots,
      tags: [],
    };

    if (candidate.eligible) {
      eligible.push(candidate);
    } else if (perMaterialRates.length > 0 || missingCategories.length > 0) {
      partial.push(candidate);
    }
  }

  if (eligible.length > 0) {
    const maxNet = Math.max(...eligible.map((c) => c.netAmount));
    const minDist = Math.min(...eligible.map((c) => c.distanceKm));
    const earliestMs = Math.min(
      ...eligible.map((c) => new Date(c.nextSlots[0]?.start || Date.now() + 9e9).getTime())
    );

    for (const c of eligible) {
      if (c.netAmount === maxNet) c.tags.push('BEST_NET_PRICE');
      if (c.distanceKm === minDist) c.tags.push('NEAREST');
      const slotMs = new Date(c.nextSlots[0]?.start || Date.now() + 9e9).getTime();
      if (slotMs === earliestMs) c.tags.push('EARLIEST_PICKUP');
    }
  }

  eligible.sort((a, b) => {
    if (sort === 'nearest') {
      return a.distanceKm - b.distanceKm || b.netAmount - a.netAmount;
    }
    if (sort === 'earliest') {
      const aTime = new Date(a.nextSlots[0]?.start || 0).getTime();
      const bTime = new Date(b.nextSlots[0]?.start || 0).getTime();
      return aTime - bTime || b.netAmount - a.netAmount;
    }
    return b.netAmount - a.netAmount || a.distanceKm - b.distanceKm;
  });

  partial.sort((a, b) => a.missingCategories.length - b.missingCategories.length || a.distanceKm - b.distanceKm);

  return { eligible, partial, costPerKm };
}

export function findMatchesForLot(
  lotId: string,
  sort: MatchSortKey = 'net_price'
): {
  lot: NonNullable<ReturnType<typeof getLotById>>;
  eligible: MatchCandidateDTO[];
  partial: MatchCandidateDTO[];
  costPerKm: number;
} {
  const lot = getLotById(lotId);
  if (!lot) throw new Error('Lot not found.');

  const db = getDb();
  const costPerKm = getSettingNumber('COST_PER_KM', 7);

  const profileRows = db
    .prepare(
      `SELECT rp.* FROM recycler_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE u.status = 'ACTIVE' AND rp.verification_status = 'APPROVED'`
    )
    .all() as Record<string, unknown>[];

  const recyclers: MatchingRecyclerInput[] = profileRows.map((row) => {
    const rateRows = db
      .prepare('SELECT category_id, price_per_kg, active FROM recycler_rates WHERE recycler_id = ?')
      .all(String(row.id)) as { category_id: string; price_per_kg: number; active: number }[];

    const ratesByCategory: Record<string, { pricePerKg: number; active: boolean }> = {};
    for (const rr of rateRows) {
      ratesByCategory[rr.category_id] = {
        pricePerKg: Number(rr.price_per_kg),
        active: Boolean(rr.active),
      };
    }

    return {
      recyclerId: String(row.id),
      recyclerUserId: String(row.user_id),
      businessName: String(row.business_name),
      registrationNumber: String(row.registration_number),
      address: String(row.address),
      verificationStatus: String(row.verification_status),
      registrationExpiry: String(row.registration_expiry),
      lat: Number(row.lat),
      lng: Number(row.lng),
      serviceRadiusKm: Number(row.service_radius_km),
      mode: row.mode as ServiceMode,
      minQtyKg: Number(row.min_qty_kg),
      acceptsHazardous: Boolean(row.accepts_hazardous),
      slotRules: JSON.parse(String(row.slot_rules || '[]')) as SlotRule[],
      ratesByCategory,
    };
  });

  const hasHazardous = lot.items.some((i) => Boolean(i.hazardous));
  const result = matchRecyclersCore({
    lot: {
      lat: lot.lat,
      lng: lot.lng,
      totalKg: lot.totalKg,
      hasHazardous,
      items: lot.items.map((i) => ({
        categoryId: i.categoryId,
        categoryName: i.categoryName || i.categoryId,
        declaredKg: i.declaredKg,
      })),
    },
    recyclers,
    costPerKm,
    sort,
  });

  return { lot, ...result };
}
