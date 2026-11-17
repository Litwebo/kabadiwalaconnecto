import crypto from 'node:crypto';
import { EPR_DISCLAIMER } from '../shared/format.ts';
import type { ReceiptPayload, WeighedItem } from '../shared/types.ts';
import { getDb } from './db.ts';
import { signReceiptPayload } from './services/receipts.ts';

function hashHandoverCode(bookingId: string, code: string): string {
  const secret = process.env.SESSION_SECRET || 'dev-session-secret-change-in-production';
  return crypto.createHmac('sha256', secret).update(`${bookingId}:${code}`).digest('hex');
}

export async function seedDatabase(forceReset = false): Promise<{ seeded: boolean }> {
  const db = getDb();

  if (!forceReset) {
    const existingCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    if (existingCount > 0) {
      return { seeded: false };
    }
  } else {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM notifications;
      DELETE FROM disputes;
      DELETE FROM ledger_entries;
      DELETE FROM payments;
      DELETE FROM receipts;
      DELETE FROM handovers;
      DELETE FROM bookings;
      DELETE FROM lot_photos;
      DELETE FROM lot_items;
      DELETE FROM lots;
      DELETE FROM recycler_rates;
      DELETE FROM reference_rates;
      DELETE FROM categories;
      DELETE FROM recycler_profiles;
      DELETE FROM otp_codes;
      DELETE FROM otp_rate_limits;
      DELETE FROM platform_settings;
      DELETE FROM users;
    `);
  }

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  // Platform settings
  db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    'COST_PER_KM',
    '7',
    now.toISOString()
  );
  db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    'BOOKING_EXPIRY_HOURS',
    '12',
    now.toISOString()
  );

  // 1 Admin
  const adminId = 'usr_admin_kavitha';
  db.prepare(
    `INSERT INTO users (id, phone, name, role, language, area_label, lat, lng, upi_id, status, consent_at, created_at)
     VALUES (?, ?, ?, 'ADMIN', 'en', ?, ?, ?, NULL, 'ACTIVE', ?, ?)`
  ).run(adminId, '+919900000001', 'Kavitha Rao (Platform Admin)', 'Hampankatta, Mangaluru', 12.8698, 74.843, daysAgo(120), daysAgo(120));

  // 3 Collectors (Mangaluru areas: Kankanady, Bejai, Surathkal)
  const collectors = [
    {
      id: 'usr_col_ramesh',
      phone: '+919845011111',
      name: 'Ramesh Poojary',
      language: 'kn',
      area: 'Kankanady, Mangaluru',
      lat: 12.8732,
      lng: 74.8554,
      upi: 'ramesh.kankanady@okicici',
    },
    {
      id: 'usr_col_suresh',
      phone: '+919845022222',
      name: 'Suresh Nayak',
      language: 'en',
      area: 'Bejai, Mangaluru',
      lat: 12.8857,
      lng: 74.8414,
      upi: 'suresh.bejai@ybl',
    },
    {
      id: 'usr_col_imran',
      phone: '+919845033333',
      name: 'Imran Shaikh',
      language: 'hi',
      area: 'Surathkal, Mangaluru',
      lat: 12.9906,
      lng: 74.7988,
      upi: 'imran.surathkal@oksbi',
    },
  ];

  for (const c of collectors) {
    db.prepare(
      `INSERT INTO users (id, phone, name, role, language, area_label, lat, lng, upi_id, status, consent_at, created_at)
       VALUES (?, ?, ?, 'COLLECTOR', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(c.id, c.phone, c.name, c.language, c.area, c.lat, c.lng, c.upi, daysAgo(90), daysAgo(90));
  }

  // 4 Recyclers (3 APPROVED, 1 PENDING)
  const recyclerUsers = [
    {
      uid: 'usr_rec_greenearth',
      rid: 'rec_greenearth',
      phone: '+919845111111',
      owner: 'Mahesh Shetty',
      business: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      regNo: 'KSPCB/EW-2024/MNG-0142',
      status: 'APPROVED',
      radius: 25,
      lat: 12.9141,
      lng: 74.856,
      address: 'Baikampady Industrial Area, Plot 42, Mangaluru 575011',
      mode: 'BOTH',
      minQty: 5,
      hazardous: 1,
      expiryDays: 240,
    },
    {
      uid: 'usr_rec_canara',
      rid: 'rec_canara',
      phone: '+919845222222',
      owner: 'Anitha Pai',
      business: 'Canara Metal & PCB Refurbishers',
      regNo: 'CPCB/EPR-REC/KA-0891',
      status: 'APPROVED',
      radius: 18,
      lat: 12.8634,
      lng: 74.8511,
      address: 'Bunder Yard Road, Shed 9, Mangaluru 575001',
      mode: 'PICKUP',
      minQty: 8,
      hazardous: 0,
      expiryDays: 310,
    },
    {
      uid: 'usr_rec_coastal',
      rid: 'rec_coastal',
      phone: '+919845333333',
      owner: 'Prashanth Kamath',
      business: 'Coastal Urban Mining LLP',
      regNo: 'KSPCB/EW-2025/UD-0317',
      status: 'APPROVED',
      radius: 35,
      lat: 12.9612,
      lng: 74.8051,
      address: 'Panambur Port Road, Unit 14, Mangaluru 575010',
      mode: 'DELIVERY',
      minQty: 4,
      hazardous: 1,
      expiryDays: 190,
    },
    {
      uid: 'usr_rec_pending',
      rid: 'rec_pending',
      phone: '+919845444444',
      owner: 'Deepak Hegde',
      business: 'Malnad CleanTech Recovery',
      regNo: 'KSPCB/EW-2026/APP-0078',
      status: 'PENDING',
      radius: 20,
      lat: 12.888,
      lng: 74.872,
      address: 'Padil Junction Industrial Shed, Mangaluru 575007',
      mode: 'BOTH',
      minQty: 10,
      hazardous: 0,
      expiryDays: 365,
    },
  ];

  const defaultSlotRules = JSON.stringify([
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
  ]);

  for (const r of recyclerUsers) {
    db.prepare(
      `INSERT INTO users (id, phone, name, role, language, area_label, lat, lng, upi_id, status, consent_at, created_at)
       VALUES (?, ?, ?, 'RECYCLER', 'en', ?, ?, ?, NULL, 'ACTIVE', ?, ?)`
    ).run(r.uid, r.phone, r.owner, r.address, r.lat, r.lng, daysAgo(80), daysAgo(80));

    db.prepare(
      `INSERT INTO recycler_profiles (
        id, user_id, business_name, registration_number, authorisation_doc_urls,
        verification_status, rejection_reason, verified_at, registration_expiry,
        service_radius_km, lat, lng, address, mode, min_qty_kg, accepts_hazardous,
        slot_rules, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.rid,
      r.uid,
      r.business,
      r.regNo,
      JSON.stringify(['seed/kspcb_consent_sample.pdf']),
      r.status,
      r.status === 'APPROVED' ? daysAgo(60) : null,
      daysAhead(r.expiryDays),
      r.radius,
      r.lat,
      r.lng,
      r.address,
      r.mode,
      r.minQty,
      r.hazardous,
      defaultSlotRules,
      daysAgo(80)
    );
  }

  // 8 Categories with Reference Rates
  const categories = [
    {
      id: 'cat_copper',
      slug: 'copper-cables',
      name: 'Copper Wires & Cables',
      nameHi: 'तांबे के तार और केबल',
      nameKn: 'ತಾಮ್ರದ ತಂತಿ ಮತ್ತು ಕೇಬಲ್',
      hazardous: 0,
      iconKey: 'cable',
      co2: 3.4,
      refRate: 640,
    },
    {
      id: 'cat_pcb',
      slug: 'printed-circuit-boards',
      name: 'Printed Circuit Boards (PCBs)',
      nameHi: 'प्रिंटेड सर्किट बोर्ड (पीसीबी)',
      nameKn: 'ಪ್ರಿಂಟೆಡ್ ಸರ್ಕ್ಯೂಟ್ ಬೋರ್ಡ್ (PCB)',
      hazardous: 0,
      iconKey: 'cpu',
      co2: 4.8,
      refRate: 480,
    },
    {
      id: 'cat_aluminium',
      slug: 'aluminium-scrap',
      name: 'Aluminium Frames & Heatsinks',
      nameHi: 'एल्युमीनियम फ्रेम और हीटसिंक',
      nameKn: 'ಅಲ್ಯೂಮಿನಿಯಂ ಫ್ರೇಮ್ ಮತ್ತು ಹೀಟ್‌ಸಿಂಕ್',
      hazardous: 0,
      iconKey: 'layers',
      co2: 9.1,
      refRate: 185,
    },
    {
      id: 'cat_computer',
      slug: 'computer-scrap',
      name: 'Computer & Server Units',
      nameHi: 'कंप्यूटर और सर्वर स्क्रैप',
      nameKn: 'ಕಂಪ್ಯೂಟರ್ ಮತ್ತು ಸರ್ವರ್ ಸ್ಕ್ರ್ಯಾಪ್',
      hazardous: 0,
      iconKey: 'laptop',
      co2: 3.8,
      refRate: 220,
    },
    {
      id: 'cat_mobile',
      slug: 'smartphone-telecom',
      name: 'Mobile & Telecom Scrap',
      nameHi: 'मोबाइल और टेलीकॉम कचरा',
      nameKn: 'ಮೊಬೈಲ್ ಮತ್ತು ಟೆಲಿಕಾಂ ಸ್ಕ್ರ್ಯಾಪ್',
      hazardous: 0,
      iconKey: 'smartphone',
      co2: 5.2,
      refRate: 540,
    },
    {
      id: 'cat_iron',
      slug: 'iron-steel-cores',
      name: 'Iron, Steel & Motor Cores',
      nameHi: 'लोहा, स्टील और मोटर कोर',
      nameKn: 'ಕಬ್ಬಿಣ, ಸ್ಟೀಲ್ ಮತ್ತು ಮೋಟಾರ್ ಕೋರ್',
      hazardous: 0,
      iconKey: 'wrench',
      co2: 1.8,
      refRate: 36,
    },
    {
      id: 'cat_batteries',
      slug: 'batteries-lithium',
      name: 'Batteries & Damaged Lithium Cells',
      nameHi: 'बैटरी और लिथियम सेल (खतरनाक)',
      nameKn: 'ಬ್ಯಾಟರಿ ಮತ್ತು ಲಿಥಿಯಂ ಸೆಲ್ (ಅಪಾಯಕಾರಿ)',
      hazardous: 1,
      iconKey: 'battery-warning',
      co2: 2.6,
      refRate: 115,
    },
    {
      id: 'cat_crt',
      slug: 'crt-monitors',
      name: 'CRT Monitors & Glass Units',
      nameHi: 'सीआरटी मॉनिटर और ग्लास (खतरनाक)',
      nameKn: 'ಸಿಆರ್‌ಟಿ ಮಾನಿಟರ್ ಮತ್ತು ಗಾಜು (ಅಪಾಯಕಾರಿ)',
      hazardous: 1,
      iconKey: 'monitor',
      co2: 1.4,
      refRate: 28,
    },
  ];

  for (const cat of categories) {
    db.prepare(
      `INSERT INTO categories (id, slug, name, name_hi, name_kn, hazardous, icon_key, co2_factor_per_kg, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(cat.id, cat.slug, cat.name, cat.nameHi, cat.nameKn, cat.hazardous, cat.iconKey, cat.co2);

    db.prepare(
      `INSERT INTO reference_rates (id, category_id, price_per_kg, effective_from, set_by_admin_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`ref_${cat.id}`, cat.id, cat.refRate, daysAgo(15), adminId);
  }

  // Recycler rate cards (distinct rates + some categories omitted on Canara so partial matches trigger!)
  const recyclerRates: { rid: string; catId: string; price: number; active: number }[] = [
    // GreenEarth (accepts all 8, competitive mid-high prices, pickup/both)
    { rid: 'rec_greenearth', catId: 'cat_copper', price: 660, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_pcb', price: 505, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_aluminium', price: 192, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_computer', price: 235, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_mobile', price: 560, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_iron', price: 38, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_batteries', price: 122, active: 1 },
    { rid: 'rec_greenearth', catId: 'cat_crt', price: 30, active: 1 },

    // Canara Metal (closest to Kankanady! omits mobile & hazardous -> demonstrates partial matches)
    { rid: 'rec_canara', catId: 'cat_copper', price: 645, active: 1 },
    { rid: 'rec_canara', catId: 'cat_pcb', price: 470, active: 1 },
    { rid: 'rec_canara', catId: 'cat_aluminium', price: 195, active: 1 },
    { rid: 'rec_canara', catId: 'cat_computer', price: 215, active: 1 },
    { rid: 'rec_canara', catId: 'cat_iron', price: 40, active: 1 },

    // Coastal Urban Mining (highest gross rates, DELIVERY mode so transport deduction applies!)
    { rid: 'rec_coastal', catId: 'cat_copper', price: 695, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_pcb', price: 530, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_aluminium', price: 205, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_computer', price: 250, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_mobile', price: 590, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_iron', price: 42, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_batteries', price: 130, active: 1 },
    { rid: 'rec_coastal', catId: 'cat_crt', price: 32, active: 1 },

    // Pending recycler
    { rid: 'rec_pending', catId: 'cat_copper', price: 655, active: 1 },
    { rid: 'rec_pending', catId: 'cat_computer', price: 225, active: 1 },
  ];

  for (const rr of recyclerRates) {
    db.prepare(
      `INSERT INTO recycler_rates (id, recycler_id, category_id, price_per_kg, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(`rr_${rr.rid}_${rr.catId}`, rr.rid, rr.catId, rr.price, rr.active, daysAgo(5));
  }

  // 5 Historical Completed Transactions (across recent months for Ramesh & Suresh)
  const historicalTxs = [
    {
      idx: 1,
      daysAgoNum: 75,
      collectorId: 'usr_col_ramesh',
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerUid: 'usr_rec_greenearth',
      recyclerName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      recyclerReg: 'KSPCB/EW-2024/MNG-0142',
      recyclerAddr: 'Baikampady Industrial Area, Plot 42, Mangaluru',
      mode: 'PICKUP' as const,
      transportCost: 0,
      method: 'UPI' as const,
      upiRef: '425618903412',
      items: [
        { catId: 'cat_copper', catName: 'Copper Wires & Cables', declKg: 10, weighKg: 10.5, rate: 650, co2: 3.4 },
        { catId: 'cat_pcb', catName: 'Printed Circuit Boards (PCBs)', declKg: 4, weighKg: 4.2, rate: 495, co2: 4.8 },
      ],
    },
    {
      idx: 2,
      daysAgoNum: 52,
      collectorId: 'usr_col_ramesh',
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerUid: 'usr_rec_canara',
      recyclerName: 'Canara Metal & PCB Refurbishers',
      recyclerReg: 'CPCB/EPR-REC/KA-0891',
      recyclerAddr: 'Bunder Yard Road, Shed 9, Mangaluru',
      mode: 'PICKUP' as const,
      transportCost: 0,
      method: 'CASH' as const,
      upiRef: null,
      items: [
        { catId: 'cat_aluminium', catName: 'Aluminium Frames & Heatsinks', declKg: 18, weighKg: 17.5, rate: 195, co2: 9.1 },
        { catId: 'cat_iron', catName: 'Iron, Steel & Motor Cores', declKg: 25, weighKg: 26, rate: 40, co2: 1.8 },
      ],
    },
    {
      idx: 3,
      daysAgoNum: 34,
      collectorId: 'usr_col_ramesh',
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerUid: 'usr_rec_coastal',
      recyclerName: 'Coastal Urban Mining LLP',
      recyclerReg: 'KSPCB/EW-2025/UD-0317',
      recyclerAddr: 'Panambur Port Road, Unit 14, Mangaluru',
      mode: 'DELIVERY' as const,
      transportCost: 158,
      method: 'UPI' as const,
      upiRef: '429103847120',
      items: [
        { catId: 'cat_mobile', catName: 'Mobile & Telecom Scrap', declKg: 6, weighKg: 6.4, rate: 590, co2: 5.2 },
        { catId: 'cat_computer', catName: 'Computer & Server Units', declKg: 14, weighKg: 13.8, rate: 250, co2: 3.8 },
      ],
    },
    {
      idx: 4,
      daysAgoNum: 14,
      collectorId: 'usr_col_ramesh',
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerUid: 'usr_rec_greenearth',
      recyclerName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      recyclerReg: 'KSPCB/EW-2024/MNG-0142',
      recyclerAddr: 'Baikampady Industrial Area, Plot 42, Mangaluru',
      mode: 'PICKUP' as const,
      transportCost: 0,
      method: 'UPI' as const,
      upiRef: '431209481192',
      items: [
        { catId: 'cat_copper', catName: 'Copper Wires & Cables', declKg: 8, weighKg: 8.2, rate: 660, co2: 3.4 },
        { catId: 'cat_batteries', catName: 'Batteries & Damaged Lithium Cells', declKg: 12, weighKg: 11.5, rate: 122, co2: 2.6 },
      ],
    },
    {
      idx: 5,
      daysAgoNum: 7,
      collectorId: 'usr_col_suresh',
      collectorName: 'Suresh Nayak',
      collectorArea: 'Bejai, Mangaluru',
      recyclerUid: 'usr_rec_greenearth',
      recyclerName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      recyclerReg: 'KSPCB/EW-2024/MNG-0142',
      recyclerAddr: 'Baikampady Industrial Area, Plot 42, Mangaluru',
      mode: 'PICKUP' as const,
      transportCost: 0,
      method: 'CASH' as const,
      upiRef: null,
      items: [
        { catId: 'cat_pcb', catName: 'Printed Circuit Boards (PCBs)', declKg: 9, weighKg: 9.4, rate: 505, co2: 4.8 },
        { catId: 'cat_computer', catName: 'Computer & Server Units', declKg: 20, weighKg: 21, rate: 235, co2: 3.8 },
      ],
    },
  ];

  for (const tx of historicalTxs) {
    const ts = daysAgo(tx.daysAgoNum);
    const lotId = `lot_seed_${tx.idx}`;
    const bookingId = `bkg_seed_${tx.idx}`;
    const receiptId = `KWC-2026-000${tx.idx}`;

    db.prepare(
      `INSERT INTO lots (id, collector_id, status, lat, lng, area_label, notes, created_at, updated_at)
       VALUES (?, ?, 'COMPLETED', 12.8732, 74.8554, ?, 'Seeded historical lot', ?, ?)`
    ).run(lotId, tx.collectorId, tx.collectorArea, ts, ts);

    const rateSnapshot: Record<string, { categoryName: string; pricePerKg: number; co2FactorPerKg: number }> = {};
    const weighedItems: WeighedItem[] = [];
    let estTotal = 0;
    let grossAmount = 0;
    let totalDeclKg = 0;
    let totalWeighKg = 0;
    let totalCo2 = 0;

    for (const it of tx.items) {
      db.prepare('INSERT INTO lot_items (id, lot_id, category_id, declared_kg) VALUES (?, ?, ?, ?)').run(
        `li_seed_${tx.idx}_${it.catId}`,
        lotId,
        it.catId,
        it.declKg
      );
      rateSnapshot[it.catId] = {
        categoryName: it.catName,
        pricePerKg: it.rate,
        co2FactorPerKg: it.co2,
      };
      const lineTotal = Math.round(it.weighKg * it.rate);
      estTotal += Math.round(it.declKg * it.rate);
      grossAmount += lineTotal;
      totalDeclKg += it.declKg;
      totalWeighKg += it.weighKg;
      totalCo2 += Math.round(it.weighKg * it.co2 * 100) / 100;
      weighedItems.push({
        categoryId: it.catId,
        categoryName: it.catName,
        declaredKg: it.declKg,
        weighedKg: it.weighKg,
        ratePerKg: it.rate,
        lineTotal,
      });
    }

    const netAmount = Math.max(0, grossAmount - tx.transportCost);

    db.prepare(
      `INSERT INTO bookings (
        id, lot_id, recycler_id, collector_id, status, mode, slot_start, slot_end,
        rate_snapshot, estimated_total, transport_cost, handover_code_hash,
        handover_code_enc, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bookingId,
      lotId,
      tx.recyclerUid,
      tx.collectorId,
      tx.mode,
      ts,
      ts,
      JSON.stringify(rateSnapshot),
      estTotal,
      tx.transportCost,
      hashHandoverCode(bookingId, '4821'),
      '4821',
      ts,
      ts,
      ts
    );

    db.prepare(
      `INSERT INTO handovers (
        id, booking_id, weighed_items, gross_amount, transport_cost, net_amount,
        collector_confirmed_at, recycler_confirmed_at, lat, lng, accuracy_m, photo_url, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 12.8732, 74.8554, 12, ?, ?)`
    ).run(
      `hnd_seed_${tx.idx}`,
      bookingId,
      JSON.stringify(weighedItems),
      grossAmount,
      tx.transportCost,
      netAmount,
      ts,
      ts,
      '/src/assets/images/collector_weighbridge_1794898241505.jpg',
      ts
    );

    const payload: ReceiptPayload = {
      receiptId,
      bookingId,
      issuedAt: ts,
      collectorName: tx.collectorName,
      collectorArea: tx.collectorArea,
      recyclerBusinessName: tx.recyclerName,
      recyclerRegistrationNumber: tx.recyclerReg,
      recyclerAddress: tx.recyclerAddr,
      mode: tx.mode,
      items: weighedItems,
      totalDeclaredKg: Math.round(totalDeclKg * 100) / 100,
      totalWeighedKg: Math.round(totalWeighKg * 100) / 100,
      grossAmount,
      transportCost: tx.transportCost,
      netAmount,
      lotPhotoUrls: ['/src/assets/images/collector_weighbridge_1794898241505.jpg'],
      handoverPhotoUrl: '/src/assets/images/hero_ewaste_hub_1794898241189.jpg',
      handoverLocation: { lat: 12.8732, lng: 74.8554, accuracyM: 12 },
      disclaimer: EPR_DISCLAIMER,
    };

    const sig = signReceiptPayload(payload);

    db.prepare(
      `INSERT INTO receipts (id, booking_id, payload, signature, pdf_url, issued_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(receiptId, bookingId, JSON.stringify(payload), sig, `/api/receipts/${receiptId}/pdf`, ts);

    db.prepare(
      `INSERT INTO payments (id, booking_id, method, amount, upi_ref, recycler_marked_at, collector_confirmed_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')`
    ).run(`pay_seed_${tx.idx}`, bookingId, tx.method, netAmount, tx.upiRef, ts, ts);

    db.prepare(
      `INSERT INTO ledger_entries (id, collector_id, receipt_id, gross_amount, transport_cost, net_amount, kg, co2_saved_kg, date, method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `ldg_seed_${tx.idx}`,
      tx.collectorId,
      receiptId,
      grossAmount,
      tx.transportCost,
      netAmount,
      Math.round(totalWeighKg * 100) / 100,
      Math.round(totalCo2 * 100) / 100,
      ts,
      tx.method
    );

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, entity, entity_id, action, meta, at)
       VALUES (?, ?, 'Booking', ?, 'COMPLETED', ?, ?)`
    ).run(
      `aud_seed_${tx.idx}`,
      tx.collectorId,
      bookingId,
      JSON.stringify({ seeded: true, netAmount }),
      ts
    );
  }

  return { seeded: true };
}

// Allow direct CLI execution via `npm run seed`
const isDirect = process.argv[1] && process.argv[1].endsWith('seed.ts');
if (isDirect) {
  const force = process.argv.includes('--reset');
  seedDatabase(force)
    .then((res) => {
      console.log('Kabadiwala Connect seed result:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
