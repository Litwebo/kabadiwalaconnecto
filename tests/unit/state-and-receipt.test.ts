import { describe, expect, it } from 'vitest';
import { signReceiptPayload, verifyReceiptSignature } from '../../src/server/services/receipts.ts';
import {
  EPR_DISCLAIMER,
  StateTransitionError,
  assertBookingTransition,
  assertLotTransition,
  formatINR,
} from '../../src/shared/format.ts';
import type { ReceiptPayload } from '../../src/shared/types.ts';

describe('State Machines, Formatting, and HMAC Receipt Signing', () => {
  it('formats Indian Rupees with Indian digit grouping', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(6600)).toBe('₹6,600');
  });

  it('enforces valid and invalid lot transitions', () => {
    expect(() => assertLotTransition('DRAFT', 'LISTED')).not.toThrow();
    expect(() => assertLotTransition('LISTED', 'BOOKED')).not.toThrow();
    expect(() => assertLotTransition('COMPLETED', 'LISTED')).toThrow(StateTransitionError);
    expect(() => assertLotTransition('CANCELLED', 'DRAFT')).toThrow(StateTransitionError);
  });

  it('enforces valid and invalid booking transitions', () => {
    expect(() => assertBookingTransition('REQUESTED', 'ACCEPTED')).not.toThrow();
    expect(() => assertBookingTransition('ACCEPTED', 'HANDED_OVER')).not.toThrow();
    expect(() => assertBookingTransition('HANDED_OVER', 'PAID')).not.toThrow();
    expect(() => assertBookingTransition('PAID', 'COMPLETED')).not.toThrow();
    expect(() => assertBookingTransition('COMPLETED', 'CANCELLED')).toThrow(StateTransitionError);
    expect(() => assertBookingTransition('REQUESTED', 'PAID')).toThrow(StateTransitionError);
  });

  it('signs receipts with HMAC-SHA256 and detects tampering', () => {
    const payload: ReceiptPayload = {
      receiptId: 'KWC-2026-9999',
      bookingId: 'bkg_test_1',
      issuedAt: '2026-06-01T10:00:00.000Z',
      collectorName: 'Ramesh Poojary',
      collectorArea: 'Kankanady, Mangaluru',
      recyclerBusinessName: 'GreenEarth E-Waste Recyclers Pvt Ltd',
      recyclerRegistrationNumber: 'KSPCB/EW-2024/MNG-0142',
      recyclerAddress: 'Baikampady, Mangaluru',
      mode: 'PICKUP',
      items: [
        {
          categoryId: 'cat_copper',
          categoryName: 'Copper Wires & Cables',
          declaredKg: 10,
          weighedKg: 11.5,
          ratePerKg: 660,
          lineTotal: 7590,
        },
      ],
      totalDeclaredKg: 10,
      totalWeighedKg: 11.5,
      grossAmount: 7590,
      transportCost: 0,
      netAmount: 7590,
      lotPhotoUrls: ['/uploads/test.jpg'],
      handoverPhotoUrl: '/uploads/scale.jpg',
      handoverLocation: { lat: 12.8732, lng: 74.8554, accuracyM: 12 },
      disclaimer: EPR_DISCLAIMER,
    };

    const sig = signReceiptPayload(payload);
    expect(verifyReceiptSignature(payload, sig)).toBe(true);

    const tampered: ReceiptPayload = { ...payload, netAmount: 99999 };
    expect(verifyReceiptSignature(tampered, sig)).toBe(false);
  });
});
