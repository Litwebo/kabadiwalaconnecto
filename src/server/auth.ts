import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserDTO, UserRole } from '../shared/types.ts';
import { getDb, writeAuditLog } from './db.ts';
import { getSmsProvider } from './sms.ts';

export const SESSION_COOKIE_NAME = 'kc_session';
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const OTP_RATE_LIMIT_MAX = 5;

export interface AuthenticatedRequest extends Request {
  currentUser?: UserDTO;
}

export function isDemoModeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    return false;
  }
  return process.env.DEMO_MODE !== 'false';
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'dev-session-secret-change-in-production';
}

export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (input.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  throw new Error('Enter a valid 10-digit Indian mobile number.');
}

function hashOtp(phone: string, code: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(`${phone}:${code}`).digest('hex');
}

function signOtpToken(phone: string, codeHash: string, expMs: number): string {
  const payload = Buffer.from(JSON.stringify({ phone, codeHash, expMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(`otp:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyOtpToken(
  token: string | undefined,
  phone: string
): { codeHash: string; expMs: number } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(`otp:${payload}`).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      phone: string;
      codeHash: string;
      expMs: number;
    };
    if (parsed.phone !== phone) return null;
    return { codeHash: parsed.codeHash, expMs: parsed.expMs };
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string, role: UserRole): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ uid: userId, role, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { uid: string; role: UserRole } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      role: UserRole;
      exp: number;
    };
    if (!parsed.uid || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: parsed.uid, role: parsed.role };
  } catch {
    return null;
  }
}

export function extractSessionToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || undefined;
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, req?: Request): void {
  const isHttps =
    Boolean(req?.secure) ||
    req?.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const isHttps =
    Boolean(req?.secure) ||
    req?.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export function mapUserRow(row: Record<string, unknown>): UserDTO {
  return {
    id: String(row.id),
    phone: String(row.phone),
    name: String(row.name),
    role: row.role as UserRole,
    language: (row.language as 'en' | 'hi' | 'kn') || 'en',
    areaLabel: String(row.area_label),
    lat: Number(row.lat),
    lng: Number(row.lng),
    upiId: row.upi_id ? String(row.upi_id) : null,
    status: row.status as UserDTO['status'],
    consentAt: row.consent_at ? String(row.consent_at) : null,
    createdAt: String(row.created_at),
  };
}

export function getUserById(id: string): UserDTO | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE id = ? AND status != 'DELETED'")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const verified = token ? verifySessionToken(token) : null;
  if (!verified) {
    res.status(401).json({ error: 'Please sign in with your mobile number to continue.' });
    return;
  }
  const user = getUserById(verified.uid);
  if (!user || user.status !== 'ACTIVE') {
    res.status(401).json({ error: 'Your account session is inactive. Please sign in again.' });
    return;
  }
  req.currentUser = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: 'You do not have permission to access this resource.' });
      return;
    }
    next();
  };
}

export async function requestPhoneOtp(
  rawPhone: string
): Promise<{ expiresInSec: number; otpToken: string; devHint?: string }> {
  const phone = normalizeIndianPhone(rawPhone);
  const db = getDb();
  const now = Date.now();

  const limitRow = db.prepare('SELECT * FROM otp_rate_limits WHERE phone = ?').get(phone) as
    | { phone: string; window_start: string; count: number }
    | undefined;

  if (limitRow) {
    const windowStart = new Date(limitRow.window_start).getTime();
    if (now - windowStart < OTP_RATE_LIMIT_WINDOW_MS) {
      if (limitRow.count >= OTP_RATE_LIMIT_MAX) {
        throw new Error('Too many OTP requests. Please wait 10 minutes and try again.');
      }
      db.prepare('UPDATE otp_rate_limits SET count = count + 1 WHERE phone = ?').run(phone);
    } else {
      db.prepare('UPDATE otp_rate_limits SET window_start = ?, count = 1 WHERE phone = ?').run(
        new Date(now).toISOString(),
        phone
      );
    }
  } else {
    db.prepare('INSERT INTO otp_rate_limits (phone, window_start, count) VALUES (?, ?, 1)').run(
      phone,
      new Date(now).toISOString()
    );
  }

  const isDev = process.env.NODE_ENV !== 'production' || isDemoModeEnabled();
  const otp = isDev ? '123456' : String(crypto.randomInt(100000, 999999));
  const codeHash = hashOtp(phone, otp);
  const expMs = now + OTP_EXPIRY_MINUTES * 60 * 1000;
  const expiresAt = new Date(expMs).toISOString();

  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
  db.prepare(
    'INSERT INTO otp_codes (id, phone, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(`otp_${crypto.randomUUID().slice(0, 12)}`, phone, codeHash, expiresAt, new Date(now).toISOString());

  const sms = getSmsProvider();
  await sms.send({
    to: phone,
    body: `Your Kabadiwala Connect OTP is ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share it.`,
    templateKey: 'otp_login',
  });

  return {
    expiresInSec: OTP_EXPIRY_MINUTES * 60,
    otpToken: signOtpToken(phone, codeHash, expMs),
    ...(isDev ? { devHint: 'Dev OTP: 123456' } : {}),
  };
}

export function verifyPhoneOtp(params: {
  rawPhone: string;
  code: string;
  otpToken?: string;
  name?: string;
  role?: 'COLLECTOR' | 'RECYCLER';
  areaLabel?: string;
  lat?: number;
  lng?: number;
  consentAccepted?: boolean;
}): { user: UserDTO; isNewUser: boolean } {
  const phone = normalizeIndianPhone(params.rawPhone);
  const cleanCode = params.code.trim();
  const db = getDb();
  const otpRow = db
    .prepare('SELECT * FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1')
    .get(phone) as
    | { id: string; phone: string; code_hash: string; expires_at: string; attempts: number }
    | undefined;

  const isDev = process.env.NODE_ENV !== 'production' || isDemoModeEnabled();
  const tokenData = verifyOtpToken(params.otpToken, phone);
  const candidateHash = hashOtp(phone, cleanCode);

  if (otpRow) {
    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      throw new Error('This OTP has expired. Please request a new OTP.');
    }
    if (otpRow.attempts >= MAX_OTP_ATTEMPTS) {
      throw new Error('Too many wrong OTP attempts. Please request a new OTP.');
    }
    if (!crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(otpRow.code_hash))) {
      db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - (otpRow.attempts + 1));
      throw new Error(`Incorrect OTP. ${remaining} attempt(s) remaining.`);
    }
  } else if (tokenData) {
    if (tokenData.expMs < Date.now()) {
      throw new Error('This OTP has expired. Please request a new OTP.');
    }
    if (!crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(tokenData.codeHash))) {
      throw new Error('Incorrect OTP. Please try again.');
    }
  } else if (isDev && cleanCode === '123456') {
    // Allow fixed dev OTP in development/demo mode even across server restarts or cold starts
  } else {
    throw new Error('No active OTP found. Please request a new OTP.');
  }

  const existing = db
    .prepare("SELECT * FROM users WHERE phone = ? AND status != 'DELETED'")
    .get(phone) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
    return { user: mapUserRow(existing), isNewUser: false };
  }

  if (!params.consentAccepted) {
    throw new Error('Please accept the DPDP data privacy consent notice to register.');
  }

  const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  const safeRole: UserRole = params.role === 'RECYCLER' ? 'RECYCLER' : 'COLLECTOR';
  const name = (params.name || '').trim() || (safeRole === 'RECYCLER' ? 'New Recycler' : 'Collector');
  const areaLabel = (params.areaLabel || '').trim() || 'Kankanady, Mangaluru';
  const lat = Number.isFinite(params.lat) ? Number(params.lat) : 12.8732;
  const lng = Number.isFinite(params.lng) ? Number(params.lng) : 74.8554;

  db.prepare(
    `INSERT INTO users (id, phone, name, role, language, area_label, lat, lng, upi_id, status, consent_at, created_at)
     VALUES (?, ?, ?, ?, 'en', ?, ?, ?, NULL, 'ACTIVE', ?, ?)`
  ).run(userId, phone, name, safeRole, areaLabel, lat, lng, now, now);

  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
  writeAuditLog(userId, 'User', userId, 'REGISTER_OTP', { role: safeRole, areaLabel });
  const created = getUserById(userId)!;
  return { user: created, isNewUser: true };
}

export function loginWithPhoneDirect(params: {
  rawPhone: string;
  name?: string;
  role?: 'COLLECTOR' | 'RECYCLER';
  areaLabel?: string;
  lat?: number;
  lng?: number;
  consentAccepted?: boolean;
}): { user: UserDTO; isNewUser: boolean } {
  const phone = normalizeIndianPhone(params.rawPhone);
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM users WHERE phone = ? AND status != 'DELETED'")
    .get(phone) as Record<string, unknown> | undefined;

  if (existing) {
    return { user: mapUserRow(existing), isNewUser: false };
  }

  if (!params.consentAccepted) {
    throw new Error('Please accept the DPDP data privacy consent notice to register.');
  }

  const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  const safeRole: UserRole = params.role === 'RECYCLER' ? 'RECYCLER' : 'COLLECTOR';
  const name = (params.name || '').trim() || (safeRole === 'RECYCLER' ? 'New Recycler' : 'Collector');
  const areaLabel = (params.areaLabel || '').trim() || 'Kankanady, Mangaluru';
  const lat = Number.isFinite(params.lat) ? Number(params.lat) : 12.8732;
  const lng = Number.isFinite(params.lng) ? Number(params.lng) : 74.8554;

  db.prepare(
    `INSERT INTO users (id, phone, name, role, language, area_label, lat, lng, upi_id, status, consent_at, created_at)
     VALUES (?, ?, ?, ?, 'en', ?, ?, ?, NULL, 'ACTIVE', ?, ?)`
  ).run(userId, phone, name, safeRole, areaLabel, lat, lng, now, now);

  writeAuditLog(userId, 'User', userId, 'REGISTER_DIRECT', { role: safeRole, areaLabel });
  const created = getUserById(userId)!;
  return { user: created, isNewUser: true };
}

export function deleteUserAccountAndData(userId: string): void {
  const db = getDb();
  const anonymizedPhone = `+910000${Date.now().toString().slice(-6)}`;
  db.prepare(
    `UPDATE users SET name = 'Deleted User', phone = ?, upi_id = NULL, area_label = 'Removed', status = 'DELETED' WHERE id = ?`
  ).run(anonymizedPhone, userId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  writeAuditLog(userId, 'User', userId, 'DPDP_ACCOUNT_DELETED', { reason: 'user_request' });
}
