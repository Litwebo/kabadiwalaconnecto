export type UserRole = 'COLLECTOR' | 'RECYCLER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type LanguageCode = 'en' | 'hi' | 'kn';

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ServiceMode = 'PICKUP' | 'DELIVERY' | 'BOTH';
export type BookingMode = 'PICKUP' | 'DELIVERY';

export type LotStatus = 'DRAFT' | 'LISTED' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';
export type BookingStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'HANDED_OVER'
  | 'PAID'
  | 'COMPLETED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'DISPUTED';

export type PaymentMethod = 'CASH' | 'UPI';
export type PaymentStatus = 'PENDING' | 'MARKED_PAID' | 'CONFIRMED' | 'DISPUTED';
export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface UserDTO {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  language: LanguageCode;
  areaLabel: string;
  lat: number;
  lng: number;
  upiId: string | null;
  status: UserStatus;
  consentAt: string | null;
  createdAt: string;
}

export interface SlotRule {
  dayLabel: string;
  windows: { startHour: number; endHour: number; label: string }[];
}

export interface RecyclerProfileDTO {
  id: string;
  userId: string;
  businessName: string;
  registrationNumber: string;
  authorisationDocUrls: string[];
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  registrationExpiry: string;
  serviceRadiusKm: number;
  lat: number;
  lng: number;
  address: string;
  mode: ServiceMode;
  minQtyKg: number;
  acceptsHazardous: boolean;
  slotRules: SlotRule[];
  rates?: RecyclerRateDTO[];
  userName?: string;
  userPhone?: string;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  nameHi: string;
  nameKn: string;
  hazardous: boolean;
  iconKey: string;
  co2FactorPerKg: number;
  active: boolean;
  referenceRatePerKg?: number;
  referenceUpdatedAt?: string;
}

export interface RecyclerRateDTO {
  id: string;
  recyclerId: string;
  categoryId: string;
  categoryName?: string;
  pricePerKg: number;
  active: boolean;
  updatedAt: string;
}

export interface LotItemDTO {
  id?: string;
  categoryId: string;
  categoryName?: string;
  categoryNameHi?: string;
  categoryNameKn?: string;
  hazardous?: boolean;
  declaredKg: number;
}

export interface LotDTO {
  id: string;
  collectorId: string;
  collectorName?: string;
  status: LotStatus;
  lat: number;
  lng: number;
  areaLabel: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: LotItemDTO[];
  photos: { id: string; url: string }[];
  totalKg: number;
  activeBookingId?: string | null;
  activeBookingStatus?: BookingStatus | null;
}

export interface EstimateItemBreakdown {
  categoryId: string;
  categoryName: string;
  hazardous: boolean;
  declaredKg: number;
  medianRatePerKg: number;
  lowAmount: number;
  highAmount: number;
  source: 'REGIONAL_MEDIAN' | 'REFERENCE_RATE';
  recyclerSampleCount: number;
}

export interface LotEstimateDTO {
  lotId: string;
  totalKg: number;
  lowTotal: number;
  midTotal: number;
  highTotal: number;
  hasHazardous: boolean;
  computedAt: string;
  disclaimer: string;
  items: EstimateItemBreakdown[];
}

export interface MatchCandidateDTO {
  recyclerId: string;
  recyclerUserId: string;
  businessName: string;
  registrationNumber: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceKm: number;
  mode: ServiceMode;
  effectiveMode: BookingMode;
  minQtyKg: number;
  acceptsHazardous: boolean;
  eligible: boolean;
  partial: boolean;
  ineligibleReasons: string[];
  missingCategories: string[];
  perMaterialRates: {
    categoryId: string;
    categoryName: string;
    declaredKg: number;
    ratePerKg: number;
    lineTotal: number;
  }[];
  offerTotal: number;
  transportCost: number;
  netAmount: number;
  nextSlots: { start: string; end: string; label: string }[];
  tags: ('BEST_NET_PRICE' | 'NEAREST' | 'EARLIEST_PICKUP')[];
}

export interface BookingDTO {
  id: string;
  lotId: string;
  recyclerId: string;
  collectorId: string;
  status: BookingStatus;
  mode: BookingMode;
  slotStart: string;
  slotEnd: string;
  rateSnapshot: Record<string, { categoryName: string; pricePerKg: number; co2FactorPerKg: number }>;
  estimatedTotal: number;
  transportCost: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  handoverCode?: string | null;
  collectorName?: string;
  collectorArea?: string;
  collectorPhone?: string | null;
  collectorUpiId?: string | null;
  recyclerBusinessName?: string;
  recyclerRegistrationNumber?: string;
  recyclerAddress?: string;
  recyclerPhone?: string | null;
  lot?: LotDTO;
  handover?: HandoverDTO | null;
  receipt?: ReceiptDTO | null;
  payment?: PaymentDTO | null;
  dispute?: DisputeDTO | null;
}

export interface WeighedItem {
  categoryId: string;
  categoryName: string;
  declaredKg: number;
  weighedKg: number;
  ratePerKg: number;
  lineTotal: number;
}

export interface HandoverDTO {
  id: string;
  bookingId: string;
  weighedItems: WeighedItem[];
  grossAmount: number;
  transportCost: number;
  netAmount: number;
  collectorConfirmedAt: string | null;
  recyclerConfirmedAt: string | null;
  lat: number;
  lng: number;
  accuracyM: number;
  photoUrl: string;
  confirmedAt: string | null;
}

export interface ReceiptPayload {
  receiptId: string;
  bookingId: string;
  issuedAt: string;
  collectorName: string;
  collectorArea: string;
  recyclerBusinessName: string;
  recyclerRegistrationNumber: string;
  recyclerAddress: string;
  mode: BookingMode;
  items: WeighedItem[];
  totalDeclaredKg: number;
  totalWeighedKg: number;
  grossAmount: number;
  transportCost: number;
  netAmount: number;
  lotPhotoUrls: string[];
  handoverPhotoUrl: string;
  handoverLocation: { lat: number; lng: number; accuracyM: number };
  disclaimer: string;
}

export interface ReceiptDTO {
  id: string;
  bookingId: string;
  payload: ReceiptPayload;
  signature: string;
  pdfUrl: string;
  issuedAt: string;
  verified?: boolean;
}

export interface PaymentDTO {
  id: string;
  bookingId: string;
  method: PaymentMethod;
  amount: number;
  upiRef: string | null;
  upiDeepLink?: string | null;
  collectorUpiId?: string | null;
  recyclerMarkedAt: string | null;
  collectorConfirmedAt: string | null;
  status: PaymentStatus;
}

export interface LedgerEntryDTO {
  id: string;
  collectorId: string;
  receiptId: string;
  grossAmount: number;
  transportCost: number;
  netAmount: number;
  kg: number;
  co2SavedKg: number;
  date: string;
  method: PaymentMethod;
  recyclerBusinessName?: string;
}

export interface DisputeDTO {
  id: string;
  bookingId: string;
  raisedById: string;
  raisedByName?: string;
  reason: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDTO {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
