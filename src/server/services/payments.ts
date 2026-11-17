import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { assertBookingTransition, assertLotTransition } from '../../shared/format.ts';
import type { BookingDTO, BookingStatus, DisputeDTO, PaymentMethod } from '../../shared/types.ts';
import { getDb, writeAuditLog } from '../db.ts';
import { createNotification } from '../notifications.ts';
import { getBookingByIdForUser } from './bookings.ts';

export async function markPaymentByRecycler(
  recyclerUserId: string,
  bookingId: string,
  input: { method: PaymentMethod; upiRef?: string }
): Promise<BookingDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.recycler_id) !== recyclerUserId) {
    const err = new Error('Only the assigned recycler can mark payment.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
  const currentStatus = row.status as BookingStatus;
  assertBookingTransition(currentStatus, 'PAID');

  const hRow = db.prepare('SELECT net_amount FROM handovers WHERE booking_id = ?').get(bookingId) as
    | { net_amount: number }
    | undefined;
  if (!hRow) {
    throw new Error('Handover weigh-in must be confirmed before payment.');
  }

  const cleanRef = (input.upiRef || '').trim();
  if (input.method === 'UPI' && cleanRef.length < 4) {
    const err = new Error('Enter a valid UPI transaction / UTR reference (min 4 characters).') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const amount = Number(hRow.net_amount);

  db.prepare(
    `INSERT INTO payments (
      id, booking_id, method, amount, upi_ref, recycler_marked_at, collector_confirmed_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'MARKED_PAID')
    ON CONFLICT(booking_id) DO UPDATE SET
      method = excluded.method,
      amount = excluded.amount,
      upi_ref = excluded.upi_ref,
      recycler_marked_at = excluded.recycler_marked_at,
      status = 'MARKED_PAID'`
  ).run(
    `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    bookingId,
    input.method,
    amount,
    input.method === 'UPI' ? cleanRef : null,
    nowIso
  );

  db.prepare(`UPDATE bookings SET status = 'PAID', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);

  writeAuditLog(recyclerUserId, 'Payment', bookingId, 'PAYMENT_MARKED', {
    method: input.method,
    amount,
    upiRef: input.method === 'UPI' ? cleanRef : null,
  });

  await createNotification({
    userId: String(row.collector_id),
    type: 'PAYMENT_MARKED',
    payload: { bookingId, method: input.method, amount, upiRef: cleanRef || null },
    smsText: `Kabadiwala Connect: Recycler marked Rs.${amount} (${input.method}) as paid for ${bookingId}. Tap Received in the app once you verify the money.`,
  });

  return (await getBookingByIdForUser(bookingId, recyclerUserId, 'RECYCLER'))!;
}

export function finalizeCompletedLedgerEntry(bookingId: string): void {
  const db = getDb();
  const bRow = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  const hRow = db.prepare('SELECT * FROM handovers WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  const rRow = db.prepare('SELECT id, issued_at FROM receipts WHERE booking_id = ?').get(bookingId) as
    | { id: string; issued_at: string }
    | undefined;
  const pRow = db.prepare('SELECT method FROM payments WHERE booking_id = ?').get(bookingId) as
    | { method: PaymentMethod }
    | undefined;

  if (!bRow || !hRow || !rRow || !pRow) return;

  const existing = db
    .prepare('SELECT id FROM ledger_entries WHERE receipt_id = ?')
    .get(rRow.id) as { id: string } | undefined;
  if (existing) return;

  const rateSnapshot = JSON.parse(String(bRow.rate_snapshot || '{}')) as BookingDTO['rateSnapshot'];
  const weighedItems = JSON.parse(String(hRow.weighed_items || '[]')) as {
    categoryId: string;
    weighedKg: number;
  }[];

  let totalKg = 0;
  let co2SavedKg = 0;
  for (const wi of weighedItems) {
    totalKg += Number(wi.weighedKg);
    const factor = rateSnapshot[wi.categoryId]?.co2FactorPerKg || 2.0;
    co2SavedKg += Number(wi.weighedKg) * factor;
  }

  db.prepare(
    `INSERT INTO ledger_entries (
      id, collector_id, receipt_id, gross_amount, transport_cost, net_amount, kg, co2_saved_kg, date, method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    String(bRow.collector_id),
    rRow.id,
    Number(hRow.gross_amount),
    Number(hRow.transport_cost),
    Number(hRow.net_amount),
    Math.round(totalKg * 100) / 100,
    Math.round(co2SavedKg * 100) / 100,
    new Date().toISOString(),
    pRow.method
  );
}

export async function confirmPaymentByCollector(
  collectorId: string,
  bookingId: string,
  action: 'RECEIVED' | 'NOT_RECEIVED',
  reason?: string
): Promise<BookingDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Booking not found.');
  if (String(row.collector_id) !== collectorId) {
    const err = new Error('Only the collector can confirm payment receipt.') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const pRow = db.prepare('SELECT * FROM payments WHERE booking_id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!pRow || String(pRow.status) !== 'MARKED_PAID') {
    const err = new Error('Recycler has not marked payment yet.') as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }

  const nowIso = new Date().toISOString();

  if (action === 'NOT_RECEIVED') {
    assertBookingTransition(row.status as BookingStatus, 'DISPUTED');
    const cleanReason = (reason || '').trim() || 'Collector reported payment not received.';

    db.prepare(`UPDATE payments SET status = 'DISPUTED' WHERE booking_id = ?`).run(bookingId);
    db.prepare(`UPDATE bookings SET status = 'DISPUTED', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);
    db.prepare(
      `INSERT INTO disputes (id, booking_id, raised_by_id, reason, status, resolution_note, resolved_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'OPEN', NULL, NULL, ?, ?)`
    ).run(`dsp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, bookingId, collectorId, cleanReason, nowIso, nowIso);

    writeAuditLog(collectorId, 'Dispute', bookingId, 'PAYMENT_DISPUTE_OPENED', { reason: cleanReason });

    await createNotification({
      userId: String(row.recycler_id),
      type: 'DISPUTE_OPENED',
      payload: { bookingId, reason: cleanReason },
      smsText: `Kabadiwala Connect: Payment dispute raised on ${bookingId}. Admin is reviewing: ${cleanReason}`,
    });

    return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
  }

  assertBookingTransition(row.status as BookingStatus, 'COMPLETED');
  const lotRow = db.prepare('SELECT status FROM lots WHERE id = ?').get(String(row.lot_id)) as {
    status: 'DRAFT' | 'LISTED' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';
  };
  assertLotTransition(lotRow.status, 'COMPLETED');

  db.prepare(`UPDATE payments SET status = 'CONFIRMED', collector_confirmed_at = ? WHERE booking_id = ?`).run(
    nowIso,
    bookingId
  );
  db.prepare(`UPDATE bookings SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(nowIso, bookingId);
  db.prepare(`UPDATE lots SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(nowIso, String(row.lot_id));

  finalizeCompletedLedgerEntry(bookingId);

  writeAuditLog(collectorId, 'Booking', bookingId, 'PAYMENT_CONFIRMED_COMPLETED', {
    lotId: String(row.lot_id),
    amount: Number(pRow.amount),
  });

  await createNotification({
    userId: String(row.recycler_id),
    type: 'PAYMENT_CONFIRMED',
    payload: { bookingId, amount: Number(pRow.amount) },
  });

  return (await getBookingByIdForUser(bookingId, collectorId, 'COLLECTOR'))!;
}

export async function generateUpiQrDataUrl(upiDeepLink: string): Promise<string> {
  return QRCode.toDataURL(upiDeepLink, { margin: 1, width: 220 });
}

export function listDisputesForAdmin(): (DisputeDTO & {
  lotId: string;
  collectorName: string;
  recyclerBusinessName: string;
  bookingStatus: string;
  netAmount: number;
})[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.*, u.name as raised_by_name, b.lot_id, b.status as booking_status,
              col.name as collector_name, rp.business_name as recycler_business_name,
              COALESCE(h.net_amount, b.estimated_total - b.transport_cost) as net_amount
       FROM disputes d
       JOIN users u ON u.id = d.raised_by_id
       JOIN bookings b ON b.id = d.booking_id
       JOIN users col ON col.id = b.collector_id
       JOIN recycler_profiles rp ON rp.user_id = b.recycler_id
       LEFT JOIN handovers h ON h.booking_id = b.id
       ORDER BY CASE d.status WHEN 'OPEN' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END, d.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    bookingId: String(r.booking_id),
    raisedById: String(r.raised_by_id),
    raisedByName: String(r.raised_by_name),
    reason: String(r.reason),
    status: r.status as DisputeDTO['status'],
    resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
    resolvedById: r.resolved_by_id ? String(r.resolved_by_id) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lotId: String(r.lot_id),
    collectorName: String(r.collector_name),
    recyclerBusinessName: String(r.recycler_business_name),
    bookingStatus: String(r.booking_status),
    netAmount: Number(r.net_amount),
  }));
}

export async function resolveDisputeByAdmin(
  adminId: string,
  disputeId: string,
  input: {
    status: 'RESOLVED' | 'DISMISSED';
    resolutionNote: string;
    bookingOutcome?: 'COMPLETED' | 'CANCELLED' | 'HANDED_OVER';
  }
): Promise<DisputeDTO> {
  const db = getDb();
  const dRow = db.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId) as
    | Record<string, unknown>
    | undefined;
  if (!dRow) throw new Error('Dispute not found.');

  const bookingId = String(dRow.booking_id);
  const bRow = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as
    | Record<string, unknown>
    | undefined;
  if (!bRow) throw new Error('Booking not found.');

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE disputes SET status = ?, resolution_note = ?, resolved_by_id = ?, updated_at = ? WHERE id = ?`
  ).run(input.status, input.resolutionNote.trim(), adminId, nowIso, disputeId);

  if (input.bookingOutcome && String(bRow.status) === 'DISPUTED') {
    assertBookingTransition('DISPUTED', input.bookingOutcome);
    db.prepare(`UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?`).run(
      input.bookingOutcome,
      nowIso,
      bookingId
    );
    if (input.bookingOutcome === 'COMPLETED') {
      db.prepare(`UPDATE payments SET status = 'CONFIRMED', collector_confirmed_at = ? WHERE booking_id = ?`).run(
        nowIso,
        bookingId
      );
      db.prepare(`UPDATE lots SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(
        nowIso,
        String(bRow.lot_id)
      );
      finalizeCompletedLedgerEntry(bookingId);
    } else if (input.bookingOutcome === 'CANCELLED') {
      db.prepare(`UPDATE lots SET status = 'LISTED', updated_at = ? WHERE id = ?`).run(
        nowIso,
        String(bRow.lot_id)
      );
    }
  }

  writeAuditLog(adminId, 'Dispute', disputeId, `DISPUTE_${input.status}`, {
    bookingId,
    bookingOutcome: input.bookingOutcome || null,
    resolutionNote: input.resolutionNote,
  });

  await Promise.all([
    createNotification({
      userId: String(bRow.collector_id),
      type: 'DISPUTE_UPDATED',
      payload: { disputeId, bookingId, status: input.status, resolutionNote: input.resolutionNote },
    }),
    createNotification({
      userId: String(bRow.recycler_id),
      type: 'DISPUTE_UPDATED',
      payload: { disputeId, bookingId, status: input.status, resolutionNote: input.resolutionNote },
    }),
  ]);

  return listDisputesForAdmin().find((d) => d.id === disputeId)!;
}
