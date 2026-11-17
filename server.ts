import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import multer from 'multer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';
import {
  clearSessionCookie,
  createSessionToken,
  deleteUserAccountAndData,
  extractSessionToken,
  getUserById,
  isDemoModeEnabled,
  loginWithPhoneDirect,
  mapUserRow,
  requestPhoneOtp,
  requireAuth,
  requireRole,
  setSessionCookie,
  verifyPhoneOtp,
  verifySessionToken,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import { getDb, writeAuditLog } from './src/server/db.ts';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './src/server/notifications.ts';
import { seedDatabase } from './src/server/seed.ts';
import { answerHelpQuestion, identifyScrapFromPhoto } from './src/server/services/ai.ts';
import { getAdminAnalytics } from './src/server/services/analytics.ts';
import {
  cancelBookingByCollector,
  confirmHandoverByCollector,
  createBooking,
  expireStaleBookings,
  getBookingByIdForUser,
  listBookingsForUser,
  respondToBooking,
  submitHandoverByRecycler,
} from './src/server/services/bookings.ts';
import {
  confirmPaymentByCollector,
  generateUpiQrDataUrl,
  listDisputesForAdmin,
  markPaymentByRecycler,
  resolveDisputeByAdmin,
} from './src/server/services/payments.ts';
import {
  computeEstimateForItems,
  createLot,
  estimateLotValue,
  getLotById,
  listCollectorLots,
  updateLot,
} from './src/server/services/lots.ts';
import { findMatchesForLot, type MatchSortKey } from './src/server/services/matching.ts';
import { generateReceiptPdf, verifyReceiptSignature } from './src/server/services/receipts.ts';
import {
  getRecyclerProfileByUserId,
  listAllRecyclersForAdmin,
  listCategories,
  setReferenceRateByAdmin,
  updateRecyclerRates,
  upsertCategoryByAdmin,
  upsertRecyclerProfile,
  verifyRecyclerByAdmin,
} from './src/server/services/recyclers.ts';
import { getStorageProvider, verifyPrivateKeySignature } from './src/server/storage.ts';
import type { LedgerEntryDTO, ReceiptPayload } from './src/shared/types.ts';

async function ensureSamplePrivateDoc(): Promise<void> {
  const target = path.resolve(process.env.UPLOAD_DIR || './uploads', 'private', 'seed', 'kspcb_consent_sample.pdf');
  if (fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 420]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('KARNATAKA STATE POLLUTION CONTROL BOARD (SAMPLE DOCUMENT)', {
    x: 40,
    y: 370,
    size: 13,
    font: bold,
    color: rgb(0.1, 0.25, 0.16),
  });
  page.drawText('Authorization under E-Waste (Management) Rules, 2022', {
    x: 40,
    y: 345,
    size: 11,
    font,
  });
  page.drawText('Demo verification file for seeded recycler review in Kabadiwala Connect Admin.', {
    x: 40,
    y: 310,
    size: 10,
    font,
  });
  page.drawText('Note: Admins must manually cross-check registration numbers on the CPCB EPR portal.', {
    x: 40,
    y: 285,
    size: 10,
    font,
    color: rgb(0.69, 0.29, 0.09),
  });
  const bytes = await doc.save();
  fs.writeFileSync(target, bytes);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export async function createServerApp() {
  await seedDatabase(false);
  await ensureSamplePrivateDoc();
  await expireStaleBookings();

  const expiryTimer = setInterval(() => {
    expireStaleBookings().catch(() => undefined);
  }, 60_000);
  expiryTimer.unref();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Health & Config
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, demoMode: isDemoModeEnabled(), timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Auth & DPDP Privacy
  // ---------------------------------------------------------------------------
  app.post('/api/auth/request-otp', async (req, res) => {
    const parsed = z.object({ phone: z.string().min(10).max(20) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    try {
      const result = await requestPhoneOtp(parsed.data.phone);
      res.json(result);
    } catch (err: unknown) {
      res.status(429).json({ error: err instanceof Error ? err.message : 'Unable to send OTP.' });
    }
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const parsed = z
      .object({
        phone: z.string().min(10).max(20),
        code: z.string().length(6),
        otpToken: z.string().optional(),
        name: z.string().max(120).optional(),
        role: z.enum(['COLLECTOR', 'RECYCLER']).optional(),
        areaLabel: z.string().max(120).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        consentAccepted: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Enter your mobile number and 6-digit OTP.' });
      return;
    }
    try {
      const { user, isNewUser } = verifyPhoneOtp({
        rawPhone: parsed.data.phone,
        code: parsed.data.code,
        otpToken: parsed.data.otpToken,
        name: parsed.data.name,
        role: parsed.data.role,
        areaLabel: parsed.data.areaLabel,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        consentAccepted: parsed.data.consentAccepted,
      });
      const token = createSessionToken(user.id, user.role);
      setSessionCookie(res, token, req);
      res.json({ user, isNewUser, sessionToken: token });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'OTP verification failed.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const parsed = z
      .object({
        phone: z.string().min(10).max(20),
        name: z.string().max(120).optional(),
        role: z.enum(['COLLECTOR', 'RECYCLER']).optional(),
        areaLabel: z.string().max(120).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        consentAccepted: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    try {
      const { user, isNewUser } = loginWithPhoneDirect({
        rawPhone: parsed.data.phone,
        name: parsed.data.name,
        role: parsed.data.role,
        areaLabel: parsed.data.areaLabel,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        consentAccepted: parsed.data.consentAccepted,
      });
      const token = createSessionToken(user.id, user.role);
      setSessionCookie(res, token, req);
      res.json({ user, isNewUser, sessionToken: token });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Sign-in failed.' });
    }
  });

  app.get('/api/auth/demo-accounts', (_req, res) => {
    if (!isDemoModeEnabled()) {
      res.status(404).json({ error: 'Demo mode is disabled.' });
      return;
    }
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.role, u.area_label, rp.verification_status, rp.business_name
         FROM users u
         LEFT JOIN recycler_profiles rp ON rp.user_id = u.id
         WHERE u.status = 'ACTIVE'
         ORDER BY CASE u.role WHEN 'COLLECTOR' THEN 0 WHEN 'RECYCLER' THEN 1 ELSE 2 END, u.created_at ASC`
      )
      .all() as Record<string, unknown>[];

    res.json({
      accounts: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        role: String(r.role),
        areaLabel: String(r.area_label),
        businessName: r.business_name ? String(r.business_name) : null,
        verificationStatus: r.verification_status ? String(r.verification_status) : null,
      })),
    });
  });

  app.post('/api/auth/demo-login', (req, res) => {
    if (!isDemoModeEnabled()) {
      res.status(403).json({ error: 'Demo mode is disabled in production.' });
      return;
    }
    const parsed = z.object({ userId: z.string().min(2) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid demo user selection.' });
      return;
    }
    const user = getUserById(parsed.data.userId);
    if (!user) {
      res.status(404).json({ error: 'Demo user not found.' });
      return;
    }
    const token = createSessionToken(user.id, user.role);
    setSessionCookie(res, token, req);
    res.json({ user, sessionToken: token });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.get('/api/auth/session', (req, res) => {
    const token = extractSessionToken(req);
    const verified = token ? verifySessionToken(token) : null;
    if (!verified) {
      res.json({ user: null });
      return;
    }
    const user = getUserById(verified.uid);
    if (!user || user.status !== 'ACTIVE') {
      res.json({ user: null });
      return;
    }
    res.json({ user });
  });

  app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.currentUser });
  });

  app.patch('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(120).optional(),
        language: z.enum(['en', 'hi', 'kn']).optional(),
        areaLabel: z.string().min(1).max(120).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        upiId: z.string().max(100).nullable().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile details.' });
      return;
    }

    const u = req.currentUser!;
    const db = getDb();
    db.prepare(
      `UPDATE users SET name = ?, language = ?, area_label = ?, lat = ?, lng = ?, upi_id = ? WHERE id = ?`
    ).run(
      parsed.data.name ?? u.name,
      parsed.data.language ?? u.language,
      parsed.data.areaLabel ?? u.areaLabel,
      parsed.data.lat ?? u.lat,
      parsed.data.lng ?? u.lng,
      parsed.data.upiId !== undefined ? parsed.data.upiId : u.upiId,
      u.id
    );
    writeAuditLog(u.id, 'User', u.id, 'UPDATE_PROFILE', parsed.data as Record<string, unknown>);
    res.json({ user: getUserById(u.id) });
  });

  app.delete('/api/me', requireAuth, (req: AuthenticatedRequest, res) => {
    deleteUserAccountAndData(req.currentUser!.id);
    clearSessionCookie(res);
    res.json({ ok: true, message: 'Your account and personal data have been deleted.' });
  });

  // ---------------------------------------------------------------------------
  // Categories & Notifications
  // ---------------------------------------------------------------------------
  app.get('/api/categories', (_req, res) => {
    res.json({ categories: listCategories(false) });
  });

  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ notifications: listNotifications(req.currentUser!.id) });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    markNotificationRead(req.currentUser!.id, String(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    markAllNotificationsRead(req.currentUser!.id);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // File Uploads & Signed Private Access
  // ---------------------------------------------------------------------------
  app.post('/api/uploads/public', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please select an image file to upload.' });
      return;
    }
    try {
      const stored = await getStorageProvider().savePublicImage(req.file.buffer, req.file.mimetype, 'lots');
      res.json(stored);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Image upload failed.' });
    }
  });

  app.post(
    '/api/uploads/private',
    requireAuth,
    requireRole('RECYCLER', 'ADMIN'),
    upload.single('file'),
    async (req: AuthenticatedRequest, res) => {
      if (!req.file) {
        res.status(400).json({ error: 'Please choose a PDF or image certificate.' });
        return;
      }
      try {
        const stored = await getStorageProvider().savePrivateDocument(
          req.file.buffer,
          req.file.mimetype,
          req.currentUser!.id
        );
        res.json(stored);
      } catch (err: unknown) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Document upload failed.' });
      }
    }
  );

  app.get('/api/files/public/:folder/:file', (req, res) => {
    const key = `${req.params.folder}/${req.params.file}`;
    const file = getStorageProvider().readPublicFile(key);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(file.buffer);
  });

  app.get('/api/files/private', requireAuth, (req: AuthenticatedRequest, res) => {
    const key = String(req.query.key || '');
    const exp = Number(req.query.exp || 0);
    const sig = String(req.query.sig || '');
    if (!key || !verifyPrivateKeySignature(key, exp, sig)) {
      res.status(403).json({ error: 'Signed document URL has expired or is invalid.' });
      return;
    }
    const user = req.currentUser!;
    if (user.role !== 'ADMIN' && !key.startsWith(`${user.id}/`) && !key.startsWith('seed/')) {
      res.status(403).json({ error: 'Access denied to this compliance document.' });
      return;
    }
    const file = getStorageProvider().readPrivateFile(key);
    if (!file) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.send(file.buffer);
  });

  // ---------------------------------------------------------------------------
  // AI Scrap Photo Recognition (Server-Side Gemini)
  // ---------------------------------------------------------------------------
  app.post('/api/ai/identify-scrap', requireAuth, async (req, res) => {
    const parsed = z
      .object({
        imageBase64: z.string().min(20),
        mimeType: z.string().default('image/jpeg'),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid base64 image data is required.' });
      return;
    }
    try {
      const suggestion = await identifyScrapFromPhoto(parsed.data.imageBase64, parsed.data.mimeType);
      res.json({ suggestion });
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI photo helper is currently unavailable.',
      });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    const parsed = z
      .object({
        message: z.string().min(1).max(1500),
        history: z
          .array(
            z.object({
              role: z.enum(['user', 'model']),
              text: z.string().min(1).max(3000),
            })
          )
          .max(20)
          .default([]),
        language: z.enum(['en', 'hi', 'kn']).default('en'),
        currentView: z.string().max(80).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a valid help question.' });
      return;
    }

    const token = extractSessionToken(req);
    const verified = token ? verifySessionToken(token) : null;
    const currentUser = verified ? getUserById(verified.uid) : null;

    try {
      const result = await answerHelpQuestion({
        message: parsed.data.message,
        history: parsed.data.history,
        language: parsed.data.language,
        currentView: parsed.data.currentView,
        user: currentUser,
      });
      res.json(result);
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'AI Help Assistant is currently unavailable.';
      const isKeyError = /not configured|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(rawMessage);
      const status = isKeyError
        ? 503
        : /429|RESOURCE_EXHAUSTED/i.test(rawMessage)
        ? 429
        : /503|UNAVAILABLE|high demand/i.test(rawMessage)
        ? 503
        : 502;
      const clientMessage = isKeyError
        ? 'Gemini API key issue. Please check or select your API key in Settings > Secrets.'
        : rawMessage;
      res.status(status).json({ error: clientMessage });
    }
  });

  // ---------------------------------------------------------------------------
  // Collector Lots & Estimation (M1)
  // ---------------------------------------------------------------------------
  app.get('/api/lots', requireAuth, requireRole('COLLECTOR'), (req: AuthenticatedRequest, res) => {
    res.json({ lots: listCollectorLots(req.currentUser!.id) });
  });

  app.get('/api/lots/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const lot = getLotById(String(req.params.id));
    if (!lot) {
      res.status(404).json({ error: 'Lot not found.' });
      return;
    }
    if (req.currentUser!.role !== 'ADMIN' && lot.collectorId !== req.currentUser!.id) {
      res.status(403).json({ error: 'You can only view your own lots.' });
      return;
    }
    res.json({ lot });
  });

  const lotSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    areaLabel: z.string().min(2).max(120),
    notes: z.string().max(500).optional(),
    items: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          declaredKg: z.number().positive().max(50000),
        })
      )
      .min(1),
    photoUrls: z.array(z.string().min(1)).max(4).default([]),
    publish: z.boolean().optional(),
  });

  app.post('/api/lots', requireAuth, requireRole('COLLECTOR'), (req: AuthenticatedRequest, res) => {
    const parsed = lotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Add at least 1 material with kg > 0 and confirm your location.' });
      return;
    }
    const lot = createLot(req.currentUser!.id, parsed.data);
    res.status(201).json({ lot });
  });

  app.patch('/api/lots/:id', requireAuth, requireRole('COLLECTOR'), (req: AuthenticatedRequest, res) => {
    const parsed = lotSchema
      .partial()
      .extend({ status: z.enum(['DRAFT', 'LISTED', 'CANCELLED']).optional() })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid lot update payload.' });
      return;
    }
    try {
      const lot = updateLot(String(req.params.id), req.currentUser!.id, parsed.data);
      res.json({ lot });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to update lot.' });
    }
  });

  app.post('/api/estimate/preview', requireAuth, (req, res) => {
    const parsed = z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        items: z
          .array(
            z.object({
              categoryId: z.string().min(1),
              declaredKg: z.number().positive().max(50000),
            })
          )
          .min(1),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Select materials and valid kg to calculate estimate.' });
      return;
    }
    res.json({ estimate: computeEstimateForItems(parsed.data.lat, parsed.data.lng, parsed.data.items) });
  });

  app.post('/api/lots/:id/estimate', requireAuth, (req: AuthenticatedRequest, res) => {
    const lot = getLotById(String(req.params.id));
    if (!lot) {
      res.status(404).json({ error: 'Lot not found.' });
      return;
    }
    if (req.currentUser!.role !== 'ADMIN' && lot.collectorId !== req.currentUser!.id) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    res.json({ estimate: estimateLotValue(lot.id) });
  });

  // ---------------------------------------------------------------------------
  // Matching Engine & Bookings / Handover (M3–M5)
  // ---------------------------------------------------------------------------
  app.get('/api/lots/:id/matches', requireAuth, (req: AuthenticatedRequest, res) => {
    const lot = getLotById(String(req.params.id));
    if (!lot) {
      res.status(404).json({ error: 'Lot not found.' });
      return;
    }
    if (req.currentUser!.role !== 'ADMIN' && lot.collectorId !== req.currentUser!.id) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const sortParam = String(req.query.sort || 'net_price');
    const sort: MatchSortKey =
      sortParam === 'nearest' || sortParam === 'earliest' ? sortParam : 'net_price';
    res.json(findMatchesForLot(lot.id, sort));
  });

  app.get('/api/bookings', requireAuth, async (req: AuthenticatedRequest, res) => {
    const bookings = await listBookingsForUser(req.currentUser!.id, req.currentUser!.role);
    res.json({ bookings });
  });

  app.get('/api/bookings/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const booking = await getBookingByIdForUser(
        String(req.params.id),
        req.currentUser!.id,
        req.currentUser!.role
      );
      if (!booking) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      res.json({ booking });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to fetch booking.' });
    }
  });

  app.post('/api/bookings', requireAuth, requireRole('COLLECTOR'), async (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        lotId: z.string().min(1),
        recyclerProfileId: z.string().min(1),
        mode: z.enum(['PICKUP', 'DELIVERY']),
        slotStart: z.string().min(4),
        slotEnd: z.string().min(4),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Select a recycler, service mode, and time slot.' });
      return;
    }
    try {
      const booking = await createBooking(req.currentUser!.id, parsed.data);
      res.status(201).json({ booking });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Booking failed.' });
    }
  });

  app.post(
    '/api/bookings/:id/respond',
    requireAuth,
    requireRole('RECYCLER'),
    async (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ decision: z.enum(['ACCEPTED', 'DECLINED']) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide ACCEPTED or DECLINED decision.' });
        return;
      }
      try {
        const booking = await respondToBooking(
          req.currentUser!.id,
          String(req.params.id),
          parsed.data.decision
        );
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to respond.' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/cancel',
    requireAuth,
    requireRole('COLLECTOR'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const booking = await cancelBookingByCollector(req.currentUser!.id, String(req.params.id));
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to cancel booking.' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/handover/submit',
    requireAuth,
    requireRole('RECYCLER'),
    async (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({
          handoverCode: z.string().regex(/^\d{4}$/),
          weighedItems: z
            .array(
              z.object({
                categoryId: z.string().min(1),
                weighedKg: z.number().min(0).max(50000),
              })
            )
            .min(1),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          accuracyM: z.number().min(0).max(50000).default(25),
          photoUrl: z.string().min(1),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Enter the 4-digit handover code, weighed kg for each material, and attach a handover photo.',
        });
        return;
      }
      if (!parsed.data.weighedItems.some((w) => w.weighedKg > 0)) {
        res.status(400).json({ error: 'At least one weighed material must be greater than 0 kg.' });
        return;
      }
      try {
        const booking = await submitHandoverByRecycler(
          req.currentUser!.id,
          String(req.params.id),
          parsed.data
        );
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Handover submission failed.' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/handover/confirm',
    requireAuth,
    requireRole('COLLECTOR'),
    async (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({
          action: z.enum(['CONFIRM', 'DISPUTE']),
          reason: z.string().max(400).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide CONFIRM or DISPUTE action.' });
        return;
      }
      try {
        const booking = await confirmHandoverByCollector(
          req.currentUser!.id,
          String(req.params.id),
          parsed.data.action,
          parsed.data.reason
        );
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to confirm handover.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Dual-Sided Payments, UPI QR, Ledger & CSV Exports (M6–M7)
  // ---------------------------------------------------------------------------
  app.post(
    '/api/bookings/:id/payment/mark',
    requireAuth,
    requireRole('RECYCLER'),
    async (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({
          method: z.enum(['CASH', 'UPI']),
          upiRef: z.string().max(80).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Select CASH or UPI payment method.' });
        return;
      }
      try {
        const booking = await markPaymentByRecycler(
          req.currentUser!.id,
          String(req.params.id),
          parsed.data
        );
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to mark payment.' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/payment/confirm',
    requireAuth,
    requireRole('COLLECTOR'),
    async (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({
          action: z.enum(['RECEIVED', 'NOT_RECEIVED']),
          reason: z.string().max(400).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide RECEIVED or NOT_RECEIVED confirmation.' });
        return;
      }
      try {
        const booking = await confirmPaymentByCollector(
          req.currentUser!.id,
          String(req.params.id),
          parsed.data.action,
          parsed.data.reason
        );
        res.json({ booking });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to confirm payment.' });
      }
    }
  );

  app.get('/api/bookings/:id/upi-qr', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const booking = await getBookingByIdForUser(
        String(req.params.id),
        req.currentUser!.id,
        req.currentUser!.role
      );
      if (!booking) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      if (!booking.collectorUpiId) {
        res.status(400).json({ error: 'Collector has not configured a UPI ID.' });
        return;
      }
      const amount = booking.handover?.netAmount ?? Math.max(0, booking.estimatedTotal - booking.transportCost);
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(
        booking.collectorUpiId
      )}&pn=${encodeURIComponent(booking.collectorName || 'Collector')}&am=${amount.toFixed(
        2
      )}&cu=INR&tn=${encodeURIComponent(`Kabadiwala ${booking.id}`)}`;
      const qrDataUrl = await generateUpiQrDataUrl(upiDeepLink);
      res.json({ upiDeepLink, qrDataUrl, upiId: booking.collectorUpiId, amount });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to generate UPI QR.' });
    }
  });

  app.get('/api/ledger', requireAuth, requireRole('COLLECTOR'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT le.*, r.payload as receipt_payload
         FROM ledger_entries le
         JOIN receipts r ON r.id = le.receipt_id
         WHERE le.collector_id = ?
         ORDER BY le.date DESC`
      )
      .all(req.currentUser!.id) as Record<string, unknown>[];

    const entries: LedgerEntryDTO[] = rows.map((row) => {
      const payload = JSON.parse(String(row.receipt_payload || '{}')) as Partial<ReceiptPayload>;
      return {
        id: String(row.id),
        collectorId: String(row.collector_id),
        receiptId: String(row.receipt_id),
        grossAmount: Number(row.gross_amount),
        transportCost: Number(row.transport_cost),
        netAmount: Number(row.net_amount),
        kg: Number(row.kg),
        co2SavedKg: Number(row.co2_saved_kg),
        date: String(row.date),
        method: row.method as 'CASH' | 'UPI',
        recyclerBusinessName: payload.recyclerBusinessName,
      };
    });

    res.json({ entries });
  });

  app.get('/api/ledger/csv', requireAuth, requireRole('COLLECTOR'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT le.*, r.payload as receipt_payload
         FROM ledger_entries le
         JOIN receipts r ON r.id = le.receipt_id
         WHERE le.collector_id = ?
         ORDER BY le.date DESC`
      )
      .all(req.currentUser!.id) as Record<string, unknown>[];

    const header = 'ReceiptID,Date,Recycler,Kg,GrossINR,TransportINR,NetINR,CO2SavedKg,Method\n';
    const lines = rows.map((row) => {
      const payload = JSON.parse(String(row.receipt_payload || '{}')) as Partial<ReceiptPayload>;
      const rec = `"${String(payload.recyclerBusinessName || 'Verified Recycler').replace(/"/g, '""')}"`;
      return [
        String(row.receipt_id),
        String(row.date),
        rec,
        Number(row.kg),
        Number(row.gross_amount),
        Number(row.transport_cost),
        Number(row.net_amount),
        Number(row.co2_saved_kg),
        String(row.method),
      ].join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kabadiwala-ledger.csv"');
    res.send(header + lines.join('\n'));
  });

  app.get('/api/recycler/history/csv', requireAuth, requireRole('RECYCLER'), async (req: AuthenticatedRequest, res) => {
    const bookings = await listBookingsForUser(req.currentUser!.id, 'RECYCLER');
    const completed = bookings.filter((b) => b.status === 'COMPLETED');
    const header = 'BookingID,ReceiptID,Collector,Area,Date,Kg,GrossINR,TransportINR,NetINR,Method\n';
    const lines = completed.map((b) => {
      const col = `"${String(b.collectorName || '').replace(/"/g, '""')}"`;
      const area = `"${String(b.collectorArea || '').replace(/"/g, '""')}"`;
      return [
        b.id,
        b.receipt?.id || '',
        col,
        area,
        b.updatedAt,
        b.receipt?.payload.totalWeighedKg ?? b.lot?.totalKg ?? 0,
        b.handover?.grossAmount ?? b.estimatedTotal,
        b.transportCost,
        b.handover?.netAmount ?? Math.max(0, b.estimatedTotal - b.transportCost),
        b.payment?.method || '',
      ].join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="recycler-purchases.csv"');
    res.send(header + lines.join('\n'));
  });

  // ---------------------------------------------------------------------------
  // Recycler Profile & Rate Card (M2)
  // ---------------------------------------------------------------------------
  app.get('/api/recycler/profile', requireAuth, requireRole('RECYCLER'), (req: AuthenticatedRequest, res) => {
    const profile = getRecyclerProfileByUserId(req.currentUser!.id, true);
    res.json({ profile });
  });

  app.put('/api/recycler/profile', requireAuth, requireRole('RECYCLER'), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        businessName: z.string().min(2).max(160),
        registrationNumber: z.string().min(3).max(80),
        registrationExpiry: z.string().min(4),
        serviceRadiusKm: z.number().min(1).max(200),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().min(5).max(300),
        mode: z.enum(['PICKUP', 'DELIVERY', 'BOTH']),
        minQtyKg: z.number().min(1).max(5000),
        acceptsHazardous: z.boolean(),
        slotRules: z.array(
          z.object({
            dayLabel: z.string(),
            windows: z.array(
              z.object({
                startHour: z.number(),
                endHour: z.number(),
                label: z.string(),
              })
            ),
          })
        ),
        authorisationDocKeys: z.array(z.string()).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all required business and CPCB/SPCB registration fields.' });
      return;
    }

    const profile = upsertRecyclerProfile(req.currentUser!.id, parsed.data);
    res.json({ profile });
  });

  app.put('/api/recycler/rates', requireAuth, requireRole('RECYCLER'), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        rates: z
          .array(
            z.object({
              categoryId: z.string().min(1),
              pricePerKg: z.number().nonnegative().max(100000),
              active: z.boolean(),
            })
          )
          .min(1),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Enter valid ₹/kg rates for your categories.' });
      return;
    }

    try {
      const profile = updateRecyclerRates(req.currentUser!.id, parsed.data.rates);
      res.json({ profile });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to save rate card.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin Verification, Categories, Reference Rates & Settings (M2)
  // ---------------------------------------------------------------------------
  app.get('/api/admin/recyclers', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ recyclers: listAllRecyclersForAdmin() });
  });

  app.post('/api/admin/recyclers/:id/verify', requireAuth, requireRole('ADMIN'), async (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        decision: z.enum(['APPROVED', 'REJECTED']),
        reason: z.string().max(300).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Provide APPROVED or REJECTED decision.' });
      return;
    }
    if (parsed.data.decision === 'REJECTED' && !parsed.data.reason?.trim()) {
      res.status(400).json({ error: 'Please provide a rejection reason so the recycler knows what to fix.' });
      return;
    }
    try {
      const profile = await verifyRecyclerByAdmin(
        req.currentUser!.id,
        String(req.params.id),
        parsed.data.decision,
        parsed.data.reason
      );
      res.json({ profile });
    } catch (err: unknown) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Recycler not found.' });
    }
  });

  app.get('/api/admin/categories', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ categories: listCategories(true) });
  });

  app.post('/api/admin/categories', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        id: z.string().optional(),
        slug: z.string().min(2).max(60),
        name: z.string().min(2).max(100),
        nameHi: z.string().min(1).max(100),
        nameKn: z.string().min(1).max(100),
        hazardous: z.boolean(),
        iconKey: z.string().min(1).max(40),
        co2FactorPerKg: z.number().min(0).max(50),
        active: z.boolean(),
        referenceRatePerKg: z.number().positive().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all category fields including Hindi and Kannada labels.' });
      return;
    }
    const category = upsertCategoryByAdmin(req.currentUser!.id, parsed.data);
    res.json({ category });
  });

  app.post('/api/admin/reference-rates', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        categoryId: z.string().min(1),
        pricePerKg: z.number().positive().max(100000),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a positive reference rate per kg.' });
      return;
    }
    setReferenceRateByAdmin(req.currentUser!.id, parsed.data.categoryId, parsed.data.pricePerKg);
    res.json({ categories: listCategories(true) });
  });

  app.get('/api/admin/users', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[];
    res.json({ users: rows.map(mapUserRow) });
  });

  app.get('/api/admin/disputes', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ disputes: listDisputesForAdmin() });
  });

  app.post('/api/admin/disputes/:id/resolve', requireAuth, requireRole('ADMIN'), async (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        status: z.enum(['RESOLVED', 'DISMISSED']),
        resolutionNote: z.string().min(3).max(500),
        bookingOutcome: z.enum(['COMPLETED', 'CANCELLED', 'HANDED_OVER']).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Provide dispute resolution status and note.' });
      return;
    }
    try {
      const dispute = await resolveDisputeByAdmin(req.currentUser!.id, String(req.params.id), parsed.data);
      res.json({ dispute });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Unable to resolve dispute.' });
    }
  });

  app.get('/api/admin/analytics', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ analytics: getAdminAnalytics() });
  });

  app.get('/api/admin/lots', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT id FROM lots ORDER BY updated_at DESC LIMIT 50').all() as { id: string }[];
    res.json({ lots: rows.map((r) => getLotById(r.id)).filter(Boolean) });
  });

  app.get('/api/admin/settings', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value, updated_at FROM platform_settings').all() as {
      key: string;
      value: string;
      updated_at: string;
    }[];
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ settings });
  });

  app.patch('/api/admin/settings', requireAuth, requireRole('ADMIN'), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        COST_PER_KM: z.number().min(0).max(100).optional(),
        BOOKING_EXPIRY_HOURS: z.number().min(1).max(72).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings values.' });
      return;
    }
    const db = getDb();
    const now = new Date().toISOString();
    if (parsed.data.COST_PER_KM !== undefined) {
      db.prepare(
        'INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).run('COST_PER_KM', String(parsed.data.COST_PER_KM), now);
    }
    if (parsed.data.BOOKING_EXPIRY_HOURS !== undefined) {
      db.prepare(
        'INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).run('BOOKING_EXPIRY_HOURS', String(parsed.data.BOOKING_EXPIRY_HOURS), now);
    }
    writeAuditLog(req.currentUser!.id, 'PlatformSetting', 'global', 'UPDATE_SETTINGS', parsed.data);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Public Receipt Verification & PDF (no phone numbers exposed!)
  // ---------------------------------------------------------------------------
  app.get('/api/receipts/:id', (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(String(req.params.id)) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Receipt not found.' });
      return;
    }
    const payload = JSON.parse(String(row.payload)) as ReceiptPayload;
    const signature = String(row.signature);
    const verified = verifyReceiptSignature(payload, signature);

    res.json({
      receipt: {
        id: String(row.id),
        bookingId: String(row.booking_id),
        payload,
        signature,
        pdfUrl: String(row.pdf_url),
        issuedAt: String(row.issued_at),
        verified,
      },
    });
  });

  app.get('/api/receipts/:id/pdf', async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(String(req.params.id)) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Receipt not found.' });
      return;
    }
    const payload = JSON.parse(String(row.payload)) as ReceiptPayload;
    const signature = String(row.signature);
    const origin = `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${origin}/r/${payload.receiptId}`;
    const pdfBytes = await generateReceiptPdf(payload, signature, verifyUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payload.receiptId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  });

  // Mount Vite middleware in development, or serve dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isEntry =
  process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isEntry) {
  const PORT = Number(process.env.PORT || 3000);
  createServerApp()
    .then((app) => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Kabadiwala Connect listening on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
