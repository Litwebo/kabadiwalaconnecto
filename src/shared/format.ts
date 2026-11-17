import type { BookingStatus, LotStatus } from './types.ts';

/**
 * Formats an amount using Indian digit grouping (₹1,23,456).
 */
export function formatINR(amount: number, decimals = 0): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
  return `₹${formatted}`;
}

export function formatKg(kg: number): string {
  const safe = Number.isFinite(kg) ? kg : 0;
  return `${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(safe)} kg`;
}

export function formatDateTimeIN(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

/**
 * Haversine great-circle distance in kilometres between two WGS-84 coordinates.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export const LOT_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  DRAFT: ['LISTED', 'CANCELLED'],
  LISTED: ['DRAFT', 'BOOKED', 'CANCELLED'],
  BOOKED: ['LISTED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['HANDED_OVER', 'CANCELLED', 'DISPUTED'],
  HANDED_OVER: ['PAID', 'DISPUTED'],
  PAID: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  DISPUTED: ['HANDED_OVER', 'PAID', 'COMPLETED', 'CANCELLED'],
};

export function canTransitionLot(from: LotStatus, to: LotStatus): boolean {
  if (from === to) return true;
  return (LOT_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return (BOOKING_TRANSITIONS[from] || []).includes(to);
}

export function assertLotTransition(from: LotStatus, to: LotStatus): void {
  if (!canTransitionLot(from, to)) {
    throw new StateTransitionError(`Illegal lot transition: ${from} -> ${to}`);
  }
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) {
    throw new StateTransitionError(`Illegal booking transition: ${from} -> ${to}`);
  }
}

export class StateTransitionError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'StateTransitionError';
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return sorted[mid];
}

export const EPR_DISCLAIMER =
  'Transaction record only. Not an EPR certificate under the E-Waste (Management) Rules, 2022.';
