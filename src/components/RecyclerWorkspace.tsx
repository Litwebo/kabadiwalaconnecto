import {
  AlertTriangle,
  Banknote,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  History,
  IndianRupee,
  Navigation,
  Phone,
  QrCode,
  Smartphone,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { compressImageForUpload } from '../lib/imageCompress.ts';
import { formatDateTimeIN, formatINR, formatKg } from '../shared/format.ts';
import type { BookingDTO, PaymentMethod, RecyclerProfileDTO, ServiceMode } from '../shared/types.ts';
import { AppShell, type NavTab } from './AppShell.tsx';
import { LeafletMapPicker } from './LeafletMapPicker.tsx';
import { StageTransition, StampBadge3D, TiltCard3D } from './MotionPrimitives.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface RecyclerWorkspaceProps {
  onOpenReceipt?: (receiptId: string) => void;
}

export const RecyclerWorkspace: React.FC<RecyclerWorkspaceProps> = ({ onOpenReceipt }) => {
  const { categories, refreshNotifications, t } = useApp();
  const [tab, setTab] = useState<'profile' | 'rates' | 'requests' | 'pickups' | 'history'>('profile');
  const [profile, setProfile] = useState<RecyclerProfileDTO | null>(null);
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Profile fields
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('2027-06-30');
  const [serviceRadiusKm, setServiceRadiusKm] = useState(20);
  const [minQtyKg, setMinQtyKg] = useState(5);
  const [mode, setMode] = useState<ServiceMode>('BOTH');
  const [acceptsHazardous, setAcceptsHazardous] = useState(false);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(12.9141);
  const [lng, setLng] = useState(74.856);
  const [docKeys, setDocKeys] = useState<string[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Rate card state
  const [rateDrafts, setRateDrafts] = useState<Record<string, { price: number; active: boolean }>>({});

  // Handover weigh-in state keyed by bookingId
  const [weighedDrafts, setWeighedDrafts] = useState<Record<string, Record<string, number>>>({});
  const [handoverCodes, setHandoverCodes] = useState<Record<string, string>>({});
  const [handoverPhotos, setHandoverPhotos] = useState<Record<string, string>>({});
  const [handoverGps, setHandoverGps] = useState<
    Record<string, { lat: number; lng: number; accuracyM: number }>
  >({});
  const [paymentMethodDrafts, setPaymentMethodDrafts] = useState<Record<string, PaymentMethod>>({});
  const [upiRefDrafts, setUpiRefDrafts] = useState<Record<string, string>>({});
  const [upiQrMap, setUpiQrMap] = useState<
    Record<string, { upiDeepLink: string; qrDataUrl: string; upiId: string; amount: number }>
  >({});
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, bkgRes] = await Promise.all([
        apiFetch<{ profile: RecyclerProfileDTO | null }>('/api/recycler/profile'),
        apiFetch<{ bookings: BookingDTO[] }>('/api/bookings'),
      ]);
      setProfile(profRes.profile);
      setBookings(bkgRes.bookings);

      if (profRes.profile) {
        setBusinessName(profRes.profile.businessName);
        setRegistrationNumber(profRes.profile.registrationNumber);
        setRegistrationExpiry(profRes.profile.registrationExpiry.slice(0, 10));
        setServiceRadiusKm(profRes.profile.serviceRadiusKm);
        setMinQtyKg(profRes.profile.minQtyKg);
        setMode(profRes.profile.mode);
        setAcceptsHazardous(profRes.profile.acceptsHazardous);
        setAddress(profRes.profile.address);
        setLat(profRes.profile.lat);
        setLng(profRes.profile.lng);

        const rMap: Record<string, { price: number; active: boolean }> = {};
        for (const cat of categories) {
          const existing = profRes.profile.rates?.find((r) => r.categoryId === cat.id);
          rMap[cat.id] = {
            price: existing ? existing.pricePerKg : cat.referenceRatePerKg || 50,
            active: existing ? existing.active : false,
          };
        }
        setRateDrafts(rMap);
      } else {
        const rMap: Record<string, { price: number; active: boolean }> = {};
        for (const cat of categories) {
          rMap[cat.id] = { price: cat.referenceRatePerKg || 50, active: false };
        }
        setRateDrafts(rMap);
      }

      // Initialize weigh-in defaults for ACCEPTED bookings
      setWeighedDrafts((prev) => {
        const next = { ...prev };
        for (const b of bkgRes.bookings) {
          if (b.status === 'ACCEPTED' && b.lot && !next[b.id]) {
            const m: Record<string, number> = {};
            for (const it of b.lot.items) m[it.categoryId] = it.declaredKg;
            next[b.id] = m;
          }
        }
        return next;
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab !== 'pickups') return;
    for (const b of bookings) {
      if (b.status === 'HANDED_OVER' && b.collectorUpiId && !upiQrMap[b.id]) {
        apiFetch<{ upiDeepLink: string; qrDataUrl: string; upiId: string; amount: number }>(
          `/api/bookings/${b.id}/upi-qr`
        )
          .then((res) => setUpiQrMap((prev) => ({ ...prev, [b.id]: res })))
          .catch(() => {});
      }
    }
  }, [tab, bookings, upiQrMap]);

  const requestedBookings = useMemo(() => bookings.filter((b) => b.status === 'REQUESTED'), [bookings]);
  const activePickupBookings = useMemo(
    () => bookings.filter((b) => ['ACCEPTED', 'HANDED_OVER', 'PAID', 'DISPUTED'].includes(b.status)),
    [bookings]
  );
  const completedBookings = useMemo(
    () => bookings.filter((b) => ['COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED'].includes(b.status)),
    [bookings]
  );

  const tabs: NavTab[] = [
    { id: 'profile', label: 'Facility', icon: <Building2 className="w-5 h-5" /> },
    { id: 'rates', label: t('nav.rates'), icon: <IndianRupee className="w-5 h-5" /> },
    {
      id: 'requests',
      label: `${t('nav.requests')}${requestedBookings.length ? ` (${requestedBookings.length})` : ''}`,
      icon: <ClipboardList className="w-5 h-5" />,
    },
    {
      id: 'pickups',
      label: `${t('nav.pickups')}${activePickupBookings.length ? ` (${activePickupBookings.length})` : ''}`,
      icon: <Truck className="w-5 h-5" />,
    },
    { id: 'history', label: t('nav.history'), icon: <History className="w-5 h-5" /> },
  ];

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ key: string }>('/api/uploads/private', {
        method: 'POST',
        body: formData,
      });
      setDocKeys((prev) => [...prev, res.key]);
      setNotice('Authorization document uploaded to private bucket.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ profile: RecyclerProfileDTO }>('/api/recycler/profile', {
        method: 'PUT',
        body: JSON.stringify({
          businessName,
          registrationNumber,
          registrationExpiry: new Date(registrationExpiry).toISOString(),
          serviceRadiusKm: Number(serviceRadiusKm),
          lat,
          lng,
          address,
          mode,
          minQtyKg: Number(minQtyKg),
          acceptsHazardous,
          slotRules: profile?.slotRules?.length
            ? profile.slotRules
            : [
                {
                  dayLabel: 'Today',
                  windows: [{ startHour: 10, endHour: 13, label: '10:00 AM - 1:00 PM' }],
                },
                {
                  dayLabel: 'Tomorrow',
                  windows: [{ startHour: 9, endHour: 12, label: '9:00 AM - 12:00 PM' }],
                },
              ],
          authorisationDocKeys: docKeys,
        }),
      });
      setProfile(res.profile);
      setDocKeys([]);
      setNotice('Business profile saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    }
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const payload = Object.entries(rateDrafts).map(([categoryId, val]) => ({
        categoryId,
        pricePerKg: Number(val.price),
        active: val.active,
      }));
      const res = await apiFetch<{ profile: RecyclerProfileDTO }>('/api/recycler/rates', {
        method: 'PUT',
        body: JSON.stringify({ rates: payload }),
      });
      setProfile(res.profile);
      setNotice('Rate card updated. Existing active bookings retain their locked rate snapshot.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save rate card.');
    }
  };

  const handleRespondBooking = async (bookingId: string, decision: 'ACCEPTED' | 'DECLINED') => {
    setBusyBookingId(bookingId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await Promise.all([loadAll(), refreshNotifications()]);
      setNotice(
        decision === 'ACCEPTED'
          ? `Booking ${bookingId} accepted! Collector phone is now unlocked under Pickups.`
          : `Booking ${bookingId} declined.`
      );
      if (decision === 'ACCEPTED') setTab('pickups');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to respond to booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleHandoverPhotoUpload = async (bookingId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusyBookingId(bookingId);
    try {
      const compressed = await compressImageForUpload(file, 1280, 0.8);
      const fd = new FormData();
      fd.append('file', compressed.blob, 'handover.jpg');
      const stored = await apiFetch<{ publicUrl: string }>('/api/uploads/public', {
        method: 'POST',
        body: fd,
      });
      setHandoverPhotos((prev) => ({ ...prev, [bookingId]: stored.publicUrl }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Handover photo upload failed.');
    } finally {
      setBusyBookingId(null);
      e.target.value = '';
    }
  };

  const handleCaptureHandoverGps = (booking: BookingDTO) => {
    const fallbackLat = booking.lot?.lat ?? lat;
    const fallbackLng = booking.lot?.lng ?? lng;
    if (!navigator.geolocation) {
      setHandoverGps((prev) => ({ ...prev, [booking.id]: { lat: fallbackLat, lng: fallbackLng, accuracyM: 35 } }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHandoverGps((prev) => ({
          ...prev,
          [booking.id]: {
            lat: Math.round(pos.coords.latitude * 100000) / 100000,
            lng: Math.round(pos.coords.longitude * 100000) / 100000,
            accuracyM: Math.round(pos.coords.accuracy),
          },
        }));
      },
      () => {
        setHandoverGps((prev) => ({ ...prev, [booking.id]: { lat: fallbackLat, lng: fallbackLng, accuracyM: 40 } }));
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleSubmitHandover = async (booking: BookingDTO) => {
    const code = (handoverCodes[booking.id] || '').trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Enter the 4-digit handover code shown on the collector’s phone.');
      return;
    }
    const photoUrl = handoverPhotos[booking.id];
    if (!photoUrl) {
      setError('Attach a photo of the weighed lot / scale before submitting handover.');
      return;
    }
    const weights = weighedDrafts[booking.id] || {};
    const weighedItems = (booking.lot?.items || []).map((it) => ({
      categoryId: it.categoryId,
      weighedKg: Number(weights[it.categoryId] ?? it.declaredKg),
    }));
    const gps = handoverGps[booking.id] || {
      lat: booking.lot?.lat ?? lat,
      lng: booking.lot?.lng ?? lng,
      accuracyM: 25,
    };

    setBusyBookingId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/bookings/${booking.id}/handover/submit`, {
        method: 'POST',
        body: JSON.stringify({
          handoverCode: code,
          weighedItems,
          lat: gps.lat,
          lng: gps.lng,
          accuracyM: gps.accuracyM,
          photoUrl,
        }),
      });
      await Promise.all([loadAll(), refreshNotifications()]);
      setNotice(`Weigh-in submitted for ${booking.id}! Waiting for collector confirmation.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Handover submission failed.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleMarkPayment = async (booking: BookingDTO) => {
    const method: PaymentMethod =
      paymentMethodDrafts[booking.id] || (booking.collectorUpiId ? 'UPI' : 'CASH');
    const upiRef = (upiRefDrafts[booking.id] || '').trim();
    if (method === 'UPI' && upiRef.length < 4) {
      setError('Enter the UPI / UTR transaction reference (at least 4 characters).');
      return;
    }
    setBusyBookingId(booking.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/bookings/${booking.id}/payment/mark`, {
        method: 'POST',
        body: JSON.stringify({ method, upiRef: method === 'UPI' ? upiRef : undefined }),
      });
      await Promise.all([loadAll(), refreshNotifications()]);
      setNotice(
        `Payment marked sent (${method}) for ${booking.id}. Waiting for collector confirmation.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to mark payment.');
    } finally {
      setBusyBookingId(null);
    }
  };

  return (
    <AppShell tabs={tabs} activeTab={tab} onSelectTab={(id) => setTab(id as typeof tab)}>
      <div className="space-y-5">
        {!loading && (
          <TiltCard3D
            maxTiltDeg={3}
            sheenColor={profile?.verificationStatus === 'APPROVED' ? 'emerald' : 'copper'}
            className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-start gap-3.5">
              <StampBadge3D
                icon={<Building2 className="w-5 h-5" />}
                tone={profile?.verificationStatus === 'APPROVED' ? 'emerald' : 'copper'}
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold">{profile?.businessName || 'Complete Recycler Registration'}</h1>
                  <StatusBadge status={profile?.verificationStatus || 'PENDING'} />
                </div>
                {(!profile || profile.verificationStatus === 'PENDING') && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">{t('recycler.pendingBody')}</p>
                )}
                {profile?.verificationStatus === 'REJECTED' && (
                  <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Rejected: {profile.rejectionReason}</span>
                  </p>
                )}
                {profile?.verificationStatus === 'APPROVED' && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Verified & visible in collector matching searches.</span>
                  </p>
                )}
              </div>
            </div>
          </TiltCard3D>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200"
          >
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
            {notice}
          </div>
        )}

        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4"
          >
            <h2 className="text-lg font-bold">Business & Compliance Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Registered Business Name</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">CPCB / SPCB Registration No.</label>
                <input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Registration Expiry Date</label>
                <input
                  type="date"
                  value={registrationExpiry}
                  onChange={(e) => setRegistrationExpiry(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Collection Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ServiceMode)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
                >
                  <option value="BOTH">Both Pickup & Collector Drop-off</option>
                  <option value="PICKUP">Pickup Only (Recycler Van)</option>
                  <option value="DELIVERY">Delivery Only (Collector Drops Off)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Service Radius (km)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Minimum Lot Weight (kg)</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={minQtyKg}
                  onChange={(e) => setMinQtyKg(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Facility Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
                required
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsHazardous}
                onChange={(e) => setAcceptsHazardous(e.target.checked)}
                className="w-4 h-4 accent-[#b04a17]"
              />
              <span>Facility authorised to handle hazardous categories (Batteries, Lithium Cells, CRT)</span>
            </label>

            <div className="space-y-2">
              <div className="text-xs font-medium">
                Facility Pin Location ({lat.toFixed(4)}, {lng.toFixed(4)})
              </div>
              <LeafletMapPicker
                lat={lat}
                lng={lng}
                onChange={(la, ln) => {
                  setLat(la);
                  setLng(ln);
                }}
              />
            </div>

            <div className="pt-2 space-y-2">
              <div className="text-xs font-medium">Authorization Certificates (Private Bucket · Signed URLs)</div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-[#b04a17] text-[#b04a17] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{uploadingDoc ? 'Uploading...' : 'Upload PDF / Image Certificate'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleDocUpload}
                    className="sr-only"
                  />
                </label>
                {profile?.authorisationDocUrls.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-emerald-900/60 text-xs font-mono inline-flex items-center gap-1.5 text-[#b04a17]"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Doc #{idx + 1}</span>
                  </a>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="btn-3d-copper min-h-[48px] px-6 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-sm"
            >
              {t('recycler.saveProfile')}
            </button>
          </form>
        )}

        {/* RATE CARD TAB */}
        {tab === 'rates' && (
          <form
            onSubmit={handleSaveRates}
            className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold">Buying Rate Card (₹ / kg)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enable only categories you actively buy. Changes never alter existing booked rate snapshots.
              </p>
            </div>
            <div className="space-y-3">
              {categories.map((cat) => {
                const draft = rateDrafts[cat.id] || { price: cat.referenceRatePerKg || 50, active: false };
                return (
                  <div
                    key={cat.id}
                    className="card-3d-hover rounded-xl border border-slate-200 dark:border-emerald-950/60 p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) =>
                          setRateDrafts((prev) => ({
                            ...prev,
                            [cat.id]: { ...draft, active: e.target.checked },
                          }))
                        }
                        className="w-4 h-4 accent-[#b04a17]"
                      />
                      <div>
                        <div className="font-semibold text-sm">{cat.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          Admin Ref: {formatINR(cat.referenceRatePerKg || 0)}/kg
                        </div>
                      </div>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">₹</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.price}
                        onChange={(e) =>
                          setRateDrafts((prev) => ({
                            ...prev,
                            [cat.id]: { ...draft, price: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-28 min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm tabular-nums"
                      />
                      <span className="text-xs text-slate-500">/ kg</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="submit"
              className="btn-3d-copper min-h-[48px] px-6 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-sm"
            >
              {t('recycler.saveRates')}
            </button>
          </form>
        )}

        {/* REQUESTS TAB (Incoming REQUESTED Bookings) */}
        {tab === 'requests' && (
          <StageTransition className="space-y-4">
            <h2 className="text-xl font-bold">Incoming Booking Requests</h2>
            {requestedBookings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-sm text-slate-500">
                No pending booking requests right now.
              </div>
            ) : (
              requestedBookings.map((b) => (
                <TiltCard3D
                  key={b.id}
                  maxTiltDeg={3}
                  interactiveSafe
                  className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-mono text-xs text-slate-500">
                        {b.id} · {b.mode} · {b.collectorArea}
                      </div>
                      <h3 className="text-lg font-bold">
                        {b.collectorName} ({formatKg(b.lot?.totalKg || 0)})
                      </h3>
                      <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Slot: {formatDateTimeIN(b.slotStart)} · Expires {formatDateTimeIN(b.expiresAt)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={b.status} />
                      <div className="font-mono font-bold text-xl text-[#b04a17] mt-1 tabular-nums">
                        Est. Net {formatINR(Math.max(0, b.estimatedTotal - b.transportCost))}
                      </div>
                    </div>
                  </div>

                  {b.lot && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {b.lot.items.map((it) => (
                        <div
                          key={it.categoryId}
                          className="rounded-lg bg-slate-50 dark:bg-[#0d1512] px-3 py-2 text-xs flex justify-between"
                        >
                          <span>{it.categoryName}</span>
                          <span className="font-mono font-semibold">
                            {formatKg(it.declaredKg)} @ {formatINR(b.rateSnapshot[it.categoryId]?.pricePerKg || 0)}/kg
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-slate-500">
                    Collector phone number stays hidden until you accept the booking.
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busyBookingId === b.id}
                      onClick={() => handleRespondBooking(b.id, 'ACCEPTED')}
                      className="btn-3d-emerald min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept Booking</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyBookingId === b.id}
                      onClick={() => handleRespondBooking(b.id, 'DECLINED')}
                      className="min-h-[44px] px-5 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-sm font-semibold inline-flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Decline</span>
                    </button>
                  </div>
                </TiltCard3D>
              ))
            )}
          </StageTransition>
        )}

        {/* PICKUPS & HANDOVER TAB */}
        {tab === 'pickups' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Active Pickups & Weigh-In Handover</h2>
            {activePickupBookings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-sm text-slate-500">
                No active pickups right now. Accept an incoming request to start handover.
              </div>
            ) : (
              activePickupBookings.map((b) => {
                const weights = weighedDrafts[b.id] || {};
                const liveGross = (b.lot?.items || []).reduce((sum, it) => {
                  const kg = Number(weights[it.categoryId] ?? it.declaredKg);
                  const rate = b.rateSnapshot[it.categoryId]?.pricePerKg || 0;
                  return sum + Math.round(kg * rate);
                }, 0);
                const liveNet = Math.max(0, liveGross - b.transportCost);
                const gps = handoverGps[b.id];

                return (
                  <TiltCard3D
                    key={b.id}
                    maxTiltDeg={2.5}
                    interactiveSafe
                    className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-mono text-xs text-slate-500">
                          {b.id} · {b.mode} · Slot {formatDateTimeIN(b.slotStart)}
                        </div>
                        <h3 className="text-lg font-bold">{b.collectorName}</h3>
                        <div className="text-xs text-slate-600 dark:text-slate-300">{b.collectorArea}</div>
                        {b.collectorPhone && (
                          <a
                            href={`tel:${b.collectorPhone}`}
                            className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-[#b04a17] underline pt-1"
                          >
                            <Phone className="w-4 h-4" />
                            <span>{b.collectorPhone}</span>
                          </a>
                        )}
                      </div>
                      <StatusBadge status={b.status} />
                    </div>

                    {/* Weigh-In Form when ACCEPTED & not yet submitted */}
                    {b.status === 'ACCEPTED' && !b.handover?.recyclerConfirmedAt && b.lot && (
                      <div className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-slate-50/70 dark:bg-[#0d1512] p-4 space-y-4">
                        <div className="font-bold text-sm">Enter Scale Weigh-In & Collector Handover Code</div>

                        <div className="space-y-2.5">
                          {b.lot.items.map((it) => {
                            const rate = b.rateSnapshot[it.categoryId]?.pricePerKg || 0;
                            const kgVal = weights[it.categoryId] ?? it.declaredKg;
                            return (
                              <div
                                key={it.categoryId}
                                className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#15201b] rounded-xl border border-slate-200 dark:border-emerald-950/60 p-3"
                              >
                                <div>
                                  <div className="font-semibold text-sm">{it.categoryName}</div>
                                  <div className="text-xs font-mono text-slate-500">
                                    Declared: {formatKg(it.declaredKg)} · Locked rate: {formatINR(rate)}/kg
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-slate-500" htmlFor={`w-${b.id}-${it.categoryId}`}>
                                    Weighed kg:
                                  </label>
                                  <input
                                    id={`w-${b.id}-${it.categoryId}`}
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={kgVal}
                                    onChange={(e) =>
                                      setWeighedDrafts((prev) => ({
                                        ...prev,
                                        [b.id]: {
                                          ...(prev[b.id] || {}),
                                          [it.categoryId]: Math.max(0, Number(e.target.value) || 0),
                                        },
                                      }))
                                    }
                                    className="w-24 min-h-[40px] px-2.5 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm tabular-nums"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor={`code-${b.id}`}
                              className="block text-xs font-semibold mb-1"
                            >
                              Collector&apos;s 4-Digit Handover Code
                            </label>
                            <input
                              id={`code-${b.id}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="e.g. 4821"
                              value={handoverCodes[b.id] || ''}
                              onChange={(e) =>
                                setHandoverCodes((prev) => ({ ...prev, [b.id]: e.target.value }))
                              }
                              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] font-mono text-lg tracking-[0.25em]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-xs font-semibold">Handover Proof & GPS</div>
                            <div className="flex flex-wrap gap-2">
                              <label className="min-h-[44px] px-3.5 rounded-xl border border-dashed border-[#b04a17] text-[#b04a17] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                                <Camera className="w-4 h-4" />
                                <span>{handoverPhotos[b.id] ? 'Photo Attached ✓' : 'Add Scale Photo'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => handleHandoverPhotoUpload(b.id, e)}
                                  className="sr-only"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleCaptureHandoverGps(b)}
                                className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <Navigation className="w-3.5 h-3.5 text-[#b04a17]" />
                                <span>{gps ? `GPS ±${gps.accuracyM}m ✓` : 'Capture GPS'}</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-emerald-950/60">
                          <div className="text-sm font-mono tabular-nums">
                            Calculated Net Payable:{' '}
                            <strong className="text-lg text-[#b04a17]">{formatINR(liveNet)}</strong>
                            {b.transportCost > 0 && (
                              <span className="text-xs text-slate-500"> (after -{formatINR(b.transportCost)} transport)</span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={busyBookingId === b.id}
                            onClick={() => handleSubmitHandover(b)}
                            className="btn-3d-copper min-h-[44px] px-5 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white text-sm font-semibold"
                          >
                            {busyBookingId === b.id ? 'Submitting...' : 'Submit Weigh-In'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Waiting for collector confirmation */}
                    {b.status === 'ACCEPTED' && b.handover?.recyclerConfirmedAt && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-950 dark:text-amber-200">
                        Weigh-in submitted (Net {formatINR(b.handover.netAmount)}). Waiting for collector to tap Confirm on their phone to issue the signed weighbridge receipt.
                      </div>
                    )}

                    {/* Receipt issued */}
                    {b.receipt && (
                      <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300">
                            Receipt {b.receipt.id} · Net {formatINR(b.receipt.payload.netAmount)}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {formatKg(b.receipt.payload.totalWeighedKg)} weighed · Signed HMAC-SHA256
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {onOpenReceipt && (
                            <button
                              type="button"
                              onClick={() => onOpenReceipt(b.receipt!.id)}
                              className="min-h-[40px] px-3 rounded-lg bg-[#b04a17] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>View QR Receipt</span>
                            </button>
                          )}
                          <a
                            href={b.receipt.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Payment Settlement Card when HANDED_OVER */}
                    {b.status === 'HANDED_OVER' && b.handover && (
                      <div className="rounded-xl border-2 border-[#b04a17]/60 bg-[#b04a17]/5 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-sm">{t('recycler.paymentTitle')}</div>
                          <div className="font-mono font-bold text-lg text-[#b04a17] tabular-nums">
                            {formatINR(b.handover.netAmount)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(['UPI', 'CASH'] as PaymentMethod[]).map((m) => {
                            const selectedMethod =
                              paymentMethodDrafts[b.id] || (b.collectorUpiId ? 'UPI' : 'CASH');
                            const active = selectedMethod === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() =>
                                  setPaymentMethodDrafts((prev) => ({ ...prev, [b.id]: m }))
                                }
                                className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                                  active
                                    ? 'border-[#b04a17] bg-[#b04a17] text-white'
                                    : 'border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]'
                                }`}
                              >
                                {m === 'UPI' ? (
                                  <Smartphone className="w-4 h-4" />
                                ) : (
                                  <Banknote className="w-4 h-4" />
                                )}
                                <span>{m === 'UPI' ? 'UPI Transfer (Record-Only)' : 'Cash at Handover'}</span>
                              </button>
                            );
                          })}
                        </div>

                        {(paymentMethodDrafts[b.id] || (b.collectorUpiId ? 'UPI' : 'CASH')) === 'UPI' && (
                          <div className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] p-3.5 space-y-3">
                            {upiQrMap[b.id] ? (
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <img
                                  src={upiQrMap[b.id].qrDataUrl}
                                  alt="Collector UPI QR"
                                  className="w-28 h-28 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                                />
                                <div className="space-y-1.5 text-xs">
                                  <div className="font-mono font-bold">
                                    Collector UPI: {upiQrMap[b.id].upiId}
                                  </div>
                                  <p className="text-slate-500">
                                    Pay via any UPI app, then enter the 12-digit UTR / reference below.
                                  </p>
                                  <a
                                    href={upiQrMap[b.id].upiDeepLink}
                                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[#b04a17] text-[#b04a17] font-semibold"
                                  >
                                    <Smartphone className="w-3.5 h-3.5" />
                                    <span>Open UPI App ({formatINR(upiQrMap[b.id].amount)})</span>
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">
                                {b.collectorUpiId
                                  ? `Collector UPI ID: ${b.collectorUpiId}`
                                  : 'Collector has not added a UPI ID yet—you may pay by Cash or enter a manual UPI/bank ref.'}
                              </div>
                            )}

                            <div>
                              <label
                                htmlFor={`utr-${b.id}`}
                                className="block text-xs font-semibold mb-1"
                              >
                                UPI UTR / Transaction Reference Number
                              </label>
                              <input
                                id={`utr-${b.id}`}
                                type="text"
                                placeholder="e.g. 431298765432"
                                value={upiRefDrafts[b.id] || ''}
                                onChange={(e) =>
                                  setUpiRefDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))
                                }
                                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] font-mono text-sm"
                              />
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={busyBookingId === b.id}
                          onClick={() => handleMarkPayment(b)}
                          className="btn-3d-emerald min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{busyBookingId === b.id ? 'Saving...' : t('recycler.markPaidBtn')}</span>
                        </button>
                      </div>
                    )}

                    {/* PAID — Waiting for collector confirmation */}
                    {b.status === 'PAID' && b.payment && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-950 dark:text-amber-200 space-y-1">
                        <div className="font-bold">
                          Payment Marked Sent ({b.payment.method} · {formatINR(b.payment.amount)})
                        </div>
                        {b.payment.upiRef && <div className="font-mono">UTR Ref: {b.payment.upiRef}</div>}
                        <div>Waiting for collector to confirm receipt on their phone to finalize ledger.</div>
                      </div>
                    )}

                    {/* DISPUTED */}
                    {b.status === 'DISPUTED' && (
                      <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-red-900 dark:text-red-200 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Dispute Open ({b.dispute?.status || 'OPEN'})</span>
                        </div>
                        <div>{b.dispute?.reason || 'Under review by platform admin.'}</div>
                      </div>
                    )}
                  </TiltCard3D>
                );
              })
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Purchase & Booking History</h2>
              <a
                href="/api/recycler/history/csv"
                download="recycler-purchases.csv"
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] text-xs font-semibold inline-flex items-center gap-2 hover:border-[#b04a17]"
              >
                <Download className="w-4 h-4 text-[#b04a17]" />
                <span>{t('recycler.exportPurchasesCsv')}</span>
              </a>
            </div>
            {completedBookings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-sm text-slate-500">
                No completed or closed bookings yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-emerald-950/60 text-slate-500">
                      <th className="p-3.5">Booking</th>
                      <th className="p-3.5">Collector</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Net ₹</th>
                      <th className="p-3.5">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedBookings.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 dark:border-emerald-950/40">
                        <td className="p-3.5 font-mono">{b.id}</td>
                        <td className="p-3.5">{b.collectorName}</td>
                        <td className="p-3.5">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">
                          {formatINR(b.handover?.netAmount ?? Math.max(0, b.estimatedTotal - b.transportCost))}
                        </td>
                        <td className="p-3.5 font-mono">
                          {b.receipt ? (
                            <a
                              href={b.receipt.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#b04a17] underline"
                            >
                              {b.receipt.id}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};
