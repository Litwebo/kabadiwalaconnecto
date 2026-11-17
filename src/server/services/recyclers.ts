import crypto from 'node:crypto';
import type {
  CategoryDTO,
  RecyclerProfileDTO,
  RecyclerRateDTO,
  ServiceMode,
  SlotRule,
  VerificationStatus,
} from '../../shared/types.ts';
import { getDb, writeAuditLog } from '../db.ts';
import { createNotification } from '../notifications.ts';
import { getStorageProvider } from '../storage.ts';

export function listCategories(includeInactive = false): CategoryDTO[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, (
         SELECT price_per_kg FROM reference_rates r
         WHERE r.category_id = c.id ORDER BY r.effective_from DESC LIMIT 1
       ) as ref_rate,
       (
         SELECT effective_from FROM reference_rates r
         WHERE r.category_id = c.id ORDER BY r.effective_from DESC LIMIT 1
       ) as ref_updated_at
       FROM categories c
       ${includeInactive ? '' : 'WHERE c.active = 1'}
       ORDER BY c.hazardous ASC, c.name ASC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    nameHi: String(r.name_hi),
    nameKn: String(r.name_kn),
    hazardous: Boolean(r.hazardous),
    iconKey: String(r.icon_key),
    co2FactorPerKg: Number(r.co2_factor_per_kg),
    active: Boolean(r.active),
    referenceRatePerKg: r.ref_rate !== null && r.ref_rate !== undefined ? Number(r.ref_rate) : undefined,
    referenceUpdatedAt: r.ref_updated_at ? String(r.ref_updated_at) : undefined,
  }));
}

export function getRecyclerProfileByUserId(userId: string, includeSignedDocs = false): RecyclerProfileDTO | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT rp.*, u.name as user_name, u.phone as user_phone
       FROM recycler_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.user_id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return mapRecyclerRow(row, includeSignedDocs);
}

export function getRecyclerProfileById(recyclerId: string, includeSignedDocs = false): RecyclerProfileDTO | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT rp.*, u.name as user_name, u.phone as user_phone
       FROM recycler_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.id = ?`
    )
    .get(recyclerId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return mapRecyclerRow(row, includeSignedDocs);
}

function mapRecyclerRow(row: Record<string, unknown>, includeSignedDocs: boolean): RecyclerProfileDTO {
  const db = getDb();
  const storage = getStorageProvider();
  const rawKeys = JSON.parse(String(row.authorisation_doc_urls || '[]')) as string[];
  const docUrls = includeSignedDocs
    ? rawKeys.map((k) => (k.startsWith('http') || k.startsWith('/api/') ? k : storage.getSignedPrivateUrl(k)))
    : [];

  const rateRows = db
    .prepare(
      `SELECT rr.*, c.name as category_name
       FROM recycler_rates rr
       JOIN categories c ON c.id = rr.category_id
       WHERE rr.recycler_id = ?
       ORDER BY c.name ASC`
    )
    .all(String(row.id)) as Record<string, unknown>[];

  const rates: RecyclerRateDTO[] = rateRows.map((rr) => ({
    id: String(rr.id),
    recyclerId: String(rr.recycler_id),
    categoryId: String(rr.category_id),
    categoryName: String(rr.category_name),
    pricePerKg: Number(rr.price_per_kg),
    active: Boolean(rr.active),
    updatedAt: String(rr.updated_at),
  }));

  // Auto-mark expired if registrationExpiry passed
  let status = row.verification_status as VerificationStatus;
  if (status === 'APPROVED' && new Date(String(row.registration_expiry)).getTime() < Date.now()) {
    status = 'EXPIRED';
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    businessName: String(row.business_name),
    registrationNumber: String(row.registration_number),
    authorisationDocUrls: docUrls,
    verificationStatus: status,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    registrationExpiry: String(row.registration_expiry),
    serviceRadiusKm: Number(row.service_radius_km),
    lat: Number(row.lat),
    lng: Number(row.lng),
    address: String(row.address),
    mode: row.mode as ServiceMode,
    minQtyKg: Number(row.min_qty_kg),
    acceptsHazardous: Boolean(row.accepts_hazardous),
    slotRules: JSON.parse(String(row.slot_rules || '[]')) as SlotRule[],
    rates,
    userName: row.user_name ? String(row.user_name) : undefined,
    userPhone: includeSignedDocs && row.user_phone ? String(row.user_phone) : undefined,
  };
}

export function upsertRecyclerProfile(
  userId: string,
  input: {
    businessName: string;
    registrationNumber: string;
    registrationExpiry: string;
    serviceRadiusKm: number;
    lat: number;
    lng: number;
    address: string;
    mode: ServiceMode;
    minQtyKg: number;
    acceptsHazardous: boolean;
    slotRules: SlotRule[];
    authorisationDocKeys?: string[];
  }
): RecyclerProfileDTO {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM recycler_profiles WHERE user_id = ?')
    .get(userId) as Record<string, unknown> | undefined;

  const now = new Date().toISOString();

  if (existing) {
    const existingKeys = JSON.parse(String(existing.authorisation_doc_urls || '[]')) as string[];
    const mergedKeys =
      input.authorisationDocKeys && input.authorisationDocKeys.length > 0
        ? [...existingKeys, ...input.authorisationDocKeys]
        : existingKeys;

    // Reset to PENDING if registration number or docs changed
    const regChanged =
      input.registrationNumber !== String(existing.registration_number) ||
      (input.authorisationDocKeys && input.authorisationDocKeys.length > 0);
    const nextStatus = regChanged ? 'PENDING' : String(existing.verification_status);

    db.prepare(
      `UPDATE recycler_profiles SET
       business_name = ?, registration_number = ?, authorisation_doc_urls = ?,
       verification_status = ?, registration_expiry = ?, service_radius_km = ?,
       lat = ?, lng = ?, address = ?, mode = ?, min_qty_kg = ?,
       accepts_hazardous = ?, slot_rules = ?
       WHERE user_id = ?`
    ).run(
      input.businessName,
      input.registrationNumber,
      JSON.stringify(mergedKeys),
      nextStatus,
      input.registrationExpiry,
      input.serviceRadiusKm,
      input.lat,
      input.lng,
      input.address,
      input.mode,
      input.minQtyKg,
      input.acceptsHazardous ? 1 : 0,
      JSON.stringify(input.slotRules),
      userId
    );
    writeAuditLog(userId, 'RecyclerProfile', String(existing.id), 'PROFILE_UPDATE', {
      status: nextStatus,
    });
  } else {
    const id = `rec_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    db.prepare(
      `INSERT INTO recycler_profiles (
        id, user_id, business_name, registration_number, authorisation_doc_urls,
        verification_status, rejection_reason, verified_at, registration_expiry,
        service_radius_km, lat, lng, address, mode, min_qty_kg, accepts_hazardous,
        slot_rules, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      input.businessName,
      input.registrationNumber,
      JSON.stringify(input.authorisationDocKeys || []),
      input.registrationExpiry,
      input.serviceRadiusKm,
      input.lat,
      input.lng,
      input.address,
      input.mode,
      input.minQtyKg,
      input.acceptsHazardous ? 1 : 0,
      JSON.stringify(input.slotRules),
      now
    );
    writeAuditLog(userId, 'RecyclerProfile', id, 'REGISTER_RECYCLER', {
      businessName: input.businessName,
    });
  }

  return getRecyclerProfileByUserId(userId, true)!;
}

export function updateRecyclerRates(
  userId: string,
  rates: { categoryId: string; pricePerKg: number; active: boolean }[]
): RecyclerProfileDTO {
  const db = getDb();
  const profile = db
    .prepare('SELECT id FROM recycler_profiles WHERE user_id = ?')
    .get(userId) as { id: string } | undefined;

  if (!profile) throw new Error('Complete your recycler business profile before setting rates.');
  const now = new Date().toISOString();

  for (const r of rates) {
    db.prepare(
      `INSERT INTO recycler_rates (id, recycler_id, category_id, price_per_kg, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(recycler_id, category_id) DO UPDATE SET
         price_per_kg = excluded.price_per_kg,
         active = excluded.active,
         updated_at = excluded.updated_at`
    ).run(
      `rr_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      profile.id,
      r.categoryId,
      r.pricePerKg,
      r.active ? 1 : 0,
      now
    );
  }

  writeAuditLog(userId, 'RecyclerRate', profile.id, 'UPDATE_RATE_CARD', {
    count: rates.length,
  });

  return getRecyclerProfileByUserId(userId, true)!;
}

export function listAllRecyclersForAdmin(): RecyclerProfileDTO[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rp.*, u.name as user_name, u.phone as user_phone
       FROM recycler_profiles rp
       JOIN users u ON u.id = rp.user_id
       ORDER BY CASE rp.verification_status WHEN 'PENDING' THEN 0 ELSE 1 END, rp.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => mapRecyclerRow(r, true));
}

export async function verifyRecyclerByAdmin(
  adminId: string,
  recyclerId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason?: string
): Promise<RecyclerProfileDTO> {
  const db = getDb();
  const profile = db
    .prepare('SELECT * FROM recycler_profiles WHERE id = ?')
    .get(recyclerId) as Record<string, unknown> | undefined;
  if (!profile) throw new Error('Recycler profile not found.');

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE recycler_profiles
     SET verification_status = ?, rejection_reason = ?, verified_at = ?
     WHERE id = ?`
  ).run(
    decision,
    decision === 'REJECTED' ? reason || 'Registration could not be verified on CPCB EPR portal.' : null,
    decision === 'APPROVED' ? now : null,
    recyclerId
  );

  writeAuditLog(adminId, 'RecyclerProfile', recyclerId, `VERIFY_${decision}`, {
    reason: reason || null,
  });

  await createNotification({
    userId: String(profile.user_id),
    type: decision === 'APPROVED' ? 'RECYCLER_APPROVED' : 'RECYCLER_REJECTED',
    payload: {
      recyclerId,
      businessName: String(profile.business_name),
      reason: reason || null,
    },
    smsText:
      decision === 'APPROVED'
        ? `Kabadiwala Connect: ${profile.business_name} is now verified! You can accept e-waste bookings.`
        : `Kabadiwala Connect: Verification for ${profile.business_name} was declined. Reason: ${reason || 'Check documents'}.`,
  });

  return getRecyclerProfileById(recyclerId, true)!;
}

export function upsertCategoryByAdmin(
  adminId: string,
  input: {
    id?: string;
    slug: string;
    name: string;
    nameHi: string;
    nameKn: string;
    hazardous: boolean;
    iconKey: string;
    co2FactorPerKg: number;
    active: boolean;
    referenceRatePerKg?: number;
  }
): CategoryDTO {
  const db = getDb();
  const id = input.id || `cat_${input.slug.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

  db.prepare(
    `INSERT INTO categories (id, slug, name, name_hi, name_kn, hazardous, icon_key, co2_factor_per_kg, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       name_hi = excluded.name_hi,
       name_kn = excluded.name_kn,
       hazardous = excluded.hazardous,
       icon_key = excluded.icon_key,
       co2_factor_per_kg = excluded.co2_factor_per_kg,
       active = excluded.active`
  ).run(
    id,
    input.slug,
    input.name,
    input.nameHi,
    input.nameKn,
    input.hazardous ? 1 : 0,
    input.iconKey,
    input.co2FactorPerKg,
    input.active ? 1 : 0
  );

  if (input.referenceRatePerKg !== undefined && input.referenceRatePerKg > 0) {
    setReferenceRateByAdmin(adminId, id, input.referenceRatePerKg);
  }

  writeAuditLog(adminId, 'Category', id, 'UPSERT_CATEGORY', { name: input.name });
  return listCategories(true).find((c) => c.id === id)!;
}

export function setReferenceRateByAdmin(adminId: string, categoryId: string, pricePerKg: number): void {
  const db = getDb();
  const id = `ref_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  db.prepare(
    'INSERT INTO reference_rates (id, category_id, price_per_kg, effective_from, set_by_admin_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, categoryId, pricePerKg, new Date().toISOString(), adminId);
  writeAuditLog(adminId, 'ReferenceRate', categoryId, 'UPDATE_REFERENCE_RATE', { pricePerKg });
}
