import crypto from 'node:crypto';
import {
  EPR_DISCLAIMER,
  assertBookingTransition,
  assertLotTransition,
} from '../../shared/format.ts';
import type {
  BookingDTO,
  BookingMode,
  BookingStatus,
  DisputeDTO,
  HandoverDTO,
  PaymentDTO,
  ReceiptDTO,
  ReceiptPayload,
  WeighedItem,
} from '../../shared/types.ts';
import { getDb, getSettingNumber, writeAuditLog } from '../db.ts';
import { createNotification } from '../notifications.ts';
import { getLotById } from './lots.ts';
import { computeTransportCost, findMatchesForLot } from './matching.ts';
import { signReceiptPayload, verifyReceiptSignature } from './receipts.ts';

function getCodeSecret(): string {
  return process.env.SESSION_SECRET || 'dev-session-secret-change-in-production';
}

function hashHandoverCode(bookingId: string, code: string): string {
  return crypto.createHmac('sha256', getCodeSecret()).update(`${bookingId}:${code}`).digest('hex');
}

function encryptHandoverCode(bookingId: string, code: string): string {
  const key = crypto.createHash('sha256').update(getCodeSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(`${bookingId}:${code}`, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptHandoverCode(bookingId: string, encVal: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = encVal.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = crypto.createHash('sha256').update(getCodeSecret()).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    if (!dec.startsWith(`${bookingId}:`)) return null;
    return dec.slice(bookingId.length + 1);
  } catch {
    return null;
  }
}

export function shouldRevealPhones(status: BookingStatus): boolean {
  return (
    status === 'ACCEPTED' ||
    status === 'HANDED_OVER' ||
    status === 'PAID' ||
    status === 'COMPLETED' ||
    status === 'DISPUTED'
  );
}

export async function expireStaleBookings(): Promise<number> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const stale = db
    .prepare(
      `SELECT id, lot_id, collector_id, recycler_id FROM bookings
       WHERE status = 'REQUESTED' AND expires_at <= ?`
    )
    .all(nowIso) as { id: string; lot_id: string; collector_id: string; recycler_id: string }[];

  for (const b of stale) {
    db.prepare(`UPDATE bookings SET status = 'EXPIRED', updated_at = ? WHERE id = ?`).run(nowIso, b.id);
    db.prepare(`UPDATE lots SET status = 'LISTED', updated_at = ? WHERE id = ? AND status = 'BOOKED'`).run(
      nowIso,
      b.lot_id
    );
    writeAuditLog('system', 'Booking', b.id, 'AUTO_EXPIRE', { lotId: b.lot_id });
    await createNotification({
      userId: b.collector_id,
      type: 'BOOKING_EXPIRED',
      payload: { bookingId: b.id, lotId: b.lot_id },
      smsText: `Kabadiwala Connect: Your booking request ${b.id} expired after no response. Your lot is listed again—choose another recycler.`,
    });
  }
  return stale.length;
}

export function mapBookingRow(
  row: Record<string, unknown>,
  viewerRole: 'COLLECTOR' | 'RECYCLER' | 'ADMIN',
  includeNested = true
): BookingDTO {
  const db = getDb();
  const bookingId = String(row.id);
  const status = row.status as BookingStatus;
  const revealPhones = shouldRevealPhones(status);

  const collector = db
    .prepare('SELECT name, area_label, phone, upi_id FROM users WHERE id = ?')
    .get(String(row.collector_id)) as
    | { name: string; area_label: string; phone: string; upi_id: string | null }
    | undefined;

  const recycler = db
    .prepare(
      `SELECT rp.business_name, rp.registration_number, rp.address, u.phone
       FROM recycler_profiles rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.user_id = ?`
    )
    .get(String(row.recycler_id)) as
    | { business_name: string; registration_number: string; address: string; phone: string }
    | undefined;

  let handover: HandoverDTO | null = null;
  const hRow = db.prepare('SELECT * FROM handovers WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (hRow) {
    handover = {
      id: String(hRow.id),
      bookingId: String(hRow.booking_id),
      weighedItems: JSON.parse(String(hRow.weighed_items || '[]')) as WeighedItem[],
      grossAmount: Number(hRow.gross_amount),
      transportCost: Number(hRow.transport_cost),
      netAmount: Number(hRow.net_amount),
      collectorConfirmedAt: hRow.collector_confirmed_at ? String(hRow.collector_confirmed_at) : null,
      recyclerConfirmedAt: hRow.recycler_confirmed_at ? String(hRow.recycler_confirmed_at) : null,
      lat: Number(hRow.lat),
      lng: Number(hRow.lng),
      accuracyM: Number(hRow.accuracy_m),
      photoUrl: String(hRow.photo_url),
      confirmedAt: hRow.confirmed_at ? String(hRow.confirmed_at) : null,
    };
  }

  let receipt: ReceiptDTO | null = null;
  const rRow = db.prepare('SELECT * FROM receipts WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (rRow) {
    const payload = JSON.parse(String(rRow.payload)) as ReceiptPayload;
    const signature = String(rRow.signature);
    receipt = {
      id: String(rRow.id),
      bookingId,
      payload,
      signature,
      pdfUrl: String(rRow.pdf_url),
      issuedAt: String(rRow.issued_at),
      verified: verifyReceiptSignature(payload, signature),
    };
  }

  let payment: PaymentDTO | null = null;
  const pRow = db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (pRow) {
    const collectorUpi = collector?.upi_id || null;
    const amount = Number(pRow.amount);
    const upiDeepLink =
      collectorUpi && amount > 0
        ? `upi://pay?pa=${encodeURIComponent(collectorUpi)}&pn=${encodeURIComponent(
            collector?.name || 'Collector'
          )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Kabadiwala ${bookingId}`)}`
        : null;
    payment = {
      id: String(pRow.id),
      bookingId,
      method: pRow.method as PaymentDTO['method'],
      amount,
      upiRef: pRow.upi_ref ? String(pRow.upi_ref) : null,
      upiDeepLink,
      collectorUpiId: collectorUpi,
      recyclerMarkedAt: pRow.recycler_marked_at ? String(pRow.recycler_marked_at) : null,
      collectorConfirmedAt: pRow.collector_confirmed_at ? String(pRow.collector_confirmed_at) : null,
      status: pRow.status as PaymentDTO['status'],
    };
  }

  let dispute: DisputeDTO | null = null;
  const dRow = db
    .prepare(
      `SELECT d.*, u.name as raised_by_name FROM disputes d
       JOIN users u ON u.id = d.raised_by_id
       WHERE d.booking_id = ? ORDER BY d.created_at DESC LIMIT 1`
    )
    .get(bookingId) as Record<string, unknown> | undefined;
  if (dRow) {
    dispute = {
      id: String(dRow.id),
      bookingId,
      raisedById: String(dRow.raised_by_id),
      raisedByName: String(dRow.raised_by_name),
      reason: String(dRow.reason),
      status: dRow.status as DisputeDTO['status'],
      resolutionNote: dRow.resolution_note ? String(dRow.resolution_note) : null,
      resolvedById: dRow.resolved_by_id ? String(dRow.resolved_by_id) : null,
      createdAt: String(dRow.created_at),
      updatedAt: String(dRow.updated_at),
    };
  }

  const handoverCode =
    viewerRole === 'COLLECTOR' || viewerRole === 'ADMIN'
      ? decryptHandoverCode(bookingId, String(row.handover_code_enc || ''))
      : null;

  return {
    id: bookingId,
    lotId: String(row.lot_id),
    recyclerId: String(row.recycler_id),
    collectorId: String(row.collector_id),
    status,
    mode: row.mode as BookingMode,
    slotStart: String(row.slot_start),
    slotEnd: String(row.slot_end),
    rateSnapshot: JSON.parse(String(row.rate_snapshot || '{}')),
    estimatedTotal: Number(row.estimated_total),
    transportCost: Number(row.transport_cost),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    handoverCode,
    collectorName: collector?.name,
    collectorArea: collector?.area_label,
    collectorPhone: revealPhones ? collector?.phone || null : null,
    collectorUpiId: collector?.upi_id || null,
    recyclerBusinessName: recycler?.business_name,
    recyclerRegistrationNumber: recycler?.registration_number,
    recyclerAddress: recycler?.address,
    recyclerPhone: revealPhones ? recycler?.phone || null : null,
    lot: includeNested ? getLotById(String(row.lot_id)) || undefined : undefined,
    handover,
    receipt,
    payment,
    dispute,
  };
}

export async function getBookingByIdForUser(
  bookingId: string,
  userId: string,
  role: 'COLLECTOR' | 'RECYCLER' | 'ADMIN'
): Promise<BookingDTO | null> {
  await expireStaleBookings();
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  if (role !== 'ADMIN' && String(row.collector_id) !== userId && String(row.recycler_id) !== userId) {
    const err = new Error('Access denied to this booking.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
  return mapBookingRow(row, role, true);
}

export async function listBookingsForUser(
  userId: string,
  role: 'COLLECTOR' | 'RECYCLER' | 'ADMIN'
): Promise<BookingDTO[]> {
  await expireStaleBookings();
  const db = getDb();
  const sql =
    role === 'ADMIN'
      ? 'SELECT * FROM bookings ORDER BY created_at DESC'
      : role === 'RECYCLER'
      ? 'SELECT * FROM bookings WHERE recycler_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM bookings WHERE collector_id = ? ORDER BY created_at DESC';

  const rows = (role === 'ADMIN' ? db.prepare(sql).all() : db.prepare(sql).all(userId)) as Record<
    string,
    unknown
  >[];

  return rows.map((r) => mapBookingRow(r, role, true));
}

export async function createBooking(
  collectorId: string,
  input: {
    lotId: string;
    recyclerProfileId: string;
    mode: BookingMode;
    slotStart: string;
    slotEnd: string;
  }
): Promise<BookingDTO> {
  await expireStaleBookings();
  const db = getDb();
  const lot = getLotById(input.lotId);
  if (!lot) throw new Error('Lot not found.');
  if (lot.collectorId !== collectorId) {
    const err = new Error('You can only book recyclers for your own lots.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
  if (lot.status !== 'LISTED') {
    const err = new Error(`Lot must be LISTED before booking (currently ${lot.status}).`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const { eligible, costPerKm } = findMatchesForLot(lot.id, 'net_price');
  const match = eligible.find((m) => m.recyclerId === input.recyclerProfileId);
  if (!match) {
    const err = new Error(
      'This recycler is not eligible for your lot (check verification status, service radius, min kg, or material rates).'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const chosenMode: BookingMode =
    match.mode === 'BOTH' ? input.mode : (match.mode as BookingMode);
  const transportCost = computeTransportCost(match.distanceKm, chosenMode, costPerKm);

  const catRows = db.prepare('SELECT id, co2_factor_per_kg FROM categories').all() as {
    id: string;
    co2_factor_per_kg: number;
  }[];
  const co2ByCat = new Map(catRows.map((c) => [c.id, Number(c.co2_factor_per_kg)]));

  const rateSnapshot: BookingDTO['rateSnapshot'] = {};
  for (const pm of match.perMaterialRates) {
    rateSnapshot[pm.categoryId] = {
      categoryName: pm.categoryName,
      pricePerKg: pm.ratePerKg,
      co2FactorPerKg: co2ByCat.get(pm.categoryId) || 2.0,
    };
  }

  const bookingId = `bkg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const code = String(crypto.randomInt(1000, 9999));
  const codeHash = hashHandoverCode(bookingId, code);
  const codeEnc = encryptHandoverCode(bookingId, code);

  const expiryHours = getSettingNumber('BOOKING_EXPIRY_HOURS', 12);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryHours * 3600 * 1000).toISOString();

  assertLotTransition(lot.status, 'BOOKED');

  db.prepare(
    `INSERT INTO bookings (
      id, lot_id, recycler_id, collector_id, status, mode, slot_start, slot_end,
      rate_snapshot, estimated_total, transport_cost, handover_code_hash, handover_code_enc,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bookingId,
    lot.id,
    match.recyclerUserId,
    collectorId,
    chosenMode,
    input.slotStart,
    input.slotEnd,
    JSON.stringify(rateSnapshot),
    match.offerTotal,
    transportCost,
    codeHash,
    codeEnc,
    expiresAt,
    nowIso,
    nowIso
  );

  db.prepare(`UPDATE lots SET status = 'BOOKED', updated_at = ? WHERE id = ?`).run(nowIso, lot.id);

  writeAuditLog(collectorId, 'Booking', bookingId, 'BOOKING_REQUESTED', {
    lotId: lot.id,
    recyclerId: match.recyclerUserId,
    mode: chosenMode,
    estimatedNet: Math.max(0, match.offerTotal - transportCost),
  });

  await createNotification({
    userId: match.recyclerUserId,
    type: 'BOOKING_REQUESTED',
    payload: {
      bookingId,
      lotId: lot.id,
      totalKg: lot.totalKg,
      areaLabel: lot.areaLabel,
      expiresAt,
    },
    smsText: `Kabadiwala Connect: New ${lot.totalKg} kg e-waste booking (${bookingId}) from ${lot.areaLabel}. Accept within ${expiryHours} hrs.`,
  });

  return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
}

export async function respondToBooking(
  recyclerUserId: string,
  bookingId: string,
  decision: 'ACCEPTED' | 'DECLINED'
): Promise<BookingDTO> {
  await expireStaleBookings();
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.recycler_id) !== recyclerUserId) {
    const err = new Error('Only the assigned recycler can respond to this booking.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }

  const currentStatus = row.status as BookingStatus;
  assertBookingTransition(currentStatus, decision);

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(decision, nowIso, bookingId);

  if (decision === 'DECLINED') {
    db.prepare(`UPDATE lots SET status = 'LISTED', updated_at = ? WHERE id = ?`).run(nowIso, String(row.lot_id));
  }

  writeAuditLog(recyclerUserId, 'Booking', bookingId, `BOOKING_${decision}`, {
    lotId: String(row.lot_id),
  });

  await createNotification({
    userId: String(row.collector_id),
    type: `BOOKING_${decision}`,
    payload: { bookingId, lotId: String(row.lot_id) },
    smsText:
      decision === 'ACCEPTED'
        ? `Kabadiwala Connect: Booking ${bookingId} ACCEPTED! Contact details are now unlocked in the app.`
        : `Kabadiwala Connect: Booking ${bookingId} was declined. Your lot is back in LISTED status—choose another recycler.`,
  });

  return (await getBookingByIdForUser(bookingId, recyclerUserId, 'RECYCLER'))!;
}

export async function cancelBookingByCollector(
  collectorId: string,
  bookingId: string
): Promise<BookingDTO> {
  await expireStaleBookings();
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.collector_id) !== collectorId) {
    const err = new Error('Forbidden.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const currentStatus = row.status as BookingStatus;
  assertBookingTransition(currentStatus, 'CANCELLED');

  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);
  db.prepare(`UPDATE lots SET status = 'LISTED', updated_at = ? WHERE id = ?`).run(nowIso, String(row.lot_id));

  writeAuditLog(collectorId, 'Booking', bookingId, 'BOOKING_CANCELLED', { lotId: String(row.lot_id) });
  await createNotification({
    userId: String(row.recycler_id),
    type: 'BOOKING_CANCELLED',
    payload: { bookingId, lotId: String(row.lot_id) },
  });

  return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
}

export async function submitHandoverByRecycler(
  recyclerUserId: string,
  bookingId: string,
  input: {
    handoverCode: string;
    weighedItems: { categoryId: string; weighedKg: number }[];
    lat: number;
    lng: number;
    accuracyM: number;
    photoUrl: string;
  }
): Promise<BookingDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.recycler_id) !== recyclerUserId) {
    const err = new Error('Only the assigned recycler can submit handover weights.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
  if (String(row.status) !== 'ACCEPTED') {
    const err = new Error(`Handover can only be submitted on ACCEPTED bookings (currently ${row.status}).`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 409;
    throw err;
  }

  const expectedHash = String(row.handover_code_hash);
  const candidateHash = hashHandoverCode(bookingId, input.handoverCode.trim());
  if (
    expectedHash.length !== candidateHash.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(candidateHash))
  ) {
    const err = new Error('Incorrect 4-digit handover code. Ask the collector to read it from their booking card.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const lot = getLotById(String(row.lot_id));
  if (!lot) throw new Error('Lot missing.');

  const rateSnapshot = JSON.parse(String(row.rate_snapshot || '{}')) as BookingDTO['rateSnapshot'];
  const weighedMap = new Map(input.weighedItems.map((w) => [w.categoryId, Number(w.weighedKg)]));

  const weighedItems: WeighedItem[] = [];
  let grossAmount = 0;

  for (const item of lot.items) {
    const weighedKg = Math.round((weighedMap.get(item.categoryId) ?? item.declaredKg) * 100) / 100;
    const snap = rateSnapshot[item.categoryId];
    const ratePerKg = snap ? snap.pricePerKg : 0;
    const lineTotal = Math.round(weighedKg * ratePerKg);
    grossAmount += lineTotal;
    weighedItems.push({
      categoryId: item.categoryId,
      categoryName: snap?.categoryName || item.categoryName || item.categoryId,
      declaredKg: item.declaredKg,
      weighedKg,
      ratePerKg,
      lineTotal,
    });
  }

  const transportCost = Number(row.transport_cost);
  const netAmount = Math.max(0, grossAmount - transportCost);
  const nowIso = new Date().toISOString();

  db.prepare(
    `INSERT INTO handovers (
      id, booking_id, weighed_items, gross_amount, transport_cost, net_amount,
      collector_confirmed_at, recycler_confirmed_at, lat, lng, accuracy_m, photo_url, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(booking_id) DO UPDATE SET
      weighed_items = excluded.weighed_items,
      gross_amount = excluded.gross_amount,
      net_amount = excluded.net_amount,
      recycler_confirmed_at = excluded.recycler_confirmed_at,
      lat = excluded.lat,
      lng = excluded.lng,
      accuracy_m = excluded.accuracy_m,
      photo_url = excluded.photo_url`
  ).run(
    `hnd_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    bookingId,
    JSON.stringify(weighedItems),
    grossAmount,
    transportCost,
    netAmount,
    nowIso,
    input.lat,
    input.lng,
    input.accuracyM,
    input.photoUrl
  );

  writeAuditLog(recyclerUserId, 'Handover', bookingId, 'HANDOVER_SUBMITTED', {
    grossAmount,
    netAmount,
    weighedCount: weighedItems.length,
  });

  await createNotification({
    userId: String(row.collector_id),
    type: 'HANDOVER_SUBMITTED',
    payload: { bookingId, netAmount, grossAmount },
    smsText: `Kabadiwala Connect: Weigh-in submitted for ${bookingId} (Net Rs.${netAmount}). Open the app to confirm and generate your receipt.`,
  });

  return (await getBookingByIdForUser(bookingId, recyclerUserId, 'RECYCLER'))!;
}

export async function confirmHandoverByCollector(
  collectorId: string,
  bookingId: string,
  action: 'CONFIRM' | 'DISPUTE',
  disputeReason?: string
): Promise<BookingDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.collector_id) !== collectorId) {
    const err = new Error('Only the lot collector can confirm handover.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const hRow = db.prepare('SELECT * FROM handovers WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!hRow || !hRow.recycler_confirmed_at) {
    const err = new Error('Recycler has not submitted weigh-in details yet.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();

  if (action === 'DISPUTE') {
    assertBookingTransition(row.status as BookingStatus, 'DISPUTED');
    const reason = (disputeReason || '').trim() || 'Disagreement on weighed quantities at handover.';
    db.prepare(`UPDATE bookings SET status = 'DISPUTED', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);
    db.prepare(
      `INSERT INTO disputes (id, booking_id, raised_by_id, reason, status, resolution_note, resolved_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'OPEN', NULL, NULL, ?, ?)`
    ).run(`dsp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, bookingId, collectorId, reason, nowIso, nowIso);

    writeAuditLog(collectorId, 'Booking', bookingId, 'HANDOVER_DISPUTED', { reason });
    await createNotification({
      userId: String(row.recycler_id),
      type: 'BOOKING_DISPUTED',
      payload: { bookingId, reason },
    });
    return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
  }

  assertBookingTransition(row.status as BookingStatus, 'HANDED_OVER');

  db.prepare(
    `UPDATE handovers SET collector_confirmed_at = ?, confirmed_at = ? WHERE booking_id = ?`
  ).run(nowIso, nowIso, bookingId);
  db.prepare(`UPDATE bookings SET status = 'HANDED_OVER', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);

  const collector = db.prepare('SELECT name, area_label FROM users WHERE id = ?').get(collectorId) as {
    name: string;
    area_label: string;
  };
  const recycler = db
    .prepare('SELECT business_name, registration_number, address FROM recycler_profiles WHERE user_id = ?')
    .get(String(row.recycler_id)) as {
    business_name: string;
    registration_number: string;
    address: string;
  };
  const lot = getLotById(String(row.lot_id));
  const weighedItems = JSON.parse(String(hRow.weighed_items)) as WeighedItem[];
  const totalDeclaredKg = weighedItems.reduce((s, i) => s + i.declaredKg, 0);
  const totalWeighedKg = weighedItems.reduce((s, i) => s + i.weighedKg, 0);

  const receiptCount = (db.prepare('SELECT COUNT(*) as cnt FROM receipts').get() as { cnt: number }).cnt;
  const receiptId = `KWC-${new Date().getFullYear()}-${String(receiptCount + 1).padStart(4, '0')}`;

  const payload: ReceiptPayload = {
    receiptId,
    bookingId,
    issuedAt: nowIso,
    collectorName: collector.name,
    collectorArea: collector.area_label,
    recyclerBusinessName: recycler.business_name,
    recyclerRegistrationNumber: recycler.registration_number,
    recyclerAddress: recycler.address,
    mode: row.mode as BookingMode,
    items: weighedItems,
    totalDeclaredKg: Math.round(totalDeclaredKg * 100) / 100,
    totalWeighedKg: Math.round(totalWeighedKg * 100) / 100,
    grossAmount: Number(hRow.gross_amount),
    transportCost: Number(hRow.transport_cost),
    netAmount: Number(hRow.net_amount),
    lotPhotoUrls: lot?.photos.map((p) => p.url) || [],
    handoverPhotoUrl: String(hRow.photo_url),
    handoverLocation: {
      lat: Number(hRow.lat),
      lng: Number(hRow.lng),
      accuracyM: Number(hRow.accuracy_m),
    },
    disclaimer: EPR_DISCLAIMER,
  };

  const signature = signReceiptPayload(payload);
  db.prepare(
    `INSERT INTO receipts (id, booking_id, payload, signature, pdf_url, issued_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(receiptId, bookingId, JSON.stringify(payload), signature, `/api/receipts/${receiptId}/pdf`, nowIso);

  writeAuditLog(collectorId, 'Receipt', receiptId, 'RECEIPT_ISSUED', {
    bookingId,
    netAmount: payload.netAmount,
    totalWeighedKg: payload.totalWeighedKg,
  });

  await createNotification({
    userId: String(row.recycler_id),
    type: 'RECEIPT_ISSUED',
    payload: { bookingId, receiptId, netAmount: payload.netAmount },
    smsText: `Kabadiwala Connect: Collector confirmed handover for ${bookingId}. Receipt ${receiptId} issued. Please settle Rs.${payload.netAmount} via Cash or UPI.`,
  });

  return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
}
