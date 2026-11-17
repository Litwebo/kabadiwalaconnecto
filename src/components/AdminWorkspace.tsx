import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileText,
  Layers,
  Leaf,
  Package,
  Settings,
  ShieldCheck,
  Users,
  XCircle,
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
import { formatDateTimeIN, formatINR, formatKg } from '../shared/format.ts';
import type {
  BookingDTO,
  CategoryDTO,
  DisputeDTO,
  LotDTO,
  RecyclerProfileDTO,
  UserDTO,
} from '../shared/types.ts';
import { AppShell, type NavTab } from './AppShell.tsx';
import { AnimatedNumber, StageTransition, TiltCard3D } from './MotionPrimitives.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface AdminDisputeItem extends DisputeDTO {
  lotId: string;
  collectorName: string;
  recyclerBusinessName: string;
  bookingStatus: string;
  netAmount: number;
}

interface AdminAnalytics {
  activeCollectors: number;
  verifiedRecyclers: number;
  pendingRecyclers: number;
  openDisputes: number;
  totalKgListed: number;
  totalKgCompleted: number;
  completedTransactions: number;
  avgSellingPricePerKg: number;
  percentMaterialToVerifiedRecyclers: number;
  repeatTransactionRate: number;
  avgTransportCostPerKg: number;
  totalCo2SavedKg: number;
  monthlySeries: { month: string; kg: number; netAmount: number; count: number }[];
}

export const AdminWorkspace: React.FC = () => {
  const { refreshCategories, t } = useApp();
  const [tab, setTab] = useState<'verify' | 'disputes' | 'analytics' | 'catalog' | 'config'>('verify');
  const [recyclers, setRecyclers] = useState<RecyclerProfileDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [disputes, setDisputes] = useState<AdminDisputeItem[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [recentLots, setRecentLots] = useState<LotDTO[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingDTO[]>([]);

  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [disputeNotes, setDisputeNotes] = useState<Record<string, string>>({});
  const [disputeOutcomes, setDisputeOutcomes] = useState<
    Record<string, '' | 'COMPLETED' | 'CANCELLED' | 'HANDED_OVER'>
  >({});
  const [rateEdits, setRateEdits] = useState<Record<string, number>>({});
  const [costPerKm, setCostPerKm] = useState(7);
  const [expiryHours, setExpiryHours] = useState(12);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [recRes, catRes, usrRes, setRes, dspRes, anaRes, lotRes, bkgRes] = await Promise.all([
        apiFetch<{ recyclers: RecyclerProfileDTO[] }>('/api/admin/recyclers'),
        apiFetch<{ categories: CategoryDTO[] }>('/api/admin/categories'),
        apiFetch<{ users: UserDTO[] }>('/api/admin/users'),
        apiFetch<{ settings: Record<string, string> }>('/api/admin/settings'),
        apiFetch<{ disputes: AdminDisputeItem[] }>('/api/admin/disputes'),
        apiFetch<{ analytics: AdminAnalytics }>('/api/admin/analytics'),
        apiFetch<{ lots: LotDTO[] }>('/api/admin/lots'),
        apiFetch<{ bookings: BookingDTO[] }>('/api/bookings'),
      ]);
      setRecyclers(recRes.recyclers);
      setCategories(catRes.categories);
      setUsers(usrRes.users);
      setDisputes(dspRes.disputes);
      setAnalytics(anaRes.analytics);
      setRecentLots(lotRes.lots);
      setRecentBookings(bkgRes.bookings);

      const rMap: Record<string, number> = {};
      for (const c of catRes.categories) {
        rMap[c.id] = c.referenceRatePerKg || 50;
      }
      setRateEdits(rMap);
      if (setRes.settings.COST_PER_KM) setCostPerKm(Number(setRes.settings.COST_PER_KM));
      if (setRes.settings.BOOKING_EXPIRY_HOURS) setExpiryHours(Number(setRes.settings.BOOKING_EXPIRY_HOURS));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openDisputesCount = useMemo(
    () => disputes.filter((d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length,
    [disputes]
  );

  const tabs: NavTab[] = [
    { id: 'verify', label: t('nav.verifyQueue'), icon: <ShieldCheck className="w-5 h-5" /> },
    {
      id: 'disputes',
      label: `${t('nav.disputes')}${openDisputesCount ? ` (${openDisputesCount})` : ''}`,
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    { id: 'analytics', label: t('nav.analytics'), icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'catalog', label: t('nav.catalog'), icon: <Layers className="w-5 h-5" /> },
    { id: 'config', label: t('nav.usersConfig'), icon: <Settings className="w-5 h-5" /> },
  ];

  const handleVerify = async (recyclerId: string, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/recyclers/${recyclerId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reason: decision === 'REJECTED' ? rejectReasons[recyclerId] || '' : undefined,
        }),
      });
      setNotice(`Recycler ${decision.toLowerCase()} successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification action failed.');
    }
  };

  const handleResolveDispute = async (disputeId: string, status: 'RESOLVED' | 'DISMISSED') => {
    const note = (disputeNotes[disputeId] || '').trim();
    if (note.length < 3) {
      setError('Enter a resolution note (at least 3 characters) before closing the dispute.');
      return;
    }
    const outcome = disputeOutcomes[disputeId] || undefined;
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          resolutionNote: note,
          bookingOutcome: outcome || undefined,
        }),
      });
      setNotice(`Dispute ${disputeId} marked ${status}.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resolve dispute.');
    }
  };

  const handleUpdateRefRate = async (categoryId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/reference-rates', {
        method: 'POST',
        body: JSON.stringify({ categoryId, pricePerKg: Number(rateEdits[categoryId]) }),
      });
      await Promise.all([loadAll(), refreshCategories()]);
      setNotice('Reference rate updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update rate.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ COST_PER_KM: Number(costPerKm), BOOKING_EXPIRY_HOURS: Number(expiryHours) }),
    });
    setNotice('Platform settings saved.');
  };

  return (
    <AppShell tabs={tabs} activeTab={tab} onSelectTab={(id) => setTab(id as typeof tab)}>
      <div className="space-y-5">
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

        {/* VERIFY QUEUE */}
        {tab === 'verify' && (
          <StageTransition className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold">{t('admin.verifyQueue')}</h1>
              <a
                href="https://eprewastecpcb.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="card-3d-hover min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold inline-flex items-center gap-1.5 text-[#b04a17]"
              >
                <span>{t('admin.cpcbCheck')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="space-y-3">
              {recyclers.map((r) => (
                <TiltCard3D
                  key={r.id}
                  maxTiltDeg={2.5}
                  interactiveSafe
                  sheenColor={r.verificationStatus === 'APPROVED' ? 'emerald' : 'copper'}
                  className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold">{r.businessName}</h2>
                        <StatusBadge status={r.verificationStatus} />
                      </div>
                      <div className="font-mono text-xs text-slate-600 dark:text-slate-300 mt-1">
                        Reg: {r.registrationNumber} · Expires {formatDateTimeIN(r.registrationExpiry)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {r.address} · Mode: {r.mode} · Radius: {r.serviceRadiusKm} km · Min {r.minQtyKg} kg
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.authorisationDocUrls.map((url, idx) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 text-xs font-mono inline-flex items-center gap-1.5 text-[#b04a17]"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Doc #{idx + 1}</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-100 dark:border-emerald-950/40">
                    <input
                      type="text"
                      value={rejectReasons[r.id] || ''}
                      onChange={(e) => setRejectReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Rejection reason (required if rejecting)"
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerify(r.id, 'APPROVED')}
                      className="btn-3d-emerald min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('admin.approve')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerify(r.id, 'REJECTED')}
                      className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{t('admin.reject')}</span>
                    </button>
                  </div>
                </TiltCard3D>
              ))}
            </div>
          </StageTransition>
        )}

        {/* DISPUTES QUEUE */}
        {tab === 'disputes' && (
          <StageTransition className="space-y-4">
            <h1 className="text-xl font-bold">{t('admin.disputesTitle')}</h1>
            {disputes.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 text-sm text-slate-500">
                No disputes logged on the platform.
              </div>
            ) : (
              <div className="space-y-3">
                {disputes.map((d) => {
                  const isOpen = d.status === 'OPEN' || d.status === 'UNDER_REVIEW';
                  return (
                    <TiltCard3D
                      key={d.id}
                      maxTiltDeg={2.5}
                      interactiveSafe
                      className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-mono text-xs text-slate-500">
                            {d.id} · Booking {d.bookingId} · Lot {d.lotId}
                          </div>
                          <div className="font-bold text-base">
                            {d.collectorName} vs {d.recyclerBusinessName}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            Raised by: {d.raisedByName || d.raisedById} · Booking Status: {d.bookingStatus} · Amount:{' '}
                            <span className="font-mono font-bold">{formatINR(d.netAmount)}</span>
                          </div>
                        </div>
                        <StatusBadge status={d.status} />
                      </div>

                      <div className="rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-sm">
                        <span className="font-semibold">Reason: </span>
                        {d.reason}
                      </div>

                      {d.resolutionNote && (
                        <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3 text-xs">
                          <span className="font-semibold">Admin Resolution: </span>
                          {d.resolutionNote}
                        </div>
                      )}

                      {isOpen && (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-emerald-950/40">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <input
                              type="text"
                              value={disputeNotes[d.id] || ''}
                              onChange={(e) =>
                                setDisputeNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                              }
                              placeholder="Resolution note (e.g. Verified UTR & credited ledger)..."
                              className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                            />
                            <select
                              value={disputeOutcomes[d.id] || ''}
                              onChange={(e) =>
                                setDisputeOutcomes((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.value as
                                    | ''
                                    | 'COMPLETED'
                                    | 'CANCELLED'
                                    | 'HANDED_OVER',
                                }))
                              }
                              className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] text-sm"
                            >
                              <option value="">Booking Outcome (Optional)</option>
                              <option value="COMPLETED">Mark Booking COMPLETED &amp; Credit Ledger</option>
                              <option value="HANDED_OVER">Return to HANDED_OVER (Re-enter Payment)</option>
                              <option value="CANCELLED">Cancel Booking &amp; Re-list Lot</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolveDispute(d.id, 'RESOLVED')}
                              className="btn-3d-emerald min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{t('admin.resolve')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolveDispute(d.id, 'DISMISSED')}
                              className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-emerald-900/60 text-sm font-semibold"
                            >
                              {t('admin.dismiss')}
                            </button>
                          </div>
                        </div>
                      )}
                    </TiltCard3D>
                  );
                })}
              </div>
            )}
          </StageTransition>
        )}

        {/* ANALYTICS & ACTIVITY */}
        {tab === 'analytics' && analytics && (
          <StageTransition className="space-y-5">
            <h1 className="text-xl font-bold">{t('admin.analyticsTitle')}</h1>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Active Collectors</div>
                <div className="font-mono font-bold text-2xl tabular-nums mt-1">
                  <AnimatedNumber value={analytics.activeCollectors} />
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                sheenColor="emerald"
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Verified Recyclers</div>
                <div className="font-mono font-bold text-2xl tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                  <AnimatedNumber value={analytics.verifiedRecyclers} />{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    ({analytics.pendingRecyclers} pending)
                  </span>
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Completed / Listed Kg</div>
                <div className="font-mono font-bold text-xl sm:text-2xl tabular-nums mt-1 text-[#b04a17]">
                  <AnimatedNumber
                    value={analytics.totalKgCompleted}
                    format={(v) => formatKg(Math.round(v * 10) / 10)}
                  />{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    / {formatKg(analytics.totalKgListed)}
                  </span>
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                sheenColor="emerald"
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CO₂ Avoided</span>
                </div>
                <div className="font-mono font-bold text-2xl tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                  <AnimatedNumber
                    value={analytics.totalCo2SavedKg}
                    format={(v) => formatKg(Math.round(v * 10) / 10)}
                  />
                </div>
              </TiltCard3D>

              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Avg Selling Price</div>
                <div className="font-mono font-bold text-xl tabular-nums mt-1">
                  <AnimatedNumber
                    value={analytics.avgSellingPricePerKg}
                    format={(v) => `${formatINR(Math.round(v))}/kg`}
                  />
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">% to Verified Recyclers</div>
                <div className="font-mono font-bold text-xl tabular-nums mt-1">
                  <AnimatedNumber
                    value={analytics.percentMaterialToVerifiedRecyclers}
                    format={(v) => `${Math.round(v)}%`}
                  />
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Repeat Collector Rate</div>
                <div className="font-mono font-bold text-xl tabular-nums mt-1">
                  <AnimatedNumber
                    value={analytics.repeatTransactionRate}
                    format={(v) => `${Math.round(v)}%`}
                  />
                </div>
              </TiltCard3D>
              <TiltCard3D
                maxTiltDeg={5.5}
                className="rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 shadow-sm"
              >
                <div className="text-xs text-slate-500">Avg Transport Cost / kg</div>
                <div className="font-mono font-bold text-xl tabular-nums mt-1">
                  <AnimatedNumber
                    value={analytics.avgTransportCostPerKg}
                    format={(v) => `${formatINR(Math.round(v * 100) / 100, 2)}/kg`}
                  />
                </div>
              </TiltCard3D>
            </div>

            {analytics.monthlySeries.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-3">
                <h2 className="text-sm font-bold">Monthly Marketplace Volume (kg) &amp; Payout (₹)</h2>
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.monthlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(val: unknown, name: unknown) =>
                          name === 'netAmount'
                            ? [formatINR(Number(val)), 'Net ₹']
                            : [`${Number(val)} kg`, 'Recycled Kg']
                        }
                      />
                      <Bar dataKey="netAmount" name="netAmount" fill="#b04a17" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#b04a17]" />
                <h2 className="text-base font-bold">Recent Lots &amp; Bookings Activity</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-emerald-950/60 text-slate-500">
                      <th className="py-2.5 pr-3">Booking</th>
                      <th className="py-2.5 pr-3">Collector</th>
                      <th className="py-2.5 pr-3">Recycler</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 text-right">Net ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.slice(0, 12).map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 dark:border-emerald-950/40">
                        <td className="py-2.5 pr-3 font-mono">{b.id}</td>
                        <td className="py-2.5 pr-3">{b.collectorName}</td>
                        <td className="py-2.5 pr-3">{b.recyclerBusinessName}</td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold">
                          {formatINR(b.handover?.netAmount ?? Math.max(0, b.estimatedTotal - b.transportCost))}
                        </td>
                      </tr>
                    ))}
                    {recentLots.length === 0 && recentBookings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-slate-500">
                          No recent bookings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </StageTransition>
        )}

        {/* CATEGORIES & REFERENCE RATES */}
        {tab === 'catalog' && (
          <StageTransition className="space-y-4">
            <h1 className="text-xl font-bold">E-Waste Categories &amp; Admin Reference Rates</h1>
            <div className="space-y-3">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="card-3d-hover rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold">
                      {c.name} {c.hazardous ? '⚠️ (Hazardous)' : ''}
                    </div>
                    <div className="text-xs text-slate-500">
                      HI: {c.nameHi} · KN: {c.nameKn} · CO₂ factor: {c.co2FactorPerKg} kg/kg
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">₹</span>
                    <input
                      type="number"
                      min={1}
                      value={rateEdits[c.id] ?? c.referenceRatePerKg ?? 0}
                      onChange={(e) =>
                        setRateEdits((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                      }
                      className="w-24 min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateRefRate(c.id)}
                      className="btn-3d-copper min-h-[44px] px-3.5 rounded-xl bg-[#b04a17] text-white text-xs font-semibold"
                    >
                      Update ({formatINR(c.referenceRatePerKg || 0)})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </StageTransition>
        )}

        {/* USERS & PLATFORM CONFIG */}
        {tab === 'config' && (
          <div className="space-y-6">
            <form
              onSubmit={handleSaveSettings}
              className="max-w-md rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-4"
            >
              <h1 className="text-lg font-bold">Platform Parameters</h1>
              <div>
                <label className="block text-sm font-medium mb-1">Delivery Transport Cost per km (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={costPerKm}
                  onChange={(e) => setCostPerKm(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Booking Acceptance Window (hours)</label>
                <input
                  type="number"
                  min={1}
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] font-mono"
                />
              </div>
              <button
                type="submit"
                className="btn-3d-copper min-h-[44px] px-5 rounded-xl bg-[#b04a17] text-white font-semibold text-sm"
              >
                Save Settings
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#b04a17]" />
                <h2 className="text-base font-bold">Registered Platform Users ({users.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-emerald-950/60 text-slate-500">
                      <th className="py-2.5 pr-3">Name</th>
                      <th className="py-2.5 pr-3">Role</th>
                      <th className="py-2.5 pr-3">Area</th>
                      <th className="py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 dark:border-emerald-950/40">
                        <td className="py-2.5 pr-3 font-semibold">{u.name}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{u.role}</td>
                        <td className="py-2.5 pr-3">{u.areaLabel}</td>
                        <td className="py-2.5">
                          <StatusBadge status={u.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
