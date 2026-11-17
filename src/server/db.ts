import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(DATA_DIR, 'kabadiwala.db');

declare global {
  var _kcDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (!global._kcDb) {
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db);
    global._kcDb = db;
  }
  return global._kcDb;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('COLLECTOR', 'RECYCLER', 'ADMIN')),
      language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'hi', 'kn')),
      area_label TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      upi_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
      consent_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recycler_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      authorisation_doc_urls TEXT NOT NULL DEFAULT '[]',
      verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
      rejection_reason TEXT,
      verified_at TEXT,
      registration_expiry TEXT NOT NULL,
      service_radius_km REAL NOT NULL DEFAULT 15,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      address TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'BOTH' CHECK(mode IN ('PICKUP', 'DELIVERY', 'BOTH')),
      min_qty_kg REAL NOT NULL DEFAULT 5,
      accepts_hazardous INTEGER NOT NULL DEFAULT 0,
      slot_rules TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_hi TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      hazardous INTEGER NOT NULL DEFAULT 0,
      icon_key TEXT NOT NULL,
      co2_factor_per_kg REAL NOT NULL DEFAULT 1.8,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reference_rates (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      price_per_kg REAL NOT NULL,
      effective_from TEXT NOT NULL,
      set_by_admin_id TEXT NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recycler_rates (
      id TEXT PRIMARY KEY,
      recycler_id TEXT NOT NULL REFERENCES recycler_profiles(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      price_per_kg REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE(recycler_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS lots (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'LISTED', 'BOOKED', 'COMPLETED', 'CANCELLED')),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      area_label TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lot_items (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id),
      declared_kg REAL NOT NULL,
      UNIQUE(lot_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS lot_photos (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL REFERENCES lots(id),
      recycler_id TEXT NOT NULL REFERENCES users(id),
      collector_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED', 'ACCEPTED', 'HANDED_OVER', 'PAID', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'DISPUTED')),
      mode TEXT NOT NULL CHECK(mode IN ('PICKUP', 'DELIVERY')),
      slot_start TEXT NOT NULL,
      slot_end TEXT NOT NULL,
      rate_snapshot TEXT NOT NULL,
      estimated_total REAL NOT NULL,
      transport_cost REAL NOT NULL DEFAULT 0,
      handover_code_hash TEXT NOT NULL,
      handover_code_enc TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handovers (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      weighed_items TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      transport_cost REAL NOT NULL,
      net_amount REAL NOT NULL,
      collector_confirmed_at TEXT,
      recycler_confirmed_at TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy_m REAL NOT NULL,
      photo_url TEXT NOT NULL,
      confirmed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),
      payload TEXT NOT NULL,
      signature TEXT NOT NULL,
      pdf_url TEXT NOT NULL,
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),
      method TEXT NOT NULL CHECK(method IN ('CASH', 'UPI')),
      amount REAL NOT NULL,
      upi_ref TEXT,
      recycler_marked_at TEXT,
      collector_confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'MARKED_PAID', 'CONFIRMED', 'DISPUTED'))
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      collector_id TEXT NOT NULL REFERENCES users(id),
      receipt_id TEXT UNIQUE NOT NULL REFERENCES receipts(id),
      gross_amount REAL NOT NULL,
      transport_cost REAL NOT NULL,
      net_amount REAL NOT NULL,
      kg REAL NOT NULL,
      co2_saved_kg REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('CASH', 'UPI'))
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      raised_by_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')),
      resolution_note TEXT,
      resolved_by_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      meta TEXT NOT NULL,
      at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_rate_limits (
      phone TEXT PRIMARY KEY,
      window_start TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function writeAuditLog(
  actorId: string,
  entity: string,
  entityId: string,
  action: string,
  meta: Record<string, unknown>
): void {
  const db = getDb();
  const id = `aud_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db.prepare(
    'INSERT INTO audit_logs (id, actor_id, entity, entity_id, action, meta, at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, actorId, entity, entityId, action, JSON.stringify(meta), new Date().toISOString());
}

export function getSettingNumber(key: string, fallback: number): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
