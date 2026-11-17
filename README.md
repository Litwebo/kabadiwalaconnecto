# Kabadiwala Connect

**Fair prices, transparent net payouts, and verified weighbridge receipts for India's informal scrap & e-waste collectors.**

> **Regulatory Notice:** *"Transaction record only. Not an EPR certificate under the E-Waste (Management) Rules, 2022."*  
> Kabadiwala Connect is a coordination marketplace and digital ledger—not an authorised recycler—and never issues or replaces statutory Extended Producer Responsibility (EPR) certificates.

---

## Key Features

- **Mobile-First & Low-Bandwidth Ready (PWA):** High-contrast warm terracotta & slate palette, `≥44px` tap targets, client-side `1280px` JPEG compression with EXIF GPS stripping, offline draft persistence, and installable Web App Manifest (`vite-plugin-pwa`).
- **Multilingual UI:** Full English (`en`), Hindi (`हिन्दी`), and Kannada (`ಕನ್ನಡ`) translations including category names, persisted per user profile.
- **Role-Based Workflows (`COLLECTOR`, `RECYCLER`, `ADMIN`):**
  - **Collector:** 4-step lot wizard (category selection, ≤4 photos + optional Gemini AI scrap detection helper, Leaflet/OpenStreetMap GPS pin + Mangaluru locality fallback), indicative value estimate (`-10%` to `+10%` from regional verified recycler median or admin reference rate), recycler matching with transport deduction (`distanceKm × 2 × COST_PER_KM` for `DELIVERY`, `₹0` for `PICKUP`), partial-match explanations, 4-digit handover code, weigh-in confirmation/dispute, dual-sided payment verification, Recharts monthly earnings ledger, CO₂ saved metrics, and CSV export.
  - **Recycler:** CPCB/SPCB registration & private certificate upload, service radius/mode/hazard certification/minimum kg setup, live buying rate card, incoming request accept/decline (unlocks phone numbers only after `ACCEPTED`), scale weigh-in with 4-digit collector code + GPS + photo, UPI QR/deep-link & Cash payment recording, and CSV purchase export.
  - **Admin:** Recycler verification queue (approve/reject with reason & CPCB EPR portal link), payment/weight dispute resolution queue, marketplace analytics & Recharts charts, categories & reference rates management, user directory, and platform fee/expiry settings.
- **Tamper-Evident Receipts:** Every confirmed handover issues an HMAC-SHA256 signed receipt (`KWC-YYYY-NNNN`), public QR verification page (`/r/[id]` with zero phone numbers exposed), and downloadable `pdf-lib` A4 PDF.

---

## Architecture & Adapters

| Concern | Local / Preview Runtime | Production Target (Vercel + Supabase) |
| --- | --- | --- |
| **Frontend & API** | React 19 + Vite + Express (`server.ts`) | Next.js / Node server or Vercel Serverless + Express |
| **Database** | Built-in `node:sqlite` (`./data/kabadiwala.db`) | PostgreSQL / Supabase (`prisma/schema.prisma` + `docker-compose.yml`) |
| **SMS / OTP (`SmsProvider`)** | `ConsoleSmsProvider` (fixed `123456` in dev) | MSG91 / Twilio adapter (`src/server/providers/sms.ts`) |
| **File Storage (`StorageProvider`)** | `LocalDiskStorageProvider` (`./storage/public` & private HMAC signed URLs) | Supabase Storage / S3-compatible bucket (`src/server/providers/storage.ts`) |
| **Maps & Distance** | Leaflet + OpenStreetMap tiles + server Haversine | Leaflet + OSM tiles + server Haversine (zero paid map APIs) |
| **Optional AI Helper** | `@google/genai` server-side proxy (`/api/ai/identify-scrap`) | `@google/genai` with `GEMINI_API_KEY` |

---

## Local Development Setup

### 1. Environment Variables
Copy `.env.example` to `.env` and review values:
```bash
cp .env.example .env
```
In development (`NODE_ENV !== 'production'`), `DEMO_MODE=true` enables the quick demo persona switcher on the Sign-In screen alongside OTP (`123456` via `ConsoleSmsProvider`).

### 2. Install, Seed & Start
```bash
npm install
npm run seed -- --reset
npm run dev
```
The app runs at `http://localhost:3000`.

### 3. Local PostgreSQL (Optional via Docker Compose + Prisma)
A `docker-compose.yml` and `prisma/schema.prisma` are provided for local Postgres or Supabase deployment:
```bash
docker compose up -d
# Set DATABASE_URL="postgresql://kabadiwala:kabadiwala@localhost:5432/kabadiwala" in .env
npx prisma migrate dev --name init
```

### 4. Production Deployment (Vercel + Supabase)
1. Create a Supabase project (PostgreSQL + Storage buckets `public-lots` and `private-docs`).
2. Push Prisma schema (`npx prisma migrate deploy`) using Supabase `DATABASE_URL` and `DIRECT_URL`.
3. Configure environment secrets in Vercel (`DATABASE_URL`, `SESSION_SECRET`, `RECEIPT_HMAC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MSG91_AUTH_KEY` or `TWILIO_*`, `GEMINI_API_KEY`, `NODE_ENV=production`, `DEMO_MODE=false`).
4. Build and start:
   ```bash
   npm run build
   npm start
   ```

---

## Seeded Demo Accounts (Mangaluru)
- **Collectors:** Ramesh Poojary (`+919845011111`, Kannada), Suresh Nayak (`+919845022222`, English), Imran Shaikh (`+919845033333`, Hindi)
- **Recyclers:** GreenEarth E-Waste Recyclers (`+919845111111`, Approved), Canara Metal & PCB (`+919845222222`, Approved, non-hazardous), Coastal Urban Mining (`+919845333333`, Approved, Delivery only), Malnad CleanTech (`+919845444444`, Pending)
- **Admin:** Kavitha Rao (`+919900000001`)

---

## How I Tested This

1. **TypeScript & Production Build:**
   - `npm run lint` (`tsc --noEmit`) — 0 errors.
   - `npm run build` (`vite build` + PWA Workbox bundle) — clean production build.
2. **Unit Tests (`npm test` via Vitest):**
   - `tests/unit/matching.test.ts`: Haversine distance, `DELIVERY` round-trip transport cost vs `₹0` `PICKUP`, unapproved/expired/out-of-radius exclusion, partial-match reason reporting, `BEST_NET_PRICE` / `NEAREST` / `EARLIEST_PICKUP` tags, and sorting.
   - `tests/unit/estimation.test.ts`: Regional verified-recycler median calculation, `-10%` to `+10%` range, hazardous flag propagation, and admin `ReferenceRate` fallback outside regional radius.
   - `tests/unit/state-and-receipt.test.ts`: Indian Rupee formatting (`₹1,23,456`), illegal state transition guards (`StateTransitionError`), and HMAC-SHA256 receipt signing + tamper detection.
3. **End-to-End Browser Verification (Playwright + Headless Chromium):**
   - `npx playwright test` (`tests/e2e/marketplace.spec.ts`): Verified landing page compliance disclaimer, public receipt `/r/KWC-2026-0001` HMAC verification with zero phone leaks, 3-role workflow (`COLLECTOR` lot/estimate/match/book -> `RECYCLER` accept & weigh-in -> `COLLECTOR` confirm receipt & PDF -> `RECYCLER` mark UPI payment sent -> `COLLECTOR` confirm payment received -> Ledger chart & CSV export -> `ADMIN` verification/disputes/analytics), `360px` mobile horizontal overflow check (`scrollWidth <= innerWidth`), and `0` console/page errors.
