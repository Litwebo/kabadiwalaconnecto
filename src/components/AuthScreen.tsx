import { ArrowLeft, LogIn, Phone, ShieldCheck, UserCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { apiFetch, setClientSessionToken } from '../lib/api.ts';
import type { UserDTO } from '../shared/types.ts';
import { MANGALURU_AREAS } from './LeafletMapPicker.tsx';
import { StageTransition, StampBadge3D, TiltCard3D } from './MotionPrimitives.tsx';

interface DemoAccount {
  id: string;
  name: string;
  role: 'COLLECTOR' | 'RECYCLER' | 'ADMIN';
  areaLabel: string;
  businessName: string | null;
  verificationStatus: string | null;
}

interface AuthScreenProps {
  defaultRole?: 'COLLECTOR' | 'RECYCLER';
  onBack: () => void;
  onAuthenticated: (user: UserDTO) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  defaultRole = 'COLLECTOR',
  onBack,
  onAuthenticated,
}) => {
  const { demoMode, refreshNotifications, refreshUser, t } = useApp();
  const [phone, setPhone] = useState('9845011111');
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'COLLECTOR' | 'RECYCLER'>(defaultRole);
  const [areaIdx, setAreaIdx] = useState(0);
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [selectedDemoId, setSelectedDemoId] = useState<string>('');

  useEffect(() => {
    if (!demoMode) return;
    apiFetch<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => {
        setDemoAccounts(res.accounts);
        if (res.accounts.length > 0) {
          const preferred =
            res.accounts.find((a) => a.role === defaultRole) || res.accounts[0];
          setSelectedDemoId(preferred.id);
        }
      })
      .catch(() => undefined);
  }, [demoMode, defaultRole]);

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const area = MANGALURU_AREAS[areaIdx] || MANGALURU_AREAS[0];
      const res = await apiFetch<{ user: UserDTO; isNewUser: boolean; sessionToken?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            phone,
            name: isNewProfile ? name : undefined,
            role: isNewProfile ? role : undefined,
            areaLabel: isNewProfile ? area.label : undefined,
            lat: isNewProfile ? area.lat : undefined,
            lng: isNewProfile ? area.lng : undefined,
            consentAccepted,
          }),
        }
      );
      if (res.sessionToken) setClientSessionToken(res.sessionToken);
      const user = await refreshUser();
      await refreshNotifications();
      if (user) onAuthenticated(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    const targetId = selectedDemoId || demoAccounts[0]?.id;
    if (!targetId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: UserDTO; sessionToken?: string }>('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ userId: targetId }),
      });
      if (res.sessionToken) setClientSessionToken(res.sessionToken);
      const user = await refreshUser();
      await refreshNotifications();
      if (user) onAuthenticated(user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6f4] dark:bg-[#0d1512] py-6 px-4">
      <StageTransition className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#b04a17]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Kabadiwala Connect</span>
        </button>

        <TiltCard3D
          maxTiltDeg={3}
          interactiveSafe
          className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 space-y-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('auth.title')}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{t('auth.subtitle')}</p>
            </div>
            <StampBadge3D icon={<UserCheck className="w-5 h-5" />} tone="copper" />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleDirectLogin} className="space-y-4">
            <div>
              <label htmlFor="phone-input" className="block text-sm font-medium mb-1.5">
                {t('auth.phoneLabel')}
              </label>
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512] overflow-hidden">
                <span className="px-3.5 py-3 text-sm font-mono font-semibold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-emerald-900/60">
                  +91
                </span>
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9845011111"
                  className="w-full px-3.5 py-3 bg-transparent font-mono text-base focus:outline-none"
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={isNewProfile}
                onChange={(e) => setIsNewProfile(e.target.checked)}
                className="w-4 h-4 accent-[#b04a17]"
              />
              <span>New user registration (specify name, role & locality)</span>
            </label>

            {isNewProfile && (
              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-emerald-950/60">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium mb-1">
                    {t('auth.nameLabel')}
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Poojary"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('COLLECTOR')}
                    className={`card-3d-hover min-h-[48px] p-3 rounded-xl border text-left text-sm font-semibold ${
                      role === 'COLLECTOR'
                        ? 'border-[#b04a17] bg-[#b04a17]/10 text-[#b04a17]'
                        : 'border-slate-200 dark:border-emerald-900/60'
                    }`}
                  >
                    {t('auth.roleCollector')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('RECYCLER')}
                    className={`card-3d-hover min-h-[48px] p-3 rounded-xl border text-left text-sm font-semibold ${
                      role === 'RECYCLER'
                        ? 'border-[#b04a17] bg-[#b04a17]/10 text-[#b04a17]'
                        : 'border-slate-200 dark:border-emerald-900/60'
                    }`}
                  >
                    {t('auth.roleRecycler')}
                  </button>
                </div>
                <div>
                  <label htmlFor="reg-area" className="block text-sm font-medium mb-1">
                    {t('auth.areaLabel')}
                  </label>
                  <select
                    id="reg-area"
                    value={areaIdx}
                    onChange={(e) => setAreaIdx(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#0d1512]"
                  >
                    {MANGALURU_AREAS.map((a, idx) => (
                      <option key={a.label} value={idx}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#b04a17]"
                required
              />
              <span>{t('auth.dpdpConsent')}</span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="btn-3d-copper w-full min-h-[48px] rounded-xl bg-[#b04a17] hover:bg-[#943b10] disabled:opacity-60 text-white font-semibold inline-flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>{submitting ? t('common.loading') : t('auth.signInBtn')}</span>
            </button>
          </form>

          {demoMode && demoAccounts.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-emerald-950/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-950 dark:text-amber-200">
                  <ShieldCheck className="w-4 h-4 text-[#b04a17]" />
                  <span>{t('auth.demoTitle')}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  1-click instant access
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <select
                  aria-label="Demo account"
                  value={selectedDemoId}
                  onChange={(e) => setSelectedDemoId(e.target.value)}
                  disabled={submitting}
                  className="flex-1 min-h-[46px] px-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-[#f8faf9] dark:bg-[#0d1512] text-sm font-medium"
                >
                  {demoAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.businessName || acc.name} ({acc.role} · {acc.areaLabel})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={submitting || !selectedDemoId}
                  onClick={handleDemoLogin}
                  className="btn-3d-emerald min-h-[46px] px-5 rounded-xl bg-[#14201a] dark:bg-emerald-700 hover:bg-[#1e3127] dark:hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{t('auth.demoBtn')}</span>
                </button>
              </div>
            </div>
          )}
        </TiltCard3D>
      </StageTransition>
    </div>
  );
};
