import crypto from 'node:crypto';
import type { NotificationDTO } from '../shared/types.ts';
import { getDb } from './db.ts';
import { getSmsProvider } from './sms.ts';

export async function createNotification(params: {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  smsText?: string;
}): Promise<NotificationDTO> {
  const db = getDb();
  const id = `ntf_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, payload, read_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)'
  ).run(id, params.userId, params.type, JSON.stringify(params.payload), now);

  if (params.smsText) {
    const userRow = db.prepare('SELECT phone FROM users WHERE id = ?').get(params.userId) as
      | { phone: string }
      | undefined;
    if (userRow?.phone) {
      try {
        await getSmsProvider().send({
          to: userRow.phone,
          body: params.smsText,
          templateKey: params.type,
        });
      } catch (err) {
        console.warn('SMS notification dispatch failed:', err);
      }
    }
  }

  return {
    id,
    userId: params.userId,
    type: params.type,
    payload: params.payload,
    readAt: null,
    createdAt: now,
  };
}

export function listNotifications(userId: string): NotificationDTO[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(userId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    type: String(r.type),
    payload: JSON.parse(String(r.payload || '{}')) as Record<string, unknown>,
    readAt: r.read_at ? String(r.read_at) : null,
    createdAt: String(r.created_at),
  }));
}

export function markNotificationRead(userId: string, notificationId: string): void {
  const db = getDb();
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(
    new Date().toISOString(),
    notificationId,
    userId
  );
}

export function markAllNotificationsRead(userId: string): void {
  const db = getDb();
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(
    new Date().toISOString(),
    userId
  );
}
