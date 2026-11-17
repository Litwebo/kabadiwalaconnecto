import {
  AlertTriangle,
  Banknote,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Home,
  IndianRupee,
  Leaf,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Package,
  Phone,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { compressImageForUpload } from '../lib/imageCompress.ts';
import { EPR_DISCLAIMER, formatDateTimeIN, formatINR, formatKg } from '../shared/format.ts';
import type {
  BookingDTO,
  BookingMode,
  LedgerEntryDTO,
  LotDTO,
  LotEstimateDTO,
  MatchCandidateDTO,
} from '../shared/types.ts';
import { AppShell, type NavTab } from './AppShell.tsx';
import { LeafletMapPicker, MANGALURU_AREAS } from './LeafletMapPicker.tsx';
import { AnimatedNumber, StageTransition, StampBadge3D, TiltCard3D } from './MotionPrimitives.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface CollectorWorkspaceProps {
  onOpenReceipt: (receiptId: string) => void;
}

type MatchSort = 'net_price' | 'nearest' | 'earliest';

export const CollectorWorkspace: React.FC<CollectorWorkspaceProps> = ({ onOpenReceipt }) => {
  const { user, categories, language, refreshUser, refreshNotifications, logout, t } = useApp();
  const [tab, setTab] = useState<'home' | 'sell' | 'lots' | 'ledger' | 'profile'>('home');
  const [lots, setLots] = useState<LotDTO[]>([]);
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryDTO[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Lot Wizard State (Steps 1–4)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('kc_draft_items');
      return saved ? JSON.parse(saved) : { cat_copper: 10 };
    } catch {
      return { cat_copper: 10 };
    }
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoStats, setPhotoStats] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [lat, setLat] = useState<number>(user?.lat ?? 12.8732);
  const [lng, setLng] = useState<number>(user?.lng ?? 74.8554);
  const [areaLabel, setAreaLabel] = useState<string>(user?.areaLabel ?? 'Kankanady, Mangaluru');
  const [notes, setNotes] = useState<string>('');
  const [estimate, setEstimate] = useState<LotEstimateDTO | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<string | null>(null);

  // Step 3 & 4: Matching & Booking State
  const [matchLot, setMatchLot] = useState<LotDTO | null>(null);
  const [matchSort, setMatchSort] = useState<MatchSort>('net_price');
  const [matchView, setMatchView] = useState<'list' | 'map'>('list');
  const [eligibleMatches, setEligibleMatches] = useState<MatchCandidateDTO[]>([]);
  const [partialMatches, setPartialMatches] = useState<MatchCandidateDTO[]>([]);
  const [costPerKm, setCostPerKm] = useState<number>(7);
  const [showPartial, setShowPartial] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidateDTO | null>(null);
  const [bookingMode, setBookingMode] = useState<BookingMode>('PICKUP');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);

  // Booking / Handover interaction state
  const [bookingActionBusy, setBookingActionBusy] = useState<string | null>(null);
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [disputeReasonMap, setDisputeReasonMap] = useState<Record<string, string>>({});
  const [openDisputeFor, setOpenDisputeFor] = useState<string | null>(null);

  // Profile state
  const [profName, setProfName] = useState(user?.name || '');
  const [profArea, setProfArea] = useState(user?.areaLabel || '');
  const [profUpi, setProfUpi] = useState(user?.upiId || '');
  const [profSaved, setProfSaved] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    localStorage.setItem('kc_draft_items', JSON.stringify(selectedItems));
  }, [selectedItems]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [lotsRes, bookingsRes, ledgerRes] = await Promise.all([
        apiFetch<{ lots: LotDTO[] }>('/api/lots'),
        apiFetch<{ bookings: BookingDTO[] }>('/api/bookings'),
        apiFetch<{ entries: LedgerEntryDTO[] }>('/api/ledger'),
      ]);
      setLots(lotsRes.lots);
      setBookings(bookingsRes.bookings);
      setLedger(ledgerRes.entries);
    } catch {
      // handled cleanly in UI
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: NavTab[] = [
    { id: 'home', label: t('nav.home'), icon: <Home className="w-5 h-5" /> },
    { id: 'sell', label: t('nav.sell'), icon: <Plus className="w-5 h-5" /> },
    { id: 'lots', label: t('nav.lots'), icon: <Package className="w-5 h-5" /> },
    { id: 'ledger', label: t('nav.ledger'), icon: <IndianRupee className="w-5 h-5" /> },
    { id: 'profile', label: t('nav.profile'), icon: <User className="w-5 h-5" /> },
  ];

  const activeItemsArray = useMemo(
    () =>
      Object.entries(selectedItems)
        .filter(([, kg]) => Number(kg) > 0)
        .map(([categoryId, declaredKg]) => ({ categoryId, declaredKg: Number(declaredKg) })),
    [selectedItems]
  );

  const hasSelectedHazardous = useMemo(() => {
    return activeItemsArray.some((it) => categories.find((c) => c.id === it.categoryId)?.hazardous);
  }, [activeItemsArray, categories]);

  const activeBookings = useMemo(
    () => bookings.filter((b) => !['DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'].includes(b.status)),
    [bookings]
  );

  const handleToggleCategory = (catId: string) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[catId] !== undefined) {
        delete next[catId];
      } else {
        next[catId] = 5;
      }
      return next;
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoUrls.length >= 4) {
      setWizardError('Maximum 4 photos allowed per lot.');
      return;
    }
    setWizardError(null);
    setUploadingPhoto(true);
    try {
      const compressed = await compressImageForUpload(file, 1280, 0.8);
      setPhotoStats(
        `Compressed ${compressed.originalKb} KB → ${compressed.compressedKb} KB (EXIF stripped)`
      );
      const formData = new FormData();
      formData.append('file', compressed.blob, 'lot-photo.jpg');
      const stored = await apiFetch<{ publicUrl: string }>('/api/uploads/public', {
        method: 'POST',
        body: formData,
      });
      setPhotoUrls((prev) => [...prev, stored.publicUrl]);
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleAiIdentify = async () => {
    if (photoUrls.length === 0) {
      setWizardError('Add at least 1 photo first to use AI material detection.');
      return;
    }
    setAiBusy(true);
    setWizardError(null);
    setAiSuggestion(null);
    try {
      const imgUrl = photoUrls[photoUrls.length - 1];
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read photo'));
        reader.readAsDataURL(blob);
      });
      const res = await apiFetch<{
        suggestion: {
          suggestedCategoryId: string;
          suggestedCategoryName: string;
          estimatedWeightKg: number;
          confidenceNote: string;
          hazardAlert: string | null;
        };
      }>('/api/ai/identify-scrap', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
      });

      const s = res.suggestion;
      setSelectedItems((prev) => ({
        ...prev,
        [s.suggestedCategoryId]: s.estimatedWeightKg,
      }));
      setAiSuggestion(
        `AI suggested ${s.suggestedCategoryName} (~${s.estimatedWeightKg} kg): ${s.confidenceNote}${
          s.hazardAlert ? ` ⚠️ ${s.hazardAlert}` : ''
        }`
      );
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'AI identification unavailable.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleDetectGps = () => {
    setWizardError(null);
    if (!navigator.geolocation) {
      setWizardError('Browser GPS unavailable. Tap the map or select a Mangaluru area.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Math.round(pos.coords.latitude * 100000) / 100000);
        setLng(Math.round(pos.coords.longitude * 100000) / 100000);
        setAreaLabel(`GPS Pin (±${Math.round(pos.coords.accuracy)}m)`);
      },
      () => {
        setWizardError('Location permission denied. Tap the map or choose an area below.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const saveDraftOrList = async (publish: boolean) => {
    if (activeItemsArray.length === 0) {
      setWizardError('Select at least 1 material category and enter kg > 0.');
      return null;
    }
    setWizardError(null);
    setWizardBusy(true);
    try {
      let saved: LotDTO;
      if (editingLotId) {
        const res = await apiFetch<{ lot: LotDTO }>(`/api/lots/${editingLotId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            lat,
            lng,
            areaLabel,
            notes,
            items: activeItemsArray,
            photoUrls,
            status: publish ? 'LISTED' : 'DRAFT',
          }),
        });
        saved = res.lot;
      } else {
        const res = await apiFetch<{ lot: LotDTO }>('/api/lots', {
          method: 'POST',
          body: JSON.stringify({
            lat,
            lng,
            areaLabel,
            notes,
            items: activeItemsArray,
            photoUrls,
            publish,
          }),
        });
        saved = res.lot;
        setEditingLotId(saved.id);
      }
      await loadData();
      return saved;
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Failed to save lot.');
      return null;
    } finally {
      setWizardBusy(false);
    }
  };

  const loadMatchesForLot = useCallback(async (lotId: string, sort: MatchSort) => {
    setWizardBusy(true);
    setWizardError(null);
    try {
      const res = await apiFetch<{
        lot: LotDTO;
        eligible: MatchCandidateDTO[];
        partial: MatchCandidateDTO[];
        costPerKm: number;
      }>(`/api/lots/${lotId}/matches?sort=${sort}`);
      setMatchLot(res.lot);
      setEligibleMatches(res.eligible);
      setPartialMatches(res.partial);
      setCostPerKm(res.costPerKm);
      setWizardStep(3);
      setTab('sell');
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Unable to fetch nearby recyclers.');
    } finally {
      setWizardBusy(false);
    }
  }, []);

  const handleCheckEstimate = async () => {
    if (activeItemsArray.length === 0) {
      setWizardError('Select at least 1 category with kg > 0 first.');
      return;
    }
    setWizardBusy(true);
    setWizardError(null);
    try {
      const saved = await saveDraftOrList(false);
      if (!saved) return;
      const res = await apiFetch<{ estimate: LotEstimateDTO }>(`/api/lots/${saved.id}/estimate`, {
        method: 'POST',
      });
      setEstimate(res.estimate);
      setWizardStep(2);
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Failed to calculate estimate.');
    } finally {
      setWizardBusy(false);
    }
  };

  const handlePublishAndFindRecyclers = async () => {
    const saved = await saveDraftOrList(true);
    if (saved) {
      setWizardSuccess(`Lot ${saved.id} is now LISTED.`);
      await loadMatchesForLot(saved.id, matchSort);
    }
  };

  const handleSelectCandidateForBooking = (cand: MatchCandidateDTO) => {
    setSelectedCandidate(cand);
    setBookingMode(cand.effectiveMode);
    setSelectedSlotIdx(0);
    setWizardError(null);
    setWizardStep(4);
  };

  const step4TransportCost = useMemo(() => {
    if (!selectedCandidate) return 0;
    if (bookingMode === 'PICKUP') return 0;
    return Math.round(selectedCandidate.distanceKm * 2 * costPerKm);
  }, [selectedCandidate, bookingMode, costPerKm]);

  const step4NetAmount = useMemo(() => {
    if (!selectedCandidate) return 0;
    return Math.max(0, selectedCandidate.offerTotal - step4TransportCost);
  }, [selectedCandidate, step4TransportCost]);

  const handleCreateBooking = async () => {
    if (!matchLot || !selectedCandidate) return;
    const slot = selectedCandidate.nextSlots[selectedSlotIdx] || selectedCandidate.nextSlots[0];
    if (!slot) {
      setWizardError('Select an available time slot.');
      return;
    }
    setWizardBusy(true);
    setWizardError(null);
    try {
      const res = await apiFetch<{ booking: BookingDTO }>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          lotId: matchLot.id,
          recyclerProfileId: selectedCandidate.recyclerId,
          mode: bookingMode,
          slotStart: slot.start,
          slotEnd: slot.end,
        }),
      });
      await Promise.all([loadData(), refreshNotifications()]);
      setBookingFeedback(
        `Booking request ${res.booking.id} sent to ${selectedCandidate.businessName}! They have 12 hours to accept.`
      );
      setTab('lots');
      setWizardStep(1);
      setEditingLotId(null);
      setSelectedCandidate(null);
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Booking failed.');
    } finally {
      setWizardBusy(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setBookingActionBusy(bookingId);
    setBookingError(null);
    setBookingFeedback(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
      await loadData();
      setBookingFeedback(`Booking ${bookingId} cancelled. Lot is listed again.`);
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Could not cancel booking.');
    } finally {
      setBookingActionBusy(null);
    }
  };

  const handleConfirmHandover = async (bookingId: string, action: 'CONFIRM' | 'DISPUTE') => {
    setBookingActionBusy(bookingId);
    setBookingError(null);
    setBookingFeedback(null);
    try {
      const res = await apiFetch<{ booking: BookingDTO }>(`/api/bookings/${bookingId}/handover/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: action === 'DISPUTE' ? disputeReasonMap[bookingId] || '' : undefined,
        }),
      });
      await Promise.all([loadData(), refreshNotifications()]);
      if (action === 'CONFIRM' && res.booking.receipt) {
        setBookingFeedback(
          `Handover confirmed! Receipt ${res.booking.receipt.id} issued with HMAC-SHA256 signature.`
        );
      } else {
        setBookingFeedback('Dispute opened and flagged for platform admin review.');
        setOpenDisputeFor(null);
      }
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Handover action failed.');
    } finally {
      setBookingActionBusy(null);
    }
  };

  const handleConfirmPayment = async (
    bookingId: string,
    action: 'RECEIVED' | 'NOT_RECEIVED'
  ) => {
    setBookingActionBusy(bookingId);
    setBookingError(null);
    setBookingFeedback(null);
    try {
      await apiFetch<{ booking: BookingDTO }>(`/api/bookings/${bookingId}/payment/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: action === 'NOT_RECEIVED' ? disputeReasonMap[bookingId] || '' : undefined,
        }),
      });
      await Promise.all([loadData(), refreshNotifications()]);
      if (action === 'RECEIVED') {
        setBookingFeedback(
          `Payment confirmed for ${bookingId}! Transaction completed and added to your ledger.`
        );
      } else {
        setBookingFeedback(
          `Payment dispute opened for ${bookingId}. Platform admin has been notified.`
        );
        setOpenDisputeFor(null);
      }
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : 'Payment confirmation failed.');
    } finally {
      setBookingActionBusy(null);
    }
  };

  const handleEditDraft = (lot: LotDTO) => {
    setEditingLotId(lot.id);
    const map: Record<string, number> = {};
    for (const it of lot.items) map[it.categoryId] = it.declaredKg;
    setSelectedItems(map);
    setPhotoUrls(lot.photos.map((p) => p.url));
    setLat(lot.lat);
    setLng(lot.lng);
    setAreaLabel(lot.areaLabel);
    setNotes(lot.notes || '');
    setWizardStep(1);
    setWizardSuccess(null);
    setWizardError(null);
    setTab('sell');
  };

  const startNewLot = () => {
    setEditingLotId(null);
    setSelectedItems({});
    setPhotoUrls([]);
    setPhotoStats(null);
    setAiSuggestion(null);
    setEstimate(null);
    setMatchLot(null);
    setSelectedCandidate(null);
    setNotes('');
    setWizardStep(1);
    setWizardError(null);
    setWizardSuccess(null);
    setTab('sell');
  };

  const totals = useMemo(() => {
    const net = ledger.reduce((s, e) => s + e.netAmount, 0);
    const kg = ledger.reduce((s, e) => s + e.kg, 0);
    const co2 = ledger.reduce((s, e) => s + e.co2SavedKg, 0);
    const avgPerKg = kg > 0 ? Math.round((net / kg) * 100) / 100 : 0;
    return { net, kg, co2, avgPerKg };
  }, [ledger]);

  const monthlyLedgerSeries = useMemo(() => {
    const byMonth = new Map<string, { month: string; label: string; netAmount: number; kg: number }>();
    for (const entry of ledger) {
      const ym = entry.date.slice(0, 7);
      const d = new Date(entry.date);
      const label = Number.isNaN(d.getTime())
        ? ym
        : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      const prev = byMonth.get(ym) || { month: ym, label, netAmount: 0, kg: 0 };
      prev.netAmount += entry.netAmount;
      prev.kg = Math.round((prev.kg + entry.kg) * 100) / 100;
      byMonth.set(ym, prev);
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [ledger]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfSaved(null);
    await apiFetch('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ name: profName, areaLabel: profArea, upiId: profUpi || null }),
    });
    await refreshUser();
    setProfSaved('Profile updated.');
  };

  const handleDeleteAccount = async () => {
    await apiFetch('/api/me', { method: 'DELETE' });
    await logout();
  };

  const renderBookingCard = (b: BookingDTO) => {
    const handoverPendingConfirm = b.status === 'ACCEPTED' && Boolean(b.handover?.recyclerConfirmedAt);
    return (
      <TiltCard3D
        key={b.id}
        maxTiltDeg={2.5}
        interactiveSafe
        className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 sm:p-5 space-y-4 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-mono text-xs text-slate-500">
              {b.id} · Lot {b.lotId}
            </div>
            <div className="font-bold text-base">{b.recyclerBusinessName || 'Authorised Recycler'}</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {b.mode} · Slot: {formatDateTimeIN(b.slotStart)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={b.status} />
            <div className="font-mono text-sm font-bold text-[#b04a17] tabular-nums">
              Est. Net {formatINR(Math.max(0, b.estimatedTotal - b.transportCost))}
            </div>
          </div>
        </div>

        {/* REQUESTED: Expiry + Cancel + Phone Hidden */}
        {b.status === 'REQUESTED' && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                Waiting for recycler acceptance (expires {formatDateTimeIN(b.expiresAt)}). Phone number unlocks on acceptance.
              </span>
            </div>
            <button
              type="button"
              disabled={bookingActionBusy === b.id}
              onClick={() => handleCancelBooking(b.id)}
              className="min-h-[40px] px-3.5 rounded-lg border border-red-300 text-red-700 dark:text-red-300 text-xs font-semibold"
            >
              Cancel Request
            </button>
          </div>
        )}

        {/* ACCEPTED: Reveal Phone + Show 4-Digit Handover Code + Handover Review */}
        {b.status === 'ACCEPTED' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card-3d-hover rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 space-y-1 shadow-sm">
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  4-Digit Handover Code
                </div>
                <div className="font-mono font-bold text-3xl tracking-[0.25em] text-[#b04a17]">
                  {b.handoverCode || '----'}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Share this code with the recycler only when weighing starts.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-emerald-900/60 p-3.5 space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  Recycler Contact (Unlocked)
                </div>
                {b.recyclerPhone && (
                  <a
                    href={`tel:${b.recyclerPhone}`}
                    className="inline-flex items-center gap-2 font-mono font-bold text-sm text-[#b04a17] underline"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{b.recyclerPhone}</span>
                  </a>
                )}
                <div className="text-xs text-slate-600 dark:text-slate-300">{b.recyclerAddress}</div>
              </div>
            </div>

            {handoverPendingConfirm && b.handover && (
              <div className="rounded-xl border-2 border-[#b04a17] bg-[#b04a17]/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-sm text-[#b04a17]">
                    Weigh-In Submitted by Recycler — Please Verify & Confirm
                  </div>
                  <div className="font-mono font-bold text-lg text-[#b04a17] tabular-nums">
                    Net Payable: {formatINR(b.handover.netAmount)}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-emerald-950/60 text-slate-500">
                        <th className="py-1.5">Material</th>
                        <th className="py-1.5 text-right">Decl.</th>
                        <th className="py-1.5 text-right">Weighed</th>
                        <th className="py-1.5 text-right">Rate</th>
                        <th className="py-1.5 text-right">Line ₹</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.handover.weighedItems.map((wi) => (
                        <tr key={wi.categoryId} className="border-b border-slate-100 dark:border-emerald-950/40">
                          <td className="py-1.5 font-medium">{wi.categoryName}</td>
                          <td className="py-1.5 text-right font-mono">{formatKg(wi.declaredKg)}</td>
                          <td className="py-1.5 text-right font-mono font-bold">{formatKg(wi.weighedKg)}</td>
                          <td className="py-1.5 text-right font-mono">{formatINR(wi.ratePerKg)}</td>
                          <td className="py-1.5 text-right font-mono font-bold">{formatINR(wi.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span>Gross: {formatINR(b.handover.grossAmount)}</span>
                  <span>Transport: - {formatINR(b.handover.transportCost)}</span>
                  <span>
                    GPS: {b.handover.lat.toFixed(4)}, {b.handover.lng.toFixed(4)} (±{Math.round(b.handover.accuracyM)}m)
                  </span>
                </div>

                {b.handover.photoUrl && (
                  <img
                    src={b.handover.photoUrl}
                    alt="Handover scale proof"
                    className="h-24 w-36 object-cover rounded-lg border border-slate-200"
                  />
                )}

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={bookingActionBusy === b.id}
                    onClick={() => handleConfirmHandover(b.id, 'CONFIRM')}
                    className="btn-3d-emerald min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Handover & Issue Receipt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenDisputeFor(openDisputeFor === b.id ? null : b.id)}
                    className="min-h-[44px] px-4 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-sm font-semibold"
                  >
                    Dispute Weight
                  </button>
                </div>

                {openDisputeFor === b.id && (
                  <div className="pt-2 space-y-2">
                    <input
                      type="text"
                      value={disputeReasonMap[b.id] || ''}
                      onChange={(e) =>
                        setDisputeReasonMap((prev) => ({ ...prev, [b.id]: e.target.value }))
                      }
                      placeholder="Explain weight or rate discrepancy..."
                      className="w-full min-h-[44px] px-3 rounded-xl border border-red-300 bg-white dark:bg-[#0d1512] text-sm"
                    />
                    <button
                      type="button"
                      disabled={bookingActionBusy === b.id}
                      onClick={() => handleConfirmHandover(b.id, 'DISPUTE')}
                      className="min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold"
                    >
                      Submit Weight Dispute
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* HANDED_OVER / RECEIPT ISSUED */}
        {b.receipt && (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300">
                Verified Receipt {b.receipt.id} · Net {formatINR(b.receipt.payload.netAmount)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {formatKg(b.receipt.payload.totalWeighedKg)} weighed · Signed HMAC-SHA256
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenReceipt(b.receipt!.id)}
                className="min-h-[40px] px-3 rounded-lg bg-[#b04a17] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Verify QR Receipt</span>
              </button>
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

        {/* HANDED_OVER — waiting for recycler to mark payment */}
        {b.status === 'HANDED_OVER' && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-200">
            Handover receipt issued. Waiting for recycler to send payment (Cash or UPI) and mark it paid.
          </div>
        )}

        {/* PAID — Collector dual-sided payment confirmation */}
        {b.status === 'PAID' && b.payment && (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 shrink-0" />
                <span>{t('collector.paymentConfirmTitle')}</span>
              </div>
              <div className="font-mono font-bold text-lg text-[#b04a17] tabular-nums">
                {formatINR(b.payment.amount)}
              </div>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 font-mono">
              Method: {b.payment.method}
              {b.payment.upiRef ? ` · UTR Ref: ${b.payment.upiRef}` : ''}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={bookingActionBusy === b.id}
                onClick={() => handleConfirmPayment(b.id, 'RECEIVED')}
                className="btn-3d-emerald min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('collector.paymentReceivedBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenDisputeFor(openDisputeFor === b.id ? null : b.id)}
                className="min-h-[44px] px-4 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-sm font-semibold"
              >
                {t('collector.paymentNotReceivedBtn')}
              </button>
            </div>
            {openDisputeFor === b.id && (
              <div className="pt-2 space-y-2">
                <input
                  type="text"
                  value={disputeReasonMap[b.id] || ''}
                  onChange={(e) =>
                    setDisputeReasonMap((prev) => ({ ...prev, [b.id]: e.target.value }))
                  }
                  placeholder="Describe why payment was not received (e.g. UPI failed / cash short)..."
                  className="w-full min-h-[44px] px-3 rounded-xl border border-red-300 bg-white dark:bg-[#0d1512] text-sm"
                />
                <button
                  type="button"
                  disabled={bookingActionBusy === b.id}
                  onClick={() => handleConfirmPayment(b.id, 'NOT_RECEIVED')}
                  className="min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold"
                >
                  Submit Payment Dispute
                </button>
              </div>
            )}
          </div>
        )}

        {/* DISPUTED */}
        {b.status === 'DISPUTED' && (
          <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-red-900 dark:text-red-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Dispute Open ({b.dispute?.status || 'OPEN'})</span>
            </div>
            <div>{b.dispute?.reason || 'Flagged for platform admin review.'}</div>
          </div>
        )}
      </TiltCard3D>
    );
  };

  return (
    <AppShell tabs={tabs} activeTab={tab} onSelectTab={(id) => setTab(id as typeof tab)}>
      {tab === 'home' && (
        <StageTransition className="space-y-6">
          {/* Primary Collector Action Card */}
          <TiltCard3D
            maxTiltDeg={3}
            className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-start gap-3.5">
              <StampBadge3D icon={<Package className="w-5 h-5" />} tone="copper" className="hidden sm:inline-flex mt-0.5" />
              <div>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Welcome back, {user?.name}
                </p>
                <h1 className="text-xl sm:text-2xl font-bold mt-1">Ready to sell today&apos;s e-waste?</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Compare net payouts from verified Mangaluru recyclers and get weighbridge receipts.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewLot}
              className="btn-3d-copper min-h-[48px] px-6 py-3 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-base inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>{t('collector.sellBtn')}</span>
            </button>
          </TiltCard3D>

          {/* Quick Earnings + Impact Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TiltCard3D
              maxTiltDeg={5.5}
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Net Earnings</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1 text-[#b04a17]">
                <AnimatedNumber value={totals.net} format={(v) => formatINR(Math.round(v))} />
              </div>
            </TiltCard3D>
            <TiltCard3D
              maxTiltDeg={5.5}
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">E-Waste Recycled</div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1">
                <AnimatedNumber value={totals.kg} format={(v) => formatKg(Math.round(v * 10) / 10)} />
              </div>
            </TiltCard3D>
            <TiltCard3D
              maxTiltDeg={5.5}
              sheenColor="emerald"
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                <span>CO₂ Emissions Avoided</span>
              </div>
              <div className="font-mono font-bold text-2xl tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                <AnimatedNumber value={totals.co2} format={(v) => formatKg(Math.round(v * 10) / 10)} />
              </div>
            </TiltCard3D>
          </div>

          {/* Active Bookings Requiring Action */}
          {activeBookings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Active Pickups & Bookings</h2>
              <div className="space-y-3">{activeBookings.map(renderBookingCard)}</div>
            </div>
          )}

          {/* Active Lots */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('collector.activeLots')}</h2>
              <button
                type="button"
                onClick={() => setTab('lots')}
                className="text-sm font-semibold text-[#b04a17]"
              >
                View all ({lots.length})
              </button>
            </div>
            {loadingData ? (
              <div className="h-24 rounded-xl bg-white dark:bg-[#15201b] animate-pulse" />
            ) : lots.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-center space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No lots listed yet. Tap &ldquo;Sell e-waste&rdquo; to create your first lot.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lots.slice(0, 4).map((lot) => (
                  <div
                    key={lot.id}
                    className="card-3d-hover rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-mono text-xs text-slate-500">{lot.id}</div>
                      <div className="font-semibold text-sm truncate">
                        {lot.items.map((i) => i.categoryName).join(', ')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                        {formatKg(lot.totalKg)} · {lot.areaLabel}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={lot.status} />
                      {lot.status === 'LISTED' && (
                        <button
                          type="button"
                          onClick={() => loadMatchesForLot(lot.id, matchSort)}
                          className="text-xs font-semibold text-[#b04a17] underline"
                        >
                          Find Recyclers
                        </button>
                      )}
                      {(lot.status === 'DRAFT' || lot.status === 'LISTED') && (
                        <button
                          type="button"
                          onClick={() => handleEditDraft(lot)}
                          className="text-xs font-medium text-slate-600 dark:text-slate-300 underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </StageTransition>
      )}

      {/* LOT WIZARD (Steps 1–4) */}
      {tab === 'sell' && (
        <div className="space-y-5">
          {/* 4-Step Progress Stepper */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { step: 1, label: t('collector.step1') },
              { step: 2, label: t('collector.step2') },
              { step: 3, label: t('collector.step3') },
              { step: 4, label: t('collector.step4') },
            ].map((s) => {
              const unlocked =
                s.step === 1 ||
                (s.step === 2 && Boolean(estimate)) ||
                (s.step === 3 && Boolean(matchLot)) ||
                (s.step === 4 && Boolean(selectedCandidate));
              return (
                <button
                  key={s.step}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    if (unlocked) setWizardStep(s.step as 1 | 2 | 3 | 4);
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                    wizardStep === s.step
                      ? 'border-[#b04a17] bg-[#b04a17] text-white'
                      : unlocked
                      ? 'border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b]'
                      : 'border-slate-200/60 dark:border-emerald-950/40 bg-slate-100/60 dark:bg-[#15201b]/40 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {wizardError && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200"
            >
              {wizardError}
            </div>
          )}

          {wizardSuccess && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{wizardSuccess}</span>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-6">
              {/* 1A. Category & Kg Selector */}
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">Select e-waste materials & approximate kg</h2>
                  <span className="font-mono text-xs font-semibold text-[#b04a17] tabular-nums">
                    {activeItemsArray.length} selected
                  </span>
                </div>

                {hasSelectedHazardous && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>{t('estimate.hazardWarning')}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((cat) => {
                    const isSelected = selectedItems[cat.id] !== undefined;
                    const displayName =
                      language === 'hi' ? cat.nameHi : language === 'kn' ? cat.nameKn : cat.name;
                    return (
                      <div
                        key={cat.id}
                        className={`card-3d-hover rounded-xl border p-3.5 ${
                          isSelected
                            ? 'border-[#b04a17] bg-[#b04a17]/5 shadow-sm'
                            : 'border-slate-200 dark:border-emerald-950/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(cat.id)}
                            className="flex-1 text-left min-h-[44px] flex items-center gap-2.5"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="w-4 h-4 accent-[#b04a17] pointer-events-none"
                            />
                            <div>
                              <div className="text-sm font-semibold leading-tight">{displayName}</div>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">
                                Ref ~{formatINR(cat.referenceRatePerKg || 0)}/kg
                              </div>
                            </div>
                          </button>
                          {cat.hazardous && (
                            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Hazard
                            </span>
                          )}
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-emerald-950/60 flex items-center gap-2">
                            <label htmlFor={`kg-${cat.id}`} className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              Approx kg:
                            </label>
                            <input
                              id={`kg-${cat.id}`}
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={selectedItems[cat.id]}
                              onChange={(e) =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [cat.id]: Math.max(0.5, Number(e.target.value) || 0),
                                }))
                              }
                              className="w-28 min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm tabular-nums"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 1B. Photos + AI Helper */}
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">Photos (up to 4)</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Auto-compressed to 1280px JPEG for low-data connections (EXIF GPS stripped).
                    </p>
                  </div>
                  <span className="font-mono text-xs">{photoUrls.length}/4</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="min-h-[48px] px-4 py-2.5 rounded-xl border border-dashed border-[#b04a17] text-[#b04a17] font-semibold text-sm inline-flex items-center gap-2 cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <span>{uploadingPhoto ? 'Compressing...' : t('collector.addPhoto')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto || photoUrls.length >= 4}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleAiIdentify}
                    disabled={aiBusy || photoUrls.length === 0}
                    className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-emerald-900/60 font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 text-[#b04a17]" />
                    <span>{aiBusy ? 'Analysing...' : t('collector.aiIdentify')}</span>
                  </button>
                </div>

                {photoStats && <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">{photoStats}</p>}
                {aiSuggestion && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                    {aiSuggestion}
                  </div>
                )}

                {photoUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {photoUrls.map((url, idx) => (
                      <div key={url} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-emerald-900/60 h-28">
                        <img src={url} alt={`Lot upload ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove photo"
                          className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 1C. Location Picker */}
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#b04a17]" />
                    <span>Pickup location</span>
                  </h2>
                  <button
                    type="button"
                    onClick={handleDetectGps}
                    className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#b04a17]" />
                    <span>{t('collector.useGps')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="lot-area-select" className="block text-xs font-medium mb-1">
                      Quick area fallback
                    </label>
                    <select
                      id="lot-area-select"
                      value=""
                      onChange={(e) => {
                        const chosen = MANGALURU_AREAS.find((a) => a.label === e.target.value);
                        if (chosen) {
                          setLat(chosen.lat);
                          setLng(chosen.lng);
                          setAreaLabel(chosen.label);
                        }
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                    >
                      <option value="">Select Mangaluru locality...</option>
                      {MANGALURU_AREAS.map((a) => (
                        <option key={a.label} value={a.label}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lot-area-text" className="block text-xs font-medium mb-1">
                      Confirmed area label
                    </label>
                    <input
                      id="lot-area-text"
                      type="text"
                      value={areaLabel}
                      onChange={(e) => setAreaLabel(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                    />
                  </div>
                </div>

                <LeafletMapPicker
                  lat={lat}
                  lng={lng}
                  onChange={(newLat, newLng) => {
                    setLat(newLat);
                    setLng(newLng);
                  }}
                />
                <div className="text-xs font-mono text-slate-500">
                  Pin coordinates: {lat.toFixed(5)}, {lng.toFixed(5)} (drag pin or tap map to adjust)
                </div>

                <div>
                  <label htmlFor="lot-notes" className="block text-xs font-medium mb-1">
                    Notes for recycler (optional)
                  </label>
                  <input
                    id="lot-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Behind market gate, available after 10 AM"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={wizardBusy}
                  onClick={async () => {
                    const saved = await saveDraftOrList(false);
                    if (saved) setWizardSuccess(`Saved draft ${saved.id}. You can edit anytime.`);
                  }}
                  className="min-h-[48px] px-5 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] font-semibold text-sm"
                >
                  {t('collector.saveDraft')}
                </button>
                <button
                  type="button"
                  disabled={wizardBusy}
                  onClick={handleCheckEstimate}
                  className="btn-3d-copper flex-1 min-h-[48px] px-6 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-base"
                >
                  {wizardBusy ? t('common.loading') : t('collector.checkEstimate')}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: INDICATIVE VALUE */}
          {wizardStep === 2 && estimate && (
            <StageTransition className="space-y-5">
              <TiltCard3D
                maxTiltDeg={3}
                className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 sm:p-6 space-y-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-[#b04a17] font-bold">
                      {t('estimate.title')}
                    </div>
                    <div className="font-mono font-bold text-3xl sm:text-4xl tabular-nums mt-1">
                      <AnimatedNumber value={estimate.lowTotal} format={(v) => formatINR(Math.round(v))} /> –{' '}
                      <AnimatedNumber value={estimate.highTotal} format={(v) => formatINR(Math.round(v))} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t('estimate.range')} · Total {formatKg(estimate.totalKg)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold"
                  >
                    Edit materials
                  </button>
                </div>

                {estimate.hasHazardous && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>{t('estimate.hazardWarning')}</span>
                  </div>
                )}

                <div className="weighbridge-divider pt-4 space-y-3">
                  {estimate.items.map((item) => (
                    <div
                      key={item.categoryId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-b border-slate-100 dark:border-emerald-950/40"
                    >
                      <div>
                        <div className="font-semibold">
                          {item.categoryName}{' '}
                          <span className="font-mono text-xs text-slate-500">({formatKg(item.declaredKg)})</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.source === 'REGIONAL_MEDIAN'
                            ? `${t('estimate.sourceMedian')} (${item.recyclerSampleCount} recyclers · ${formatINR(item.medianRatePerKg)}/kg)`
                            : `${t('estimate.sourceRef')} (${formatINR(item.medianRatePerKg)}/kg)`}
                        </div>
                      </div>
                      <div className="font-mono font-bold tabular-nums">
                        {formatINR(item.lowAmount)} – {formatINR(item.highAmount)}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {estimate.disclaimer}
                </p>

                <button
                  type="button"
                  disabled={wizardBusy}
                  onClick={handlePublishAndFindRecyclers}
                  className="btn-3d-copper w-full min-h-[48px] rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-base"
                >
                  {wizardBusy ? t('common.loading') : t('collector.publishLot')}
                </button>
              </TiltCard3D>
            </StageTransition>
          )}

          {/* STEP 3: CHOOSE RECYCLER (LIST + LEAFLET MAP) */}
          {wizardStep === 3 && matchLot && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    Lot {matchLot.id} · {formatKg(matchLot.totalKg)} · {matchLot.areaLabel}
                  </div>
                  <h2 className="text-lg font-bold mt-0.5">
                    {eligibleMatches.length} Verified Recycler{eligibleMatches.length === 1 ? '' : 's'} Matched
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#0d1512] p-1">
                    {(
                      [
                        { id: 'net_price', label: 'Best Net' },
                        { id: 'nearest', label: 'Nearest' },
                        { id: 'earliest', label: 'Earliest' },
                      ] as { id: MatchSort; label: string }[]
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setMatchSort(s.id);
                          loadMatchesForLot(matchLot.id, s.id);
                        }}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                          matchSort === s.id
                            ? 'bg-[#b04a17] text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex rounded-xl border border-slate-200 dark:border-emerald-900/60 p-1">
                    <button
                      type="button"
                      onClick={() => setMatchView('list')}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                        matchView === 'list' ? 'bg-slate-900 text-white dark:bg-emerald-900' : ''
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchView('map')}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                        matchView === 'map' ? 'bg-slate-900 text-white dark:bg-emerald-900' : ''
                      }`}
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>Map</span>
                    </button>
                  </div>
                </div>
              </div>

              {matchView === 'map' && (
                <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 space-y-2">
                  <LeafletMapPicker
                    lat={matchLot.lat}
                    lng={matchLot.lng}
                    interactive={false}
                    heightClass="h-72"
                    markers={[
                      ...eligibleMatches
                        .filter((m) => m.lat && m.lng)
                        .map((m) => ({
                          id: m.recyclerId,
                          lat: m.lat!,
                          lng: m.lng!,
                          label: m.businessName,
                          sublabel: `Net ${formatINR(m.netAmount)} · ${m.distanceKm.toFixed(1)} km · ${m.effectiveMode}`,
                          color: '#16a34a',
                        })),
                      ...partialMatches
                        .filter((m) => m.lat && m.lng)
                        .map((m) => ({
                          id: m.recyclerId,
                          lat: m.lat!,
                          lng: m.lng!,
                          label: `${m.businessName} (Partial)`,
                          sublabel: m.ineligibleReasons[0] || 'Incomplete category rates',
                          color: '#d97706',
                        })),
                    ]}
                  />
                  <div className="text-xs text-slate-500">
                    Copper pin: Your lot · Green pins: Eligible verified recyclers · Amber pins: Partial matches
                  </div>
                </div>
              )}

              {eligibleMatches.length === 0 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-5 text-sm space-y-2">
                  <div className="font-bold">No single verified recycler covers every constraint for this lot.</div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Try adjusting weights, splitting hazardous items into a separate lot, or reviewing partial matches below.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eligibleMatches.map((m) => {
                    const topTag = m.tags[0];
                    return (
                      <TiltCard3D
                        key={m.recyclerId}
                        maxTiltDeg={3}
                        interactiveSafe
                        className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            {topTag && (
                              <span className="inline-block text-[11px] font-mono font-bold uppercase tracking-wider text-[#b04a17]">
                                {topTag === 'BEST_NET_PRICE'
                                  ? '★ Best Net Payout'
                                  : topTag === 'NEAREST'
                                  ? '◆ Nearest Facility'
                                  : '⏱ Earliest Pickup'}
                              </span>
                            )}
                            <h3 className="text-lg font-bold">{m.businessName}</h3>
                            <div className="text-xs font-mono text-slate-500">
                              {m.registrationNumber} · {m.distanceKm.toFixed(1)} km away · Mode: {m.mode}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-slate-500">Net Payout</div>
                            <div className="font-mono font-bold text-2xl text-[#b04a17] tabular-nums">
                              {formatINR(m.netAmount)}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Gross {formatINR(m.offerTotal)}
                              {m.transportCost > 0 ? ` − ${formatINR(m.transportCost)} transport` : ' · Free pickup'}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-emerald-950/40">
                          {m.perMaterialRates.map((r) => (
                            <div
                              key={r.categoryId}
                              className="flex items-center justify-between text-xs bg-slate-50 dark:bg-[#0d1512] rounded-lg px-3 py-2"
                            >
                              <span className="truncate pr-2">
                                {r.categoryName} ({formatKg(r.declaredKg)})
                              </span>
                              <span className="font-mono font-semibold shrink-0">
                                {formatINR(r.ratePerKg)}/kg = {formatINR(r.lineTotal)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            Next slot: <strong className="font-mono">{m.nextSlots[0]?.label}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectCandidateForBooking(m)}
                            className="btn-3d-copper min-h-[44px] px-5 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white text-sm font-semibold"
                          >
                            Select & Book Slot
                          </button>
                        </div>
                      </TiltCard3D>
                    );
                  })}
                </div>
              )}

              {partialMatches.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowPartial((prev) => !prev)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <span>Other nearby recyclers — unbookable partial match ({partialMatches.length})</span>
                    {showPartial ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPartial && (
                    <div className="space-y-2.5 pt-2">
                      {partialMatches.map((pm) => (
                        <div
                          key={pm.recyclerId}
                          className="rounded-xl border border-slate-200 dark:border-emerald-900/50 p-3 text-xs space-y-1 opacity-85"
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>{pm.businessName}</span>
                            <span className="font-mono text-slate-500">{pm.distanceKm.toFixed(1)} km</span>
                          </div>
                          <div className="text-amber-800 dark:text-amber-300">
                            Why unbookable: {pm.ineligibleReasons.join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: BOOK SLOT */}
          {wizardStep === 4 && matchLot && selectedCandidate && (
            <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-[#b04a17] font-bold">
                    Step 4 · Confirm Slot & Locked Rates
                  </div>
                  <h2 className="text-xl font-bold mt-1">{selectedCandidate.businessName}</h2>
                  <p className="text-xs font-mono text-slate-500">
                    {selectedCandidate.registrationNumber} · {selectedCandidate.distanceKm.toFixed(1)} km from {matchLot.areaLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold"
                >
                  Change recycler
                </button>
              </div>

              {/* Service Mode Selector */}
              <div className="space-y-2">
                <div className="text-xs font-semibold">Handover mode</div>
                {selectedCandidate.mode === 'BOTH' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['PICKUP', 'DELIVERY'] as BookingMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBookingMode(m)}
                        className={`min-h-[52px] p-3.5 rounded-xl border text-left transition-colors ${
                          bookingMode === m
                            ? 'border-[#b04a17] bg-[#b04a17]/10'
                            : 'border-slate-200 dark:border-emerald-900/60'
                        }`}
                      >
                        <div className="font-semibold text-sm">
                          {m === 'PICKUP' ? 'Recycler Pickup (Recommended)' : 'Self Delivery to Facility'}
                        </div>
                        <div className="text-xs font-mono text-slate-500 mt-0.5">
                          {m === 'PICKUP'
                            ? 'Transport deduction: ₹0'
                            : `Transport est: -${formatINR(Math.round(selectedCandidate.distanceKm * 2 * costPerKm))}`}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-emerald-900/60 p-3 text-sm font-medium">
                    {selectedCandidate.mode === 'PICKUP'
                      ? 'Pickup by recycler van (₹0 transport deduction)'
                      : `Collector drop-off delivery (-${formatINR(step4TransportCost)} transport deduction at ₹${costPerKm}/km round-trip)`}
                  </div>
                )}
              </div>

              {/* Slot Picker */}
              <div className="space-y-2">
                <div className="text-xs font-semibold">Choose pickup / drop-off window</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedCandidate.nextSlots.map((slot, idx) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setSelectedSlotIdx(idx)}
                      className={`min-h-[48px] px-4 py-2.5 rounded-xl border text-left text-sm font-mono transition-colors ${
                        selectedSlotIdx === idx
                          ? 'border-[#b04a17] bg-[#b04a17] text-white font-semibold'
                          : 'border-slate-200 dark:border-emerald-900/60'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="weighbridge-divider pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span>Estimated Material Gross ({formatKg(matchLot.totalKg)})</span>
                  <span className="font-mono font-semibold">{formatINR(selectedCandidate.offerTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Transport Adjustment ({bookingMode})</span>
                  <span className="font-mono">- {formatINR(step4TransportCost)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-[#b04a17] pt-1">
                  <span>Estimated Net Payout</span>
                  <span className="font-mono">{formatINR(step4NetAmount)}</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-[#0d1512] p-3 text-xs text-slate-600 dark:text-slate-300">
                Rates lock on booking. If the recycler doesn&apos;t accept within 12 hours, the request auto-expires and your lot returns to LISTED so you can pick another buyer.
              </div>

              <button
                type="button"
                disabled={wizardBusy}
                onClick={handleCreateBooking}
                className="btn-3d-copper w-full min-h-[48px] rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-base"
              >
                {wizardBusy ? t('common.loading') : 'Confirm Booking Request'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MY LOTS & ACTIVE BOOKINGS */}
      {tab === 'lots' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{t('nav.lots')}</h1>
            <button
              type="button"
              onClick={startNewLot}
              className="min-h-[44px] px-4 rounded-xl bg-[#b04a17] text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>New Lot</span>
            </button>
          </div>

          {bookingError && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200">
              {bookingError}
            </div>
          )}
          {bookingFeedback && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
              {bookingFeedback}
            </div>
          )}

          {bookings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold">Bookings & Handover Receipts</h2>
              {bookings.map(renderBookingCard)}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-base font-bold">All E-Waste Lots</h2>
            {lots.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-sm text-slate-500">
                No lots created yet.
              </div>
            ) : (
              lots.map((lot) => (
                <div
                  key={lot.id}
                  className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="font-mono text-xs text-slate-500">
                      {lot.id} · {formatDateTimeIN(lot.updatedAt)}
                    </div>
                    <div className="font-semibold">
                      {lot.items.map((i) => `${i.categoryName} (${formatKg(i.declaredKg)})`).join(', ')}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {lot.areaLabel} · Total {formatKg(lot.totalKg)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <StatusBadge status={lot.status} />
                    {lot.status === 'LISTED' && (
                      <button
                        type="button"
                        onClick={() => loadMatchesForLot(lot.id, matchSort)}
                        className="min-h-[40px] px-3.5 rounded-lg bg-[#b04a17] text-white text-xs font-semibold"
                      >
                        Find Recyclers
                      </button>
                    )}
                    {(lot.status === 'DRAFT' || lot.status === 'LISTED') && (
                      <button
                        type="button"
                        onClick={() => handleEditDraft(lot)}
                        className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* EARNINGS LEDGER (KPIs + Monthly Chart + CSV Export) */}
      {tab === 'ledger' && (
        <StageTransition className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold">{t('nav.ledger')}</h1>
            <a
              href="/api/ledger/csv"
              download="kabadiwala-ledger.csv"
              className="card-3d-hover min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] text-xs font-semibold inline-flex items-center gap-2 hover:border-[#b04a17]"
            >
              <Download className="w-4 h-4 text-[#b04a17]" />
              <span>{t('collector.exportLedgerCsv')}</span>
            </a>
          </div>

          <div className="rounded-xl border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-200">
            {EPR_DISCLAIMER}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <TiltCard3D
              maxTiltDeg={5.5}
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Net Earnings</div>
              <div className="font-mono font-bold text-xl sm:text-2xl tabular-nums mt-1 text-[#b04a17]">
                <AnimatedNumber value={totals.net} format={(v) => formatINR(Math.round(v))} />
              </div>
            </TiltCard3D>
            <TiltCard3D
              maxTiltDeg={5.5}
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Recycled</div>
              <div className="font-mono font-bold text-xl sm:text-2xl tabular-nums mt-1">
                <AnimatedNumber value={totals.kg} format={(v) => formatKg(Math.round(v * 10) / 10)} />
              </div>
            </TiltCard3D>
            <TiltCard3D
              maxTiltDeg={5.5}
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#b04a17]" />
                <span>Avg Realised Rate</span>
              </div>
              <div className="font-mono font-bold text-xl sm:text-2xl tabular-nums mt-1">
                <AnimatedNumber value={totals.avgPerKg} format={(v) => `${formatINR(Math.round(v))}/kg`} />
              </div>
            </TiltCard3D>
            <TiltCard3D
              maxTiltDeg={5.5}
              sheenColor="emerald"
              className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                <span>CO₂ Saved</span>
              </div>
              <div className="font-mono font-bold text-xl sm:text-2xl tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                <AnimatedNumber value={totals.co2} format={(v) => formatKg(Math.round(v * 10) / 10)} />
              </div>
            </TiltCard3D>
          </div>

          {monthlyLedgerSeries.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold">{t('collector.monthlyEarnings')}</h2>
              <div className="w-full h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyLedgerSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: unknown, name: unknown) =>
                        name === 'netAmount'
                          ? [formatINR(Number(val)), 'Net Payout']
                          : [`${Number(val)} kg`, 'Weight']
                      }
                    />
                    <Bar dataKey="netAmount" name="netAmount" fill="#b04a17" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 dark:border-emerald-950/60 text-slate-500">
                  <th className="p-3.5">Receipt</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Recycler</th>
                  <th className="p-3.5">Method</th>
                  <th className="p-3.5 text-right">Kg</th>
                  <th className="p-3.5 text-right">Net ₹</th>
                  <th className="p-3.5 text-right">CO₂</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-emerald-950/40">
                    <td className="p-3.5 font-mono">
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(row.receiptId)}
                        className="text-[#b04a17] underline font-semibold"
                      >
                        {row.receiptId}
                      </button>
                    </td>
                    <td className="p-3.5 text-xs text-slate-500">{formatDateTimeIN(row.date)}</td>
                    <td className="p-3.5">{row.recyclerBusinessName || 'Verified Recycler'}</td>
                    <td className="p-3.5 font-mono text-xs">{row.method}</td>
                    <td className="p-3.5 text-right font-mono">{formatKg(row.kg)}</td>
                    <td className="p-3.5 text-right font-mono font-bold">{formatINR(row.netAmount)}</td>
                    <td className="p-3.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                      {formatKg(row.co2SavedKg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StageTransition>
      )}

      {/* PROFILE & DPDP ACCOUNT DELETION */}
      {tab === 'profile' && (
        <div className="max-w-xl space-y-6">
          <h1 className="text-xl font-bold">{t('nav.profile')}</h1>
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4"
          >
            {profSaved && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-3 py-2 text-xs">
                {profSaved}
              </div>
            )}
            <div>
              <label htmlFor="prof-name" className="block text-sm font-medium mb-1">
                Name
              </label>
              <input
                id="prof-name"
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
              />
            </div>
            <div>
              <label htmlFor="prof-area" className="block text-sm font-medium mb-1">
                Default Area
              </label>
              <input
                id="prof-area"
                value={profArea}
                onChange={(e) => setProfArea(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
              />
            </div>
            <div>
              <label htmlFor="prof-upi" className="block text-sm font-medium mb-1">
                UPI ID (for digital payments)
              </label>
              <input
                id="prof-upi"
                value={profUpi}
                onChange={(e) => setProfUpi(e.target.value)}
                placeholder="ramesh@okicici"
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-[#b04a17] text-white font-semibold text-sm"
            >
              Save Profile
            </button>
          </form>

          <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#15201b] p-5 space-y-3">
            <h2 className="font-bold text-red-700 dark:text-red-400">DPDP Privacy & Account Deletion</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Deleting your account removes your name, phone number, UPI ID, and notifications while retaining anonymized statutory weighbridge totals.
            </p>
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="min-h-[44px] px-4 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-sm font-semibold"
              >
                {t('common.deleteAccount')}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-sm font-semibold"
                >
                  Confirm Permanent Delete
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};
