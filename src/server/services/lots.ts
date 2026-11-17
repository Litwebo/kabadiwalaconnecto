import crypto from 'node:crypto';
import {
  assertLotTransition,
  haversineKm,
  median,
} from '../../shared/format.ts';
import type {
  BookingStatus,
  EstimateItemBreakdown,
  LotDTO,
  LotEstimateDTO,
  LotItemDTO,
  LotStatus,
} from '../../shared/types.ts';
import { getDb, writeAuditLog } from '../db.ts';

const REGIONAL_RADIUS_KM = 40;

export function getLotById(lotId: string): LotDTO | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.*, u.name as collector_name
       FROM lots l
       JOIN users u ON u.id = l.collector_id
       WHERE l.id = ?`
    )
    .get(lotId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const itemRows = db
    .prepare(
      `SELECT li.*, c.name as cat_name, c.name_hi as cat_name_hi, c.name_kn as cat_name_kn, c.hazardous as cat_hazardous
       FROM lot_items li
       JOIN categories c ON c.id = li.category_id
       WHERE li.lot_id = ?`
    )
    .all(lotId) as Record<string, unknown>[];

  const photoRows = db
    .prepare('SELECT id, url FROM lot_photos WHERE lot_id = ? ORDER BY created_at ASC')
    .all(lotId) as { id: string; url: string }[];

  const activeBooking = db
    .prepare(
      `SELECT id, status FROM bookings
       WHERE lot_id = ? AND status NOT IN ('DECLINED', 'EXPIRED', 'CANCELLED')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(lotId) as { id: string; status: BookingStatus } | undefined;

  const items: LotItemDTO[] = itemRows.map((i) => ({
    id: String(i.id),
    categoryId: String(i.category_id),
    categoryName: String(i.cat_name),
    categoryNameHi: String(i.cat_name_hi),
    categoryNameKn: String(i.cat_name_kn),
    hazardous: Boolean(i.cat_hazardous),
    declaredKg: Number(i.declared_kg),
  }));

  const totalKg = Math.round(items.reduce((sum, i) => sum + i.declaredKg, 0) * 100) / 100;

  return {
    id: String(row.id),
    collectorId: String(row.collector_id),
    collectorName: String(row.collector_name),
    status: row.status as LotStatus,
    lat: Number(row.lat),
    lng: Number(row.lng),
    areaLabel: String(row.area_label),
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
    photos: photoRows,
    totalKg,
    activeBookingId: activeBooking?.id || null,
    activeBookingStatus: activeBooking?.status || null,
  };
}

export function listCollectorLots(collectorId: string): LotDTO[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT id FROM lots WHERE collector_id = ? ORDER BY updated_at DESC')
    .all(collectorId) as { id: string }[];
  return rows.map((r) => getLotById(r.id)).filter((l): l is LotDTO => Boolean(l));
}

export function createLot(
  collectorId: string,
  input: {
    lat: number;
    lng: number;
    areaLabel: string;
    notes?: string;
    items: { categoryId: string; declaredKg: number }[];
    photoUrls: string[];
    publish?: boolean;
  }
): LotDTO {
  const db = getDb();
  const id = `lot_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const status: LotStatus = input.publish ? 'LISTED' : 'DRAFT';

  db.prepare(
    `INSERT INTO lots (id, collector_id, status, lat, lng, area_label, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    collectorId,
    status,
    input.lat,
    input.lng,
    input.areaLabel.trim(),
    input.notes?.trim() || null,
    now,
    now
  );

  for (const item of input.items) {
    db.prepare('INSERT INTO lot_items (id, lot_id, category_id, declared_kg) VALUES (?, ?, ?, ?)').run(
      `li_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      id,
      item.categoryId,
      item.declaredKg
    );
  }

  for (const url of input.photoUrls.slice(0, 4)) {
    db.prepare('INSERT INTO lot_photos (id, lot_id, url, created_at) VALUES (?, ?, ?, ?)').run(
      `lp_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      id,
      url,
      now
    );
  }

  writeAuditLog(collectorId, 'Lot', id, 'CREATE', { status, itemCount: input.items.length });
  return getLotById(id)!;
}

export function updateLot(
  lotId: string,
  collectorId: string,
  input: {
    lat?: number;
    lng?: number;
    areaLabel?: string;
    notes?: string | null;
    items?: { categoryId: string; declaredKg: number }[];
    photoUrls?: string[];
    status?: LotStatus;
  }
): LotDTO {
  const existing = getLotById(lotId);
  if (!existing) throw new Error('Lot not found.');
  if (existing.collectorId !== collectorId) throw new Error('Forbidden: not your lot.');
  if (existing.status === 'BOOKED' || existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    throw new Error(`Lot cannot be edited while in ${existing.status} state.`);
  }

  const nextStatus = input.status || existing.status;
  assertLotTransition(existing.status, nextStatus);

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE lots SET lat = ?, lng = ?, area_label = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(
    input.lat ?? existing.lat,
    input.lng ?? existing.lng,
    input.areaLabel !== undefined ? input.areaLabel.trim() : existing.areaLabel,
    input.notes !== undefined ? input.notes : existing.notes,
    nextStatus,
    now,
    lotId
  );

  if (input.items) {
    db.prepare('DELETE FROM lot_items WHERE lot_id = ?').run(lotId);
    for (const item of input.items) {
      db.prepare('INSERT INTO lot_items (id, lot_id, category_id, declared_kg) VALUES (?, ?, ?, ?)').run(
        `li_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
        lotId,
        item.categoryId,
        item.declaredKg
      );
    }
  }

  if (input.photoUrls) {
    db.prepare('DELETE FROM lot_photos WHERE lot_id = ?').run(lotId);
    for (const url of input.photoUrls.slice(0, 4)) {
      db.prepare('INSERT INTO lot_photos (id, lot_id, url, created_at) VALUES (?, ?, ?, ?)').run(
        `lp_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
        lotId,
        url,
        now
      );
    }
  }

  if (nextStatus !== existing.status) {
    writeAuditLog(collectorId, 'Lot', lotId, 'STATUS_CHANGE', {
      from: existing.status,
      to: nextStatus,
    });
  } else {
    writeAuditLog(collectorId, 'Lot', lotId, 'UPDATE', { status: nextStatus });
  }

  return getLotById(lotId)!;
}

export function estimateLotValue(lotId: string): LotEstimateDTO {
  const lot = getLotById(lotId);
  if (!lot) throw new Error('Lot not found.');
  return computeEstimateForItems(lot.lat, lot.lng, lot.items, lot.id);
}

export function computeEstimateForItems(
  lat: number,
  lng: number,
  items: { categoryId: string; declaredKg: number }[],
  lotId = 'preview'
): LotEstimateDTO {
  const db = getDb();
  const nowIso = new Date().toISOString();

  // Fetch approved, non-expired recyclers near the lot
  const recyclerRows = db
    .prepare(
      `SELECT id, lat, lng, registration_expiry FROM recycler_profiles
       WHERE verification_status = 'APPROVED'`
    )
    .all() as { id: string; lat: number; lng: number; registration_expiry: string }[];

  const regionalRecyclerIds = recyclerRows
    .filter((r) => new Date(r.registration_expiry).getTime() > Date.now())
    .filter((r) => haversineKm(lat, lng, r.lat, r.lng) <= REGIONAL_RADIUS_KM)
    .map((r) => r.id);

  const breakdowns: EstimateItemBreakdown[] = [];
  let lowTotal = 0;
  let midTotal = 0;
  let highTotal = 0;
  let totalKg = 0;
  let hasHazardous = false;

  for (const item of items) {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(item.categoryId) as
      | Record<string, unknown>
      | undefined;
    if (!cat) continue;

    const hazardous = Boolean(cat.hazardous);
    if (hazardous) hasHazardous = true;

    let sampleRates: number[] = [];
    if (regionalRecyclerIds.length > 0) {
      const placeholders = regionalRecyclerIds.map(() => '?').join(',');
      const rateRows = db
        .prepare(
          `SELECT price_per_kg FROM recycler_rates
           WHERE category_id = ? AND active = 1 AND recycler_id IN (${placeholders})`
        )
        .all(item.categoryId, ...regionalRecyclerIds) as { price_per_kg: number }[];
      sampleRates = rateRows.map((r) => Number(r.price_per_kg));
    }

    let source: 'REGIONAL_MEDIAN' | 'REFERENCE_RATE' = 'REGIONAL_MEDIAN';
    let medianRate = median(sampleRates);

    if (sampleRates.length === 0) {
      source = 'REFERENCE_RATE';
      const refRow = db
        .prepare(
          `SELECT price_per_kg FROM reference_rates WHERE category_id = ? ORDER BY effective_from DESC LIMIT 1`
        )
        .get(item.categoryId) as { price_per_kg: number } | undefined;
      medianRate = refRow ? Number(refRow.price_per_kg) : 50;
    }

    const midAmount = Math.round(medianRate * item.declaredKg);
    const lowAmount = Math.round(midAmount * 0.9);
    const highAmount = Math.round(midAmount * 1.1);

    totalKg += item.declaredKg;
    lowTotal += lowAmount;
    midTotal += midAmount;
    highTotal += highAmount;

    breakdowns.push({
      categoryId: item.categoryId,
      categoryName: String(cat.name),
      hazardous,
      declaredKg: item.declaredKg,
      medianRatePerKg: medianRate,
      lowAmount,
      highAmount,
      source,
      recyclerSampleCount: sampleRates.length,
    });
  }

  return {
    lotId,
    totalKg: Math.round(totalKg * 100) / 100,
    lowTotal,
    midTotal,
    highTotal,
    hasHazardous,
    computedAt: nowIso,
    disclaimer:
      'Indicative range (-10% to +10%) based on active regional recycler rates or admin reference rates. Final payable amount depends on actual weighed kg at handover.',
    items: breakdowns,
  };
}
