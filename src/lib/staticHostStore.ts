import { EPR_DISCLAIMER } from '../shared/format.ts';
import type {
  BookingDTO,
  BookingMode,
  CategoryDTO,
  DisputeDTO,
  LedgerEntryDTO,
  LotDTO,
  LotEstimateDTO,
  MatchCandidateDTO,
  NotificationDTO,
  PaymentMethod,
  ReceiptDTO,
  RecyclerProfileDTO,
  ServiceMode,
  UserDTO,
  UserRole,
} from '../shared/types.ts';

const STORAGE_KEY = 'kc_static_demo_store_v1';

interface StaticStoreState {
  currentUserId: string | null;
  users: UserDTO[];
  categories: CategoryDTO[];
  recyclers: RecyclerProfileDTO[];
  lots: LotDTO[];
  bookings: BookingDTO[];
  ledger: LedgerEntryDTO[];
  receipts: ReceiptDTO[];
  disputes: {
    id: string;
    bookingId: string;
    raisedById: string;
    raisedByName?: string;
    reason: string;
    status: DisputeDTO['status'];
    resolutionNote: string | null;
    resolvedById: string | null;
    createdAt: string;
    updatedAt: string;
    booking?: BookingDTO;
  }[];
  notifications: NotificationDTO[];
  settings: Record<string, string>;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits || '919845011111'}`;
}

function buildInitialState(): StaticStoreState {
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  const users: UserDTO[] = [
    {
      id: 'usr_col_ramesh',
      phone: '+919845011111',
      name: 'Ramesh Poojary',
      role: 'COLLECTOR',
      language: 'en',
      areaLabel: 'Kankanady, Mangaluru',
      lat: 12.8732,
      lng: 74.8554,
      upiId: 'ramesh.kankanady@okicici',
      status: 'ACTIVE',
      consentAt: daysAgo(90),
      createdAt: daysAgo(90),
    },
    {
      id: 'usr_col_suresh',
      phone: '+919845022222',
      name: 'Suresh Nayak',
      role: 'COLLECTOR',
      language: 'en',
      areaLabel: 'Bejai, Mangaluru',
      lat: 12.8857,
      lng: 74.8414,
      upiId: 'suresh.bejai@ybl',
      status: 'ACTIVE',
      consentAt: daysAgo(90),
      createdAt: daysAgo(90),
    },
    {
      id: 'usr_col_imran',
      phone: '+919845033333',
      name: 'Imran Shaikh',
      role: 'COLLECTOR',
      language: 'hi',
      areaLabel: 'Surathkal, Mangaluru',
      lat: 12.9906,
      lng: 74.7988,
      upiId: 'imran.surathkal@oksbi',
      status: 'ACTIVE',
      consentAt: daysAgo(90),
      createdAt: daysAgo(90),
    },
    {
      id: 'usr_rec_greenearth',
      phone: '+919845111111',
      name: 'Mahesh Shetty',
      role: 'RECYCLER',
      language: 'en',
      areaLabel: 'Baikampady Industrial Area, Mangaluru',
      lat: 12.9141,
      lng: 74.856,
      upiId: null,
      status: 'ACTIVE',
      consentAt: daysAgo(80),
      createdAt: daysAgo(80),
    },
    {
      id: 'usr_rec_canara',
      phone: '+919845222222',
      name: 'Anitha Pai',
      role: 'RECYCLER',
      language: 'en',
      areaLabel: 'Bunder Yard Road, Mangaluru',
      lat: 12.8634,
      lng: 74.8511,
      upiId: null,
      status: 'ACTIVE',
      consentAt: daysAgo(80),
      createdAt: daysAgo(80),
    },
    {
      id: 'usr_rec_coastal',
      phone: '+919845333333',
      name: 'Prashanth Kamath',
      role: 'RECYCLER',
      language: 'en',
      areaLabel: 'Panambur Port Road, Mangaluru',
      lat: 12.9612,
      lng: 74.8051,
      upiId: null,
      status: 'ACTIVE',
      consentAt: daysAgo(80),
      createdAt: daysAgo(80),
    },
    {
      id: 'usr_rec_pending',
      phone: '+919845444444',
      name: 'Deepak Hegde',
      role: 'RECYCLER',
      language: 'en',
      areaLabel: 'Padil Junction, Mangaluru',
      lat: 12.888,
      lng: 74.872,
      upiId: null,
      status: 'ACTIVE',
      consentAt: daysAgo(80),
      createdAt: daysAgo(80),
    },
    {
      id: 'usr_admin_kavitha',
      phone: '+919900000001',
      name: 'Kavitha Rao (Platform Admin)',
      role: 'ADMIN',
      language: 'en',
      areaLabel: 'Hampankatta, Mangaluru',
      lat: 12.8698,
      lng: 74.843,
      upiId: null,
      status: 'ACTIVE',
      consentAt: daysAgo(120),
      createdAt: daysAgo(120),
    },
  ];

  const categories: CategoryDTO[] = [
    { id: 'cat_copper', slug: 'copper-cables', name: 'Copper Wires & Cables', nameHi: 'तांबे के तार और केबल', nameKn: 'ತಾಮ್ರದ ತಂತಿ ಮತ್ತು ಕೇಬಲ್', hazardous: false, iconKey: 'cable', co2FactorPerKg: 3.4, active: true, referenceRatePerKg: 640 },
    { id: 'cat_pcb', slug: 'printed-circuit-boards', name: 'Printed Circuit Boards (PCBs)', nameHi: 'प्रिंटेड सर्किट बोर्ड (पीसीबी)', nameKn: 'ಪ್ರಿಂಟೆಡ್ ಸರ್ಕ್ಯೂಟ್ ಬೋರ್ಡ್ (PCB)', hazardous: false, iconKey: 'cpu', co2FactorPerKg: 4.8, co2Factor: 4.8, active: true, referenceRatePerKg: 480 } as CategoryDTO,
    { id: 'cat_aluminium', slug: 'aluminium-scrap', name: 'Aluminium Frames & Heatsinks', nameHi: 'एल्युमीनियम फ्रेम और हीटसिंक', nameKn: 'ಅಲ್ಯೂಮಿನಿಯಂ ಫ್ರೇಮ್ ಮತ್ತು ಹೀಟ್‌ಸಿंक', hazardous: false, iconKey: 'layers', co2FactorPerKg: 9.1, active: true, referenceRatePerKg: 185 },
    { id: 'cat_computer', slug: 'computer-scrap', name: 'Computer & Server Units', nameHi: 'कंप्यूटर और सर्वर स्क्रैप', nameKn: 'ಕಂಪ್ಯೂಟರ್ ಮತ್ತು ಸರ್ವರ್ ಸ್ಕ್ರ್ಯಾಪ್', hazardous: false, iconKey: 'laptop', co2FactorPerKg: 3.8, active: true, referenceRatePerKg: 220 },
    { id: 'cat_mobile', slug: 'smartphone-telecom', name: 'Mobile & Telecom Scrap', nameHi: 'मोबाइल और टेलीकॉम कचरा', nameKn: 'ಮೊಬೈಲ್ ಮತ್ತು ಟೆಲಿಕಾಂ ಸ್ಕ್ರ್ಯಾಪ್', hazardous: false, iconKey: 'smartphone', co2FactorPerKg: 5.2, active: true, referenceRatePerKg: 540 },
    { id: 'cat_iron', slug: 'iron-steel-cores', name: 'Iron, Steel & Motor Cores', nameHi: 'लोहा, स्टील और मोटर कोर', nameKn: 'ಕಬ್ಬಿಣ, ಸ್ಟೀಲ್ ಮತ್ತು ಮೋಟಾರ್ ಕೋರ್', hazardous: false, iconKey: 'wrench', co2FactorPerKg: 1.8, active: true, referenceRatePerKg: 36 },
    { id: 'cat_batteries', slug: 'batteries-lithium', name: 'Batteries & Damaged Lithium Cells', nameHi: 'बैटरी और लिथियम सेल (खतरनाक)', nameKn: 'ಬ್ಯಾಟರಿ ಮತ್ತು ಲಿಥಿಯಂ ಸೆಲ್ (ಅಪಾಯಕಾರಿ)', hazardous: true, iconKey: 'battery-warning', co2FactorPerKg: 2.6, active: true, referenceRatePerKg: 115 },
    { id: 'cat_crt', slug: 'crt-monitors', name: 'CRT Monitors & Glass Units', nameHi: 'सीआरटी मॉनिटर और ग्लास (खतरनाक)', nameKn: 'ಸಿಆರ್‌ಟಿ ಮಾನಿಟರ್ ಮತ್ತು ಗಾಜು (ಅಪಾಯಕಾರಿ)', hazardous: true, iconKey: 'monitor', co2FactorPerKg: 1.4, active: true, referenceRatePerKg: 28 },
  ];

  const defaultSlotRules = [
    {
      dayLabel: 'Today',
      windows: [
        { startHour: 10, endHour: 13, label: '10:00 AM - 1:00 PM' },
        { startHour: 15, endHour: 18, label: '3:00 PM - 6:00 PM' },
      ],
    },
    {
      dayLabel: 'Tomorrow',
      windows: [
        { startHour: 9, endHour: 12, label: '9:00 AM - 12:00 PM' },
        { startHour: 14, endHour: 17, label: '2:00 PM - 5:00 PM' },
      ],
    },
  ];

  const mkRates = (rid: string, prices: Record<string, number>) =>
    Object.entries(prices).map(([catId, pricePerKg]) => ({
      id: `rr_${rid}_${catId}`,
      recyclerId: rid,
      categoryId: catId,
      categoryName: categories.find((c) => c.id === catId)?.name,
      pricePerKg,
      active: true,
      updatedAt: daysAgo(5),
    }));

  const recyclers: RecyclerProfileDTO[] = [
    {
      id: 'rec_greenearth',
      userId: 'usr_rec_greenearth',
      businessName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      registrationNumber: 'KSPCB/EW-2024/MNG-0142',
      authorisationDocUrls: [],
      verificationStatus: 'APPROVED',
      rejectionReason: null,
      verifiedAt: daysAgo(60),
      registrationExpiry: daysAhead(240),
      serviceRadiusKm: 25,
      lat: 12.9141,
      lng: 74.856,
      address: 'Baikampady Industrial Area, Plot 42, Mangaluru 575011',
      mode: 'BOTH',
      minQtyKg: 5,
      acceptsHazardous: true,
      slotRules: defaultSlotRules,
      userName: 'Mahesh Shetty',
      userPhone: '+919845111111',
      rates: mkRates('rec_greenearth', {
        cat_copper: 660,
        cat_pcb: 505,
        cat_aluminium: 192,
        cat_computer: 235,
        cat_mobile: 560,
        cat_iron: 38,
        cat_batteries: 122,
        cat_crt: 30,
      }),
    },
    {
      id: 'rec_canara',
      userId: 'usr_rec_canara',
      businessName: 'Canara Metal & PCB Refurbishers',
      registrationNumber: 'CPCB/EPR-REC/KA-0891',
      authorisationDocUrls: [],
      verificationStatus: 'APPROVED',
      rejectionReason: null,
      verifiedAt: daysAgo(60),
      registrationExpiry: daysAhead(310),
      serviceRadiusKm: 18,
      lat: 12.8634,
      lng: 74.8511,
      address: 'Bunder Yard Road, Shed 9, Mangaluru 575001',
      mode: 'PICKUP',
      minQtyKg: 8,
      acceptsHazardous: false,
      slotRules: defaultSlotRules,
      userName: 'Anitha Pai',
      userPhone: '+919845222222',
      rates: mkRates('rec_canara', {
        cat_copper: 645,
        cat_pcb: 470,
        cat_aluminium: 195,
        cat_computer: 215,
        cat_iron: 40,
      }),
    },
    {
      id: 'rec_coastal',
      userId: 'usr_rec_coastal',
      businessName: 'Coastal Urban Mining LLP',
      registrationNumber: 'KSPCB/EW-2025/UD-0317',
      authorisationDocUrls: [],
      verificationStatus: 'APPROVED',
      rejectionReason: null,
      verifiedAt: daysAgo(60),
      registrationExpiry: daysAhead(190),
      serviceRadiusKm: 35,
      lat: 12.9612,
      lng: 74.8051,
      address: 'Panambur Port Road, Unit 14, Mangaluru 575010',
      mode: 'DELIVERY',
      minQtyKg: 4,
      acceptsHazardous: true,
      slotRules: defaultSlotRules,
      userName: 'Prashanth Kamath',
      userPhone: '+919845333333',
      rates: mkRates('rec_coastal', {
        cat_copper: 695,
        cat_pcb: 530,
        cat_aluminium: 205,
        cat_computer: 250,
        cat_mobile: 590,
        cat_iron: 42,
        cat_batteries: 130,
        cat_crt: 32,
      }),
    },
    {
      id: 'rec_pending',
      userId: 'usr_rec_pending',
      businessName: 'Malnad CleanTech Recovery',
      registrationNumber: 'KSPCB/EW-2026/APP-0078',
      authorisationDocUrls: [],
      verificationStatus: 'PENDING',
      rejectionReason: null,
      verifiedAt: null,
      registrationExpiry: daysAhead(365),
      serviceRadiusKm: 20,
      lat: 12.888,
      lng: 74.872,
      address: 'Padil Junction Industrial Shed, Mangaluru 575007',
      mode: 'BOTH',
      minQtyKg: 10,
      acceptsHazardous: false,
      slotRules: defaultSlotRules,
      userName: 'Deepak Hegde',
      userPhone: '+919845444444',
      rates: mkRates('rec_pending', { cat_copper: 655, cat_computer: 225 }),
    },
  ];

  const sampleReceipt: ReceiptDTO = {
    id: 'KWC-2026-0001',
    bookingId: 'bkg_hist_1',
    signature: 'demo-hmac-verified-static-host-0001',
    pdfUrl: '/r/KWC-2026-0001',
    issuedAt: daysAgo(75),
    verified: true,
    payload: {
      receiptId: 'KWC-2026-0001',
      bookingId: 'bkg_hist_1',
      issuedAt: daysAgo(75),
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerBusinessName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      recyclerRegistrationNumber: 'KSPCB/EW-2024/MNG-0142',
      recyclerAddress: 'Baikampady Industrial Area, Plot 42, Mangaluru 575011',
      mode: 'PICKUP',
      items: [
        { categoryId: 'cat_copper', categoryName: 'Copper Wires & Cables', declaredKg: 10, weighedKg: 10.5, ratePerKg: 650, lineTotal: 6825 },
        { categoryId: 'cat_pcb', categoryName: 'Printed Circuit Boards (PCBs)', declaredKg: 4, weighedKg: 4.2, ratePerKg: 495, lineTotal: 2079 },
      ],
      totalDeclaredKg: 14,
      totalWeighedKg: 14.7,
      grossAmount: 8904,
      transportCost: 0,
      netAmount: 8904,
      lotPhotoUrls: [],
      handoverPhotoUrl: '',
      handoverLocation: { lat: 12.8732, lng: 74.8554, accuracyM: 12 },
      disclaimer: EPR_DISCLAIMER,
    },
  };

  const ledger: LedgerEntryDTO[] = [
    {
      id: 'ldg_1',
      collectorId: 'usr_col_ramesh',
      receiptId: 'KWC-2026-0001',
      grossAmount: 8904,
      transportCost: 0,
      netAmount: 8904,
      kg: 14.7,
      co2SavedKg: 55.9,
      date: daysAgo(75),
      method: 'UPI',
      recyclerBusinessName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
    },
    {
      id: 'ldg_2',
      collectorId: 'usr_col_ramesh',
      receiptId: 'KWC-2026-0002',
      grossAmount: 4453,
      transportCost: 0,
      netAmount: 4453,
      kg: 43.5,
      co2SavedKg: 206.1,
      date: daysAgo(52),
      method: 'CASH',
      recyclerBusinessName: 'Canara Metal & PCB Refurbishers',
    },
  ];

  const lots: LotDTO[] = [
    {
      id: 'lot_demo_1',
      collectorId: 'usr_col_ramesh',
      collectorName: 'Ramesh Poojary',
      status: 'LISTED',
      lat: 12.8732,
      lng: 74.8554,
      areaLabel: 'Kankanady, Mangaluru',
      notes: 'Bundled stripped copper cables & telecom PCBs',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      items: [
        { categoryId: 'cat_copper', categoryName: 'Copper Wires & Cables', hazardous: false, declaredKg: 12 },
        { categoryId: 'cat_pcb', categoryName: 'Printed Circuit Boards (PCBs)', hazardous: false, declaredKg: 5 },
      ],
      photos: [],
      totalKg: 17,
      activeBookingId: null,
      activeBookingStatus: null,
    },
  ];

  return {
    currentUserId: null,
    users,
    categories,
    recyclers,
    lots,
    bookings: [],
    ledger,
    receipts: [sampleReceipt],
    disputes: [],
    notifications: [],
    settings: { COST_PER_KM: '7', BOOKING_EXPIRY_HOURS: '12' },
  };
}

function loadState(): StaticStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as StaticStoreState;
    }
  } catch {
    // ignore storage errors
  }
  const initial = buildInitialState();
  saveState(initial);
  return initial;
}

function saveState(state: StaticStoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function getCurrentUser(state: StaticStoreState): UserDTO | null {
  if (!state.currentUserId) return null;
  return state.users.find((u) => u.id === state.currentUserId && u.status === 'ACTIVE') ?? null;
}

function computeMatches(state: StaticStoreState, lot: LotDTO, sort: string): MatchCandidateDTO[] {
  const costPerKm = Number(state.settings.COST_PER_KM) || 7;
  const lotHasHazard = lot.items.some((it) => state.categories.find((c) => c.id === it.categoryId)?.hazardous);

  const candidates: MatchCandidateDTO[] = state.recyclers
    .filter((r) => r.verificationStatus === 'APPROVED')
    .map((r) => {
      const distanceKm = haversineKm(lot.lat, lot.lng, r.lat, r.lng);
      const reasons: string[] = [];
      const missingCategories: string[] = [];
      if (distanceKm > r.serviceRadiusKm) reasons.push(`Outside service radius (${r.serviceRadiusKm} km)`);
      if (lot.totalKg < r.minQtyKg) reasons.push(`Below minimum lot weight (${r.minQtyKg} kg)`);
      if (lotHasHazard && !r.acceptsHazardous) reasons.push('Not authorised for hazardous items');

      const perMaterialRates: MatchCandidateDTO['perMaterialRates'] = [];
      let offerTotal = 0;
      for (const item of lot.items) {
        const cat = state.categories.find((c) => c.id === item.categoryId);
        const rate = r.rates?.find((rr) => rr.categoryId === item.categoryId && rr.active);
        if (!rate) {
          missingCategories.push(cat?.name || item.categoryId);
        } else {
          const lineTotal = Math.round(item.declaredKg * rate.pricePerKg);
          offerTotal += lineTotal;
          perMaterialRates.push({
            categoryId: item.categoryId,
            categoryName: cat?.name || item.categoryId,
            declaredKg: item.declaredKg,
            ratePerKg: rate.pricePerKg,
            lineTotal,
          });
        }
      }
      if (missingCategories.length > 0) {
        reasons.push(`Does not buy: ${missingCategories.join(', ')}`);
      }

      const effectiveMode: BookingMode = r.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
      const transportCost = effectiveMode === 'DELIVERY' ? Math.round(distanceKm * 2 * costPerKm) : 0;
      const netAmount = Math.max(0, offerTotal - transportCost);
      const eligible = reasons.length === 0;
      const today = new Date();
      const nextSlots = [
        {
          start: new Date(today.getTime() + 3600 * 1000 * 3).toISOString(),
          end: new Date(today.getTime() + 3600 * 1000 * 6).toISOString(),
          label: 'Today · 3:00 PM - 6:00 PM',
        },
        {
          start: new Date(today.getTime() + 3600 * 1000 * 24).toISOString(),
          end: new Date(today.getTime() + 3600 * 1000 * 27).toISOString(),
          label: 'Tomorrow · 10:00 AM - 1:00 PM',
        },
      ];

      return {
        recyclerId: r.id,
        recyclerUserId: r.userId,
        businessName: r.businessName,
        registrationNumber: r.registrationNumber,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        distanceKm,
        mode: r.mode,
        effectiveMode,
        minQtyKg: r.minQtyKg,
        acceptsHazardous: r.acceptsHazardous,
        eligible,
        partial: !eligible,
        ineligibleReasons: reasons,
        missingCategories,
        perMaterialRates,
        offerTotal,
        transportCost,
        netAmount,
        nextSlots,
        tags: [],
      };
    });

  const eligibleList = candidates.filter((c) => c.eligible);
  if (eligibleList.length > 0) {
    const bestNet = [...eligibleList].sort((a, b) => b.netAmount - a.netAmount)[0];
    const nearest = [...eligibleList].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    bestNet.tags.push('BEST_NET_PRICE');
    nearest.tags.push('NEAREST');
  }

  return candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (sort === 'NEAREST') return a.distanceKm - b.distanceKm;
    return b.netAmount - a.netAmount;
  });
}

export async function handleStaticHostApi<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const body =
    typeof init?.body === 'string' && init.body.trim().startsWith('{')
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};

  if (pathname.startsWith('/api/ai/')) {
    throw new Error(
      'AI assistant features require the Node.js server with GEMINI_API_KEY configured (static Netlify hosting serves frontend files only).'
    );
  }

  const state = loadState();
  const me = getCurrentUser(state);

  if (pathname === '/api/health') {
    return { ok: true, demoMode: true, staticHostFallback: true } as T;
  }

  if (pathname === '/api/categories' && method === 'GET') {
    return { categories: state.categories } as T;
  }

  if (pathname === '/api/auth/demo-accounts' && method === 'GET') {
    const accounts = state.users
      .filter((u) => u.status === 'ACTIVE')
      .map((u) => {
        const rec = state.recyclers.find((r) => r.userId === u.id);
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          areaLabel: u.areaLabel,
          businessName: rec?.businessName ?? null,
          verificationStatus: rec?.verificationStatus ?? null,
        };
      });
    return { accounts } as T;
  }

  if (pathname === '/api/auth/demo-login' && method === 'POST') {
    const userId = String(body.userId || '');
    const user = state.users.find((u) => u.id === userId && u.status === 'ACTIVE');
    if (!user) throw new Error('Demo user not found.');
    state.currentUserId = user.id;
    saveState(state);
    return { user, sessionToken: `static_${user.id}` } as T;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const phone = normalizePhone(String(body.phone || ''));
    let user = state.users.find((u) => u.phone === phone && u.status === 'ACTIVE');
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const role: UserRole = body.role === 'RECYCLER' ? 'RECYCLER' : 'COLLECTOR';
      user = {
        id: `usr_${Date.now()}`,
        phone,
        name: String(body.name || (role === 'RECYCLER' ? 'New Recycler' : 'Collector')).trim(),
        role,
        language: 'en',
        areaLabel: String(body.areaLabel || 'Kankanady, Mangaluru'),
        lat: Number(body.lat) || 12.8732,
        lng: Number(body.lng) || 74.8554,
        upiId: null,
        status: 'ACTIVE',
        consentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      state.users.push(user);
    }
    state.currentUserId = user.id;
    saveState(state);
    return { user, isNewUser, sessionToken: `static_${user.id}` } as T;
  }

  if (pathname === '/api/auth/session' && method === 'GET') {
    return { user: me } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    state.currentUserId = null;
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/me' && method === 'PATCH') {
    if (!me) throw new Error('Please sign in first.');
    if (body.name) me.name = String(body.name);
    if (body.language) me.language = body.language as UserDTO['language'];
    if (body.areaLabel) me.areaLabel = String(body.areaLabel);
    if ('upiId' in body) me.upiId = body.upiId ? String(body.upiId) : null;
    saveState(state);
    return { user: me } as T;
  }

  if (pathname === '/api/me' && method === 'DELETE') {
    if (me) me.status = 'DELETED';
    state.currentUserId = null;
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/notifications') {
    return { notifications: me ? state.notifications.filter((n) => n.userId === me.id) : [] } as T;
  }
  if (pathname === '/api/notifications/read-all' && method === 'POST') {
    return { ok: true } as T;
  }

  if (pathname === '/api/uploads/public' && method === 'POST') {
    return { publicUrl: '' } as T;
  }
  if (pathname === '/api/uploads/private' && method === 'POST') {
    return { key: `static/doc_${Date.now()}.pdf` } as T;
  }

  if (pathname === '/api/lots' && method === 'GET') {
    const lots = me ? state.lots.filter((l) => l.collectorId === me.id) : [];
    return { lots } as T;
  }

  if (pathname === '/api/lots' && method === 'POST') {
    if (!me) throw new Error('Please sign in first.');
    const items = ((body.items as { categoryId: string; declaredKg: number }[]) || []).map((it) => {
      const cat = state.categories.find((c) => c.id === it.categoryId);
      return {
        categoryId: it.categoryId,
        categoryName: cat?.name || it.categoryId,
        hazardous: cat?.hazardous || false,
        declaredKg: Number(it.declaredKg) || 1,
      };
    });
    const totalKg = items.reduce((s, i) => s + i.declaredKg, 0);
    const lot: LotDTO = {
      id: `lot_${Date.now()}`,
      collectorId: me.id,
      collectorName: me.name,
      status: body.status === 'LISTED' ? 'LISTED' : 'DRAFT',
      lat: Number(body.lat) || me.lat,
      lng: Number(body.lng) || me.lng,
      areaLabel: String(body.areaLabel || me.areaLabel),
      notes: body.notes ? String(body.notes) : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items,
      photos: [],
      totalKg,
      activeBookingId: null,
      activeBookingStatus: null,
    };
    state.lots.unshift(lot);
    saveState(state);
    return { lot } as T;
  }

  if (pathname.startsWith('/api/lots/') && pathname.endsWith('/estimate') && method === 'POST') {
    const lotId = pathname.split('/')[3];
    const lot = state.lots.find((l) => l.id === lotId);
    if (!lot) throw new Error('Lot not found.');
    const items = lot.items.map((it) => {
      const cat = state.categories.find((c) => c.id === it.categoryId);
      const rate = cat?.referenceRatePerKg || 100;
      const mid = Math.round(it.declaredKg * rate);
      return {
        categoryId: it.categoryId,
        categoryName: cat?.name || it.categoryId,
        hazardous: Boolean(cat?.hazardous),
        declaredKg: it.declaredKg,
        medianRatePerKg: rate,
        lowAmount: Math.round(mid * 0.9),
        highAmount: Math.round(mid * 1.1),
        source: 'REGIONAL_MEDIAN' as const,
        recyclerSampleCount: 2,
      };
    });
    const midTotal = items.reduce((s, i) => s + Math.round(i.declaredKg * i.medianRatePerKg), 0);
    const estimate: LotEstimateDTO = {
      lotId: lot.id,
      totalKg: lot.totalKg,
      lowTotal: Math.round(midTotal * 0.9),
      midTotal,
      highTotal: Math.round(midTotal * 1.1),
      hasHazardous: items.some((i) => i.hazardous),
      computedAt: new Date().toISOString(),
      disclaimer: 'Indicative range only; final payout uses weighed kg at handover.',
      items,
    };
    return { estimate } as T;
  }

  if (pathname.startsWith('/api/lots/') && pathname.endsWith('/matches') && method === 'GET') {
    const lotId = pathname.split('/')[3];
    const lot = state.lots.find((l) => l.id === lotId);
    if (!lot) throw new Error('Lot not found.');
    const sort = parsedUrl.searchParams.get('sort') || 'BEST_NET_PRICE';
    const matches = computeMatches(state, lot, sort);
    return { matches } as T;
  }

  if (pathname.startsWith('/api/lots/') && method === 'PATCH') {
    const lotId = pathname.split('/')[3];
    const lot = state.lots.find((l) => l.id === lotId);
    if (!lot) throw new Error('Lot not found.');
    if (body.status) lot.status = body.status as LotDTO['status'];
    if (body.notes !== undefined) lot.notes = body.notes ? String(body.notes) : null;
    if (Array.isArray(body.items)) {
      lot.items = (body.items as { categoryId: string; declaredKg: number }[]).map((it) => {
        const cat = state.categories.find((c) => c.id === it.categoryId);
        return {
          categoryId: it.categoryId,
          categoryName: cat?.name || it.categoryId,
          hazardous: cat?.hazardous || false,
          declaredKg: Number(it.declaredKg) || 1,
        };
      });
      lot.totalKg = lot.items.reduce((s, i) => s + i.declaredKg, 0);
    }
    lot.updatedAt = new Date().toISOString();
    saveState(state);
    return { lot } as T;
  }

  if (pathname === '/api/bookings' && method === 'GET') {
    if (!me) return { bookings: [] } as T;
    if (me.role === 'ADMIN') return { bookings: state.bookings } as T;
    if (me.role === 'RECYCLER') {
      const rec = state.recyclers.find((r) => r.userId === me.id);
      return { bookings: rec ? state.bookings.filter((b) => b.recyclerId === rec.id) : [] } as T;
    }
    return { bookings: state.bookings.filter((b) => b.collectorId === me.id) } as T;
  }

  if (pathname === '/api/bookings' && method === 'POST') {
    if (!me) throw new Error('Please sign in first.');
    const lot = state.lots.find((l) => l.id === String(body.lotId));
    const rec = state.recyclers.find((r) => r.id === String(body.recyclerId));
    if (!lot || !rec) throw new Error('Lot or recycler not found.');
    const matches = computeMatches(state, lot, 'BEST_NET_PRICE');
    const cand = matches.find((m) => m.recyclerId === rec.id);
    const rateSnapshot: BookingDTO['rateSnapshot'] = {};
    for (const it of lot.items) {
      const cat = state.categories.find((c) => c.id === it.categoryId);
      const r = rec.rates?.find((rr) => rr.categoryId === it.categoryId);
      rateSnapshot[it.categoryId] = {
        categoryName: cat?.name || it.categoryId,
        pricePerKg: r?.pricePerKg || cat?.referenceRatePerKg || 100,
        co2FactorPerKg: cat?.co2FactorPerKg || 2,
      };
    }
    const mode: BookingMode = body.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const booking: BookingDTO = {
      id: `bkg_${Date.now()}`,
      lotId: lot.id,
      recyclerId: rec.id,
      collectorId: me.id,
      status: 'REQUESTED',
      mode,
      slotStart: String(body.slotStart || new Date().toISOString()),
      slotEnd: String(body.slotEnd || new Date().toISOString()),
      rateSnapshot,
      estimatedTotal: cand?.offerTotal || 1000,
      transportCost: mode === 'DELIVERY' ? cand?.transportCost || 0 : 0,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      handoverCode: '4829',
      collectorName: me.name,
      collectorArea: me.areaLabel,
      recyclerBusinessName: rec.businessName,
      recyclerRegistrationNumber: rec.registrationNumber,
      recyclerAddress: rec.address,
      lot,
    };
    lot.status = 'BOOKED';
    lot.activeBookingId = booking.id;
    lot.activeBookingStatus = 'REQUESTED';
    state.bookings.unshift(booking);
    saveState(state);
    return { booking } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/cancel') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (b) {
      b.status = 'CANCELLED';
      if (b.lot) {
        b.lot.status = 'LISTED';
        b.lot.activeBookingId = null;
      }
      saveState(state);
    }
    return { booking: b } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/respond') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (!b) throw new Error('Booking not found.');
    b.status = body.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    if (b.status === 'ACCEPTED') {
      const col = state.users.find((u) => u.id === b.collectorId);
      const rec = state.recyclers.find((r) => r.id === b.recyclerId);
      b.collectorPhone = col?.phone || null;
      b.recyclerPhone = rec?.userPhone || null;
    }
    saveState(state);
    return { booking: b } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/handover/submit') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (!b) throw new Error('Booking not found.');
    const weighedItems = ((body.weighedItems as { categoryId: string; weighedKg: number }[]) || []).map((w) => {
      const snap = b.rateSnapshot[w.categoryId];
      const decl = b.lot?.items.find((i) => i.categoryId === w.categoryId)?.declaredKg || w.weighedKg;
      const rate = snap?.pricePerKg || 100;
      return {
        categoryId: w.categoryId,
        categoryName: snap?.categoryName || w.categoryId,
        declaredKg: decl,
        weighedKg: w.weighedKg,
        ratePerKg: rate,
        lineTotal: Math.round(w.weighedKg * rate),
      };
    });
    const grossAmount = weighedItems.reduce((s, i) => s + i.lineTotal, 0);
    const netAmount = Math.max(0, grossAmount - b.transportCost);
    b.handover = {
      id: `hnd_${Date.now()}`,
      bookingId: b.id,
      weighedItems,
      grossAmount,
      transportCost: b.transportCost,
      netAmount,
      collectorConfirmedAt: null,
      recyclerConfirmedAt: new Date().toISOString(),
      lat: Number(body.lat) || 12.8732,
      lng: Number(body.lng) || 74.8554,
      accuracyM: Number(body.accuracyM) || 15,
      photoUrl: '',
      confirmedAt: null,
    };
    saveState(state);
    return { booking: b } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/handover/confirm') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (!b || !b.handover) throw new Error('Handover not found.');
    b.status = 'HANDED_OVER';
    b.handover.collectorConfirmedAt = new Date().toISOString();
    b.handover.confirmedAt = new Date().toISOString();
    const receiptId = `KWC-2026-${String(state.receipts.length + 1).padStart(4, '0')}`;
    const receipt: ReceiptDTO = {
      id: receiptId,
      bookingId: b.id,
      signature: `demo-hmac-${receiptId}`,
      pdfUrl: `/r/${receiptId}`,
      issuedAt: new Date().toISOString(),
      verified: true,
      payload: {
        receiptId,
        bookingId: b.id,
        issuedAt: new Date().toISOString(),
        collectorName: b.collectorName || 'Collector',
        collectorArea: b.collectorArea || 'Mangaluru',
        recyclerBusinessName: b.recyclerBusinessName || 'Recycler',
        recyclerRegistrationNumber: b.recyclerRegistrationNumber || 'KSPCB/DEMO',
        recyclerAddress: b.recyclerAddress || 'Mangaluru',
        mode: b.mode,
        items: b.handover.weighedItems,
        totalDeclaredKg: b.handover.weighedItems.reduce((s, i) => s + i.declaredKg, 0),
        totalWeighedKg: b.handover.weighedItems.reduce((s, i) => s + i.weighedKg, 0),
        grossAmount: b.handover.grossAmount,
        transportCost: b.handover.transportCost,
        netAmount: b.handover.netAmount,
        lotPhotoUrls: [],
        handoverPhotoUrl: '',
        handoverLocation: { lat: b.handover.lat, lng: b.handover.lng, accuracyM: b.handover.accuracyM },
        disclaimer: EPR_DISCLAIMER,
      },
    };
    b.receipt = receipt;
    state.receipts.unshift(receipt);
    saveState(state);
    return { booking: b } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/upi-qr') && method === 'GET') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    const amount = b?.handover?.netAmount || 0;
    const upiId = 'collector@upi';
    return {
      upiDeepLink: `upi://pay?pa=${upiId}&am=${amount}&cu=INR`,
      qrDataUrl: '',
      upiId,
      amount,
    } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/payment/mark') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (!b) throw new Error('Booking not found.');
    const methodPay: PaymentMethod = body.method === 'UPI' ? 'UPI' : 'CASH';
    b.status = 'PAID';
    b.payment = {
      id: `pay_${Date.now()}`,
      bookingId: b.id,
      method: methodPay,
      amount: b.handover?.netAmount || b.estimatedTotal,
      upiRef: body.upiRef ? String(body.upiRef) : null,
      recyclerMarkedAt: new Date().toISOString(),
      collectorConfirmedAt: null,
      status: 'MARKED_PAID',
    };
    saveState(state);
    return { booking: b } as T;
  }

  if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/payment/confirm') && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = state.bookings.find((bk) => bk.id === id);
    if (!b || !b.payment) throw new Error('Payment not found.');
    if (body.confirmed) {
      b.status = 'COMPLETED';
      b.payment.status = 'CONFIRMED';
      b.payment.collectorConfirmedAt = new Date().toISOString();
      if (b.lot) b.lot.status = 'COMPLETED';
      state.ledger.unshift({
        id: `ldg_${Date.now()}`,
        collectorId: b.collectorId,
        receiptId: b.receipt?.id || `KWC-2026-000${state.ledger.length + 1}`,
        grossAmount: b.handover?.grossAmount || b.payment.amount,
        transportCost: b.transportCost,
        netAmount: b.payment.amount,
        kg: b.handover?.weighedItems.reduce((s, i) => s + i.weighedKg, 0) || 10,
        co2SavedKg: 25,
        date: new Date().toISOString(),
        method: b.payment.method,
        recyclerBusinessName: b.recyclerBusinessName,
      });
    } else {
      b.status = 'DISPUTED';
      b.payment.status = 'DISPUTED';
    }
    saveState(state);
    return { booking: b } as T;
  }

  if (pathname === '/api/ledger' && method === 'GET') {
    const entries = me ? state.ledger.filter((e) => e.collectorId === me.id) : [];
    return { entries } as T;
  }

  if (pathname.startsWith('/api/receipts/') && method === 'GET') {
    const id = decodeURIComponent(pathname.split('/')[3] || '');
    const receipt = state.receipts.find((r) => r.id === id) || state.receipts[0];
    return { receipt } as T;
  }

  if (pathname === '/api/recycler/profile') {
    const rec = me ? state.recyclers.find((r) => r.userId === me.id) ?? null : null;
    if (method === 'PUT' && me) {
      const updated: RecyclerProfileDTO = rec || {
        id: `rec_${Date.now()}`,
        userId: me.id,
        businessName: String(body.businessName || me.name),
        registrationNumber: String(body.registrationNumber || 'KSPCB/NEW-001'),
        authorisationDocUrls: [],
        verificationStatus: 'PENDING',
        rejectionReason: null,
        verifiedAt: null,
        registrationExpiry: String(body.registrationExpiry || new Date(Date.now() + 86400000 * 365).toISOString()),
        serviceRadiusKm: Number(body.serviceRadiusKm) || 20,
        lat: Number(body.lat) || me.lat,
        lng: Number(body.lng) || me.lng,
        address: String(body.address || me.areaLabel),
        mode: (body.mode as ServiceMode) || 'BOTH',
        minQtyKg: Number(body.minQtyKg) || 5,
        acceptsHazardous: Boolean(body.acceptsHazardous),
        slotRules: [],
        rates: [],
      };
      if (rec) {
        Object.assign(rec, {
          businessName: String(body.businessName || rec.businessName),
          registrationNumber: String(body.registrationNumber || rec.registrationNumber),
          serviceRadiusKm: Number(body.serviceRadiusKm) || rec.serviceRadiusKm,
          address: String(body.address || rec.address),
          mode: (body.mode as ServiceMode) || rec.mode,
          minQtyKg: Number(body.minQtyKg) || rec.minQtyKg,
          acceptsHazardous: Boolean(body.acceptsHazardous),
        });
      } else {
        state.recyclers.push(updated);
      }
      saveState(state);
      return { profile: updated } as T;
    }
    return { profile: rec } as T;
  }

  if (pathname === '/api/recycler/rates' && method === 'PUT') {
    const rec = me ? state.recyclers.find((r) => r.userId === me.id) : null;
    if (!rec) throw new Error('Save your business profile first.');
    rec.rates = ((body.rates as { categoryId: string; pricePerKg: number; active: boolean }[]) || []).map((r) => ({
      id: `rr_${rec.id}_${r.categoryId}`,
      recyclerId: rec.id,
      categoryId: r.categoryId,
      categoryName: state.categories.find((c) => c.id === r.categoryId)?.name,
      pricePerKg: Number(r.pricePerKg),
      active: Boolean(r.active),
      updatedAt: new Date().toISOString(),
    }));
    saveState(state);
    return { profile: rec } as T;
  }

  if (pathname === '/api/admin/recyclers') {
    return { recyclers: state.recyclers } as T;
  }
  if (pathname.startsWith('/api/admin/recyclers/') && pathname.endsWith('/verify') && method === 'POST') {
    const rid = pathname.split('/')[4];
    const rec = state.recyclers.find((r) => r.id === rid);
    if (rec) {
      rec.verificationStatus = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      rec.rejectionReason = body.reason ? String(body.reason) : null;
      saveState(state);
    }
    return { recycler: rec } as T;
  }
  if (pathname === '/api/admin/categories') {
    return { categories: state.categories } as T;
  }
  if (pathname === '/api/admin/users') {
    return { users: state.users } as T;
  }
  if (pathname === '/api/admin/settings') {
    if (method === 'PUT') {
      if (body.costPerKm !== undefined) state.settings.COST_PER_KM = String(body.costPerKm);
      if (body.bookingExpiryHours !== undefined) state.settings.BOOKING_EXPIRY_HOURS = String(body.bookingExpiryHours);
      saveState(state);
    }
    return { settings: state.settings } as T;
  }
  if (pathname === '/api/admin/reference-rates' && method === 'POST') {
    const cat = state.categories.find((c) => c.id === String(body.categoryId));
    if (cat) {
      cat.referenceRatePerKg = Number(body.pricePerKg) || cat.referenceRatePerKg;
      saveState(state);
    }
    return { ok: true } as T;
  }
  if (pathname === '/api/admin/disputes') {
    return { disputes: state.disputes } as T;
  }
  if (pathname === '/api/admin/lots') {
    return { lots: state.lots } as T;
  }
  if (pathname === '/api/admin/analytics') {
    const totalVolumeKg = state.ledger.reduce((s, e) => s + e.kg, 0);
    const totalPayoutInr = state.ledger.reduce((s, e) => s + e.netAmount, 0);
    const totalCo2SavedKg = state.ledger.reduce((s, e) => s + e.co2SavedKg, 0);
    return {
      analytics: {
        totals: {
          collectors: state.users.filter((u) => u.role === 'COLLECTOR').length,
          approvedRecyclers: state.recyclers.filter((r) => r.verificationStatus === 'APPROVED').length,
          pendingRecyclers: state.recyclers.filter((r) => r.verificationStatus === 'PENDING').length,
          completedBookings: state.ledger.length,
          openDisputes: state.disputes.filter((d) => d.status === 'OPEN').length,
          totalVolumeKg,
          totalPayoutInr,
          totalCo2SavedKg,
        },
        monthlySeries: [
          { month: '2026-09', kg: 14.7, netInr: 8904, co2Kg: 55.9 },
          { month: '2026-10', kg: 43.5, netInr: 4453, co2Kg: 206.1 },
        ],
        categoryBreakdown: [
          { categoryName: 'Copper Wires & Cables', kg: 10.5, amountInr: 6825 },
          { categoryName: 'Aluminium Frames & Heatsinks', kg: 17.5, amountInr: 3413 },
        ],
      },
    } as T;
  }

  return {} as T;
}
