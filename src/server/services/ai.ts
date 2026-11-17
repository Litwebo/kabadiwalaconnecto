import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { getDb } from '../db.ts';
import type { LanguageCode, UserDTO } from '../../shared/types.ts';
import { listCategories } from './recyclers.ts';

let _aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        timeout: 15000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _aiClient;
}

function extractReadableAiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'AI service request failed.');
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string; code?: number } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not raw JSON
  }
  return raw;
}

export interface ScrapIdentificationResult {
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  estimatedWeightKg: number;
  confidenceNote: string;
  hazardAlert: string | null;
}

export async function identifyScrapFromPhoto(
  imageBase64: string,
  mimeType: string
): Promise<ScrapIdentificationResult> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }

  const categories = listCategories(false);
  const categoryList = categories
    .map((c) => `${c.id}: ${c.name} (hazardous=${c.hazardous})`)
    .join('\n');

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let responseText = '{}';
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            {
              text: `You are helping an Indian scrap collector (kabadiwala) categorize an e-waste photo.
Choose the single best matching category ID from this exact list:
${categoryList}

Estimate a realistic approximate weight in kg visible in the image (minimum 1 kg), write a short plain-English 1-sentence reason, and provide a short hazard warning if lithium batteries or CRT glass are visible (otherwise null).`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categoryId: { type: Type.STRING },
              estimatedWeightKg: { type: Type.NUMBER },
              confidenceNote: { type: Type.STRING },
              hazardAlert: { type: Type.STRING, nullable: true },
            },
            required: ['categoryId', 'estimatedWeightKg', 'confidenceNote'],
          },
        },
      });
      responseText = (response.text ?? '{}').trim();
      lastError = null;
      break;
    } catch (err: unknown) {
      lastError = err;
      const msg = extractReadableAiError(err);
      if (!/503|429|UNAVAILABLE|high demand|timeout/i.test(msg)) {
        break;
      }
    }
  }

  if (lastError) {
    throw new Error(extractReadableAiError(lastError));
  }

  const parsed = JSON.parse(responseText) as {
    categoryId?: string;
    estimatedWeightKg?: number;
    confidenceNote?: string;
    hazardAlert?: string | null;
  };

  const matched = categories.find((c) => c.id === parsed.categoryId) || categories[0];
  return {
    suggestedCategoryId: matched.id,
    suggestedCategoryName: matched.name,
    estimatedWeightKg: Math.max(1, Math.round((Number(parsed.estimatedWeightKg) || 5) * 10) / 10),
    confidenceNote: parsed.confidenceNote || `Matched ${matched.name} from photo.`,
    hazardAlert: matched.hazardous
      ? parsed.hazardAlert || 'Hazardous material: store separately from mixed scrap.'
      : parsed.hazardAlert || null,
  };
}

export interface HelpChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface HelpChatInput {
  message: string;
  history?: HelpChatHistoryItem[];
  language?: LanguageCode;
  currentView?: string;
  user?: UserDTO | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPlatformParameters(): { costPerKm: number; expiryHours: number } {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value FROM platform_settings WHERE key IN ('COST_PER_KM', 'BOOKING_EXPIRY_HOURS')")
      .all() as { key: string; value: string }[];
    let costPerKm = 7;
    let expiryHours = 12;
    for (const r of rows) {
      if (r.key === 'COST_PER_KM' && Number.isFinite(Number(r.value))) costPerKm = Number(r.value);
      if (r.key === 'BOOKING_EXPIRY_HOURS' && Number.isFinite(Number(r.value))) expiryHours = Number(r.value);
    }
    return { costPerKm, expiryHours };
  } catch {
    return { costPerKm: 7, expiryHours: 12 };
  }
}

export async function answerHelpQuestion(input: HelpChatInput): Promise<{ reply: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check or select your API key in Settings > Secrets.'
    );
  }

  const categories = listCategories(false);
  const { costPerKm, expiryHours } = getPlatformParameters();
  const categorySummary = categories
    .map(
      (c) =>
        `- ${c.name}: Ref ~₹${c.referenceRatePerKg ?? 0}/kg, CO2 saved ${c.co2FactorPerKg} kg/kg${
          c.hazardous ? ' [HAZARDOUS - requires hazardous-authorised recycler]' : ''
        }`
    )
    .join('\n');

  const langLabel =
    input.language === 'hi'
      ? 'Hindi (simple everyday Hindi; keep key UI button names clear)'
      : input.language === 'kn'
      ? 'Kannada (simple everyday Kannada; keep key UI button names clear)'
      : 'English (clear, simple Indian English)';

  const userContext = input.user
    ? `Signed-in user: ${input.user.name} (Role: ${input.user.role}, Area: ${input.user.areaLabel}).`
    : 'Visitor is not signed in yet.';

  const systemInstruction = `You are "Kabadiwala Sahayak", the official helpful AI assistant built into the Kabadiwala Connect website.
Your ONLY job is to answer user questions and clear doubts about how to use Kabadiwala Connect, troubleshoot issues, explain pricing/matching/receipts/payments, and guide Collectors, Recyclers, and Admins step by step.

CRITICAL FACTS & COMPLIANCE:
- Kabadiwala Connect is a coordination & price-transparency marketplace connecting scrap collectors (kabadiwalas) with CPCB/SPCB-authorised recyclers and refurbishers.
- The platform is NOT a recycler and does NOT issue EPR certificates under the E-Waste (Management) Rules, 2022. Every receipt is a transaction record only.
- Phone numbers are kept private before booking acceptance; phone numbers unlock for both sides ONLY after the recycler accepts the booking. Public receipt links (/r/[receiptId]) never expose phone numbers.

LIVE PLATFORM PARAMETERS & CATALOG:
- Delivery transport cost formula (when mode is DELIVERY): distance_km × 2 × ₹${costPerKm}/km. Pickup mode has ₹0 transport deduction.
- Booking acceptance timeout: ${expiryHours} hours (if recycler does not respond, booking expires and the lot returns to LISTED so the collector can choose another recycler).
- Active e-waste categories & admin reference rates (indicative fallback if regional median rates are unavailable):
${categorySummary}

COMPLETE WEBSITE GUIDE:
1. SIGNING IN:
   - Click "Sign in", enter your 10-digit Indian mobile number (+91), and click "Sign in & Continue" (no OTP step required).
   - New users can tick "New user registration" to enter their Name, choose Role (Scrap Collector or Authorised Recycler), and pick their Mangaluru locality.
   - Inside the login card, users can also use the "Demo Login" dropdown + "Demo Login" button to jump straight into a sample Collector, Recycler, or Admin account in 1 click.

2. COLLECTOR WORKFLOW (7 STEPS):
   - Step 1 (Create Lot): Open "Sell scrap", pick material categories & approximate kg, upload up to 4 photos (auto-compressed client-side to 1280px JPEG; tap "Identify with AI" to auto-suggest category & weight from the photo), confirm pickup location using "Use my GPS location", the Leaflet map pin, or the locality dropdown. Tap "Save Draft" anytime or "Check Value Estimate".
   - Step 2 (Estimate): Shows an indicative range (-10% to +10%) computed from the regional median of verified recyclers (or admin reference rates). Hazardous items (batteries/CRT) show a safety separation warning.
   - Step 3 (Find Recyclers): Tap "Publish & Find Recyclers". Recyclers appear if they are Admin-verified, unexpired, within their service radius, have active rates for EVERY category in the lot, and lot kg >= their minQtyKg. Sort by "Best Net", "Nearest", or "Earliest", or switch between "List" and "Map" view. Unbookable "partial" matches are shown separately with the exact missing materials/reasons.
   - Step 4 (Choose & Book): Click "Select & Book Slot", choose Pickup or Delivery (if recycler supports BOTH), pick a slot window, and tap "Confirm Booking Request". Rates lock in a snapshot.
   - Step 5 (Handover & Receipt): Once the recycler accepts, the Collector sees a 4-digit Handover Code under "My lots" / Home. At handover, the recycler weighs each material, enters the 4-digit code, uploads a scale photo, captures GPS, and submits. Final payable amount is ALWAYS calculated from WEIGHED kg (not declared kg) at the locked rate. The Collector reviews weights and taps "Confirm Handover & Issue Receipt" (or "Dispute Weight"). This issues a tamper-evident HMAC-SHA256 Receipt, downloadable PDF with QR code, and public verification page /r/[receiptId].
   - Step 6 (Dual-Sided Payment): Recycler pays by Cash or UPI (scanning collector's UPI QR / using upi://pay deep link and entering the 12-digit UTR reference) and clicks "Mark Payment Sent". The Collector MUST tap "Payment Received" (or "Not Received (Dispute)"). Payment is never finalized by one side alone.
   - Step 7 (Earnings Ledger): Once both sides confirm, status becomes COMPLETED and a LedgerEntry is recorded with total net ₹, recycled kg, average ₹/kg, CO2 saved, monthly bar chart, and "Export Ledger CSV".

3. RECYCLER WORKFLOW:
   - Facility tab: Fill Registered Business Name, CPCB/SPCB Registration No., expiry date, collection mode (BOTH/PICKUP/DELIVERY), service radius (km), min lot kg, hazardous authorization checkbox, facility map pin, and upload authorization certificate (private signed URL). Must wait for Admin approval before appearing in collector searches.
   - Rate Card tab: Check categories bought and enter ₹/kg rates, then click "Save Rate Card" (existing booked snapshots do not change).
   - Requests tab: Accept or Decline incoming booking requests within ${expiryHours} hours.
   - Pickups tab: After accepting, view collector's unlocked phone, enter actual weighed kg + collector's 4-digit handover code + scale photo + GPS, and "Submit Weigh-In". Once collector confirms handover, pay via Cash or Collector UPI QR + UTR and click "Mark Payment Sent".
   - History tab: View completed purchases and click "Export Purchases CSV".

4. ADMIN WORKFLOW:
   - Verify tab: Review pending recyclers, inspect authorization documents, cross-check CPCB EPR portal, and Approve or Reject (with mandatory reason).
   - Disputes tab: Review open weight/payment disputes, enter resolution note, optionally choose booking outcome (COMPLETED, HANDED_OVER, CANCELLED), and Resolve or Dismiss.
   - Analytics tab: Platform KPIs, monthly volume chart, CO2 avoided, and recent bookings.
   - Categories tab: Update Admin Reference Rates per category.
   - Config tab: Adjust COST_PER_KM and BOOKING_EXPIRY_HOURS, and inspect registered users.

5. LANDING PAGE, 3D WEIGHBRIDGE & SETTINGS:
   - Landing page features an interactive 3D Weighbridge & live Value/CO2 Estimator where visitors can adjust kg sliders or click "+ Add Item" to add catalog or custom e-waste items.
   - Top bar / Sidebar lets users switch language (EN / हिं / ಕ), toggle Dark/Light theme, check Notifications, install PWA, or delete account/data under Profile (DPDP Act).

CURRENT USER CONTEXT:
- ${userContext}
- Current screen/view: ${input.currentView || 'website'}
- UI language preference: ${langLabel}

RESPONSE RULES:
- Give a direct, accurate, friendly, step-by-step solution that clears the user's doubt.
- Keep answers scannable (short paragraphs + numbered steps or bullet points, 60–180 words unless more detail is needed).
- Reply in the language the user wrote in (or ${langLabel} if unclear).
- Mention exact button/tab names from the website so the user knows exactly what to tap.
- Never make up features that do not exist on Kabadiwala Connect.`;

  const sanitizedHistory = (input.history || [])
    .filter((h) => h.text && h.text.trim().length > 0)
    .slice(-14)
    .map((h) => ({
      role: h.role,
      parts: [{ text: h.text.trim() }],
    }));

  const attempts: Array<{ model: string; thinkingLevel?: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite' },
    { model: 'gemini-3.1-flash-lite' },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const chat = ai.chats.create({
        model: attempt.model,
        history: sanitizedHistory,
        config: {
          systemInstruction,
          ...(attempt.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
            : {}),
        },
      });
      const response = await chat.sendMessage({ message: input.message.trim() });
      const text = response.text?.trim();
      if (!text) {
        throw new Error('The AI assistant returned an empty response. Please try again.');
      }
      return { reply: text };
    } catch (err: unknown) {
      lastError = err;
      const msg = extractReadableAiError(err);
      const isRetryable = /429|500|502|503|504|UNAVAILABLE|high demand|network|timeout|ECONNRESET/i.test(msg);
      if (!isRetryable || i === attempts.length - 1) {
        break;
      }
      await sleep(300 * (i + 1));
    }
  }

  throw new Error(extractReadableAiError(lastError));
}
