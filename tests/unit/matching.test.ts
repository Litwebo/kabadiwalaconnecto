import { describe, expect, it } from 'vitest';
import {
  computeTransportCost,
  matchRecyclersCore,
  type MatchingLotInput,
  type MatchingRecyclerInput,
} from '../../src/server/services/matching.ts';
import { haversineKm } from '../../src/shared/format.ts';

const baseLot: MatchingLotInput = {
  lat: 12.8732,
  lng: 74.8554,
  totalKg: 10,
  hasHazardous: false,
  items: [
    { categoryId: 'cat_copper', categoryName: 'Copper Wires & Cables', declaredKg: 6 },
    { categoryId: 'cat_pcb', categoryName: 'Printed Circuit Boards (PCBs)', declaredKg: 4 },
  ],
};

function makeRecycler(overrides: Partial<MatchingRecyclerInput> = {}): MatchingRecyclerInput {
  return {
    recyclerId: 'rec_1',
    recyclerUserId: 'usr_1',
    businessName: 'Alpha Recyclers',
    registrationNumber: 'KSPCB-001',
    address: 'Mangaluru',
    verificationStatus: 'APPROVED',
    registrationExpiry: new Date(Date.now() + 30 * 86400000).toISOString(),
    lat: 12.9141,
    lng: 74.856,
    serviceRadiusKm: 20,
    mode: 'BOTH',
    minQtyKg: 5,
    acceptsHazardous: true,
    slotRules: [
      { dayLabel: 'Today', windows: [{ startHour: 10, endHour: 13, label: '10:00 AM - 1:00 PM' }] },
      { dayLabel: 'Tomorrow', windows: [{ startHour: 9, endHour: 12, label: '9:00 AM - 12:00 PM' }] },
    ],
    ratesByCategory: {
      cat_copper: { pricePerKg: 650, active: true },
      cat_pcb: { pricePerKg: 500, active: true },
    },
    ...overrides,
  };
}

describe('Matching Engine & Transport Cost', () => {
  it('computes round-trip transport cost for DELIVERY and ₹0 for PICKUP', () => {
    expect(computeTransportCost(10, 'PICKUP', 7)).toBe(0);
    expect(computeTransportCost(10, 'DELIVERY', 7)).toBe(140);
    expect(computeTransportCost(5.5, 'DELIVERY', 8)).toBe(88);
  });

  it('computes accurate Haversine distance in km', () => {
    const km = haversineKm(12.8732, 74.8554, 12.9612, 74.8051);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(12.5);
  });

  it('excludes unapproved, expired, or out-of-radius recyclers completely', () => {
    const res = matchRecyclersCore({
      lot: baseLot,
      costPerKm: 7,
      recyclers: [
        makeRecycler({ recyclerId: 'pending', verificationStatus: 'PENDING' }),
        makeRecycler({
          recyclerId: 'expired',
          registrationExpiry: new Date(Date.now() - 86400000).toISOString(),
        }),
        makeRecycler({ recyclerId: 'far', lat: 13.5, lng: 75.5, serviceRadiusKm: 10 }),
      ],
    });
    expect(res.eligible).toHaveLength(0);
    expect(res.partial).toHaveLength(0);
  });

  it('routes missing-category, low-qty, and non-hazardous recyclers to partial matches with clear reasons', () => {
    const hazLot: MatchingLotInput = {
      ...baseLot,
      hasHazardous: true,
      items: [
        ...baseLot.items,
        { categoryId: 'cat_batteries', categoryName: 'Batteries', declaredKg: 2 },
      ],
    };

    const res = matchRecyclersCore({
      lot: hazLot,
      costPerKm: 7,
      recyclers: [
        makeRecycler({
          recyclerId: 'partial_rec',
          acceptsHazardous: false,
          minQtyKg: 25,
          ratesByCategory: {
            cat_copper: { pricePerKg: 650, active: true },
            cat_pcb: { pricePerKg: 500, active: true },
          },
        }),
      ],
    });

    expect(res.eligible).toHaveLength(0);
    expect(res.partial).toHaveLength(1);
    expect(res.partial[0].ineligibleReasons).toHaveLength(3);
    expect(res.partial[0].missingCategories).toContain('Batteries');
  });

  it('tags BEST_NET_PRICE, NEAREST, and EARLIEST_PICKUP and sorts properly', () => {
    const rBestPrice = makeRecycler({
      recyclerId: 'best_price',
      businessName: 'High Pay DELIVERY',
      mode: 'DELIVERY',
      lat: 12.9612,
      lng: 74.8051,
      serviceRadiusKm: 30,
      ratesByCategory: {
        cat_copper: { pricePerKg: 750, active: true },
        cat_pcb: { pricePerKg: 560, active: true },
      },
      slotRules: [
        { dayLabel: 'Today', windows: [{ startHour: 22, endHour: 23, label: '10:00 PM - 11:00 PM' }] },
      ],
    });
    const rNearest = makeRecycler({
      recyclerId: 'nearest',
      businessName: 'Nearby PICKUP',
      mode: 'PICKUP',
      lat: 12.874,
      lng: 74.855,
      ratesByCategory: {
        cat_copper: { pricePerKg: 620, active: true },
        cat_pcb: { pricePerKg: 480, active: true },
      },
      slotRules: [
        { dayLabel: 'Today', windows: [{ startHour: 20, endHour: 22, label: '8:00 PM - 10:00 PM' }] },
      ],
    });

    const fixedNow = new Date();
    fixedNow.setHours(8, 0, 0, 0);

    const byPrice = matchRecyclersCore({
      lot: baseLot,
      costPerKm: 7,
      sort: 'net_price',
      now: fixedNow,
      recyclers: [rNearest, rBestPrice],
    });
    expect(byPrice.eligible[0].recyclerId).toBe('best_price');
    expect(byPrice.eligible[0].transportCost).toBeGreaterThan(0);
    expect(byPrice.eligible[0].tags).toContain('BEST_NET_PRICE');
    expect(byPrice.eligible[1].transportCost).toBe(0);
    expect(byPrice.eligible[1].tags).toContain('NEAREST');
    expect(byPrice.eligible[1].tags).toContain('EARLIEST_PICKUP');

    const byNearest = matchRecyclersCore({
      lot: baseLot,
      costPerKm: 7,
      sort: 'nearest',
      now: fixedNow,
      recyclers: [rBestPrice, rNearest],
    });
    expect(byNearest.eligible[0].recyclerId).toBe('nearest');
  });
});
