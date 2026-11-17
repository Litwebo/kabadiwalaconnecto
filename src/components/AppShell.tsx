import { Bell, Download, LogOut, Moon, Sun, WifiOff, X } from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall.ts';
import { apiFetch } from '../lib/api.ts';
import { EPR_DISCLAIMER, formatDateTimeIN } from '../shared/format.ts';
import type { LanguageCode } from '../shared/types.ts';

export interface NavTab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface AppShellProps {
  tabs: NavTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  children,
}) => {
  const { user, notifications, refreshNotifications, language, setLanguage, theme, toggleTheme, logout, t } =
    useApp();
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [notifOpen, setNotifOpen] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await refreshNotifications();
  };

  return (
    <div className="min-h-screen bg-[#f3f6f4] text-[#14201a] dark:bg-[#0d1512] dark:text-[#ecf2ee] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 justify-between sticky top-0 h-screen">
        <div className="space-y-6">
          <div>
            <div className="text-lg font-bold tracking-tight text-[#14201a] dark:text-[#ecf2ee]">
              {t('brand')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {user?.name} · {user?.role}
            </div>
          </div>

          <nav className="space-y-1" aria-label="Workspace navigation">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'btn-3d-copper bg-[#b04a17] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1b2923] hover:translate-x-0.5'
                  }`}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-emerald-950/60">
          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={install}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#b04a17] text-[#b04a17] text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{t('common.installApp')}</span>
            </button>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#0d1512] p-0.5">
              {(['en', 'hi', 'kn'] as LanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`px-2 py-1 rounded-md text-xs font-semibold ${
                    language === code ? 'bg-[#b04a17] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-emerald-900/60 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900/60 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1b2923] flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Bar (Mobile + Desktop utility) */}
        <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-emerald-950/60 bg-white/90 dark:bg-[#15201b]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 lg:hidden">
            <span className="font-bold text-base tracking-tight truncate">{t('brand')}</span>
          </div>
          <div className="hidden lg:block text-sm text-slate-600 dark:text-slate-300 truncate">
            {user?.areaLabel}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex lg:hidden rounded-lg bg-slate-100 dark:bg-[#0d1512] p-0.5">
              {(['en', 'hi', 'kn'] as LanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`min-h-[32px] px-2 rounded-md text-[11px] font-semibold ${
                    language === code ? 'bg-[#b04a17] text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {code === 'en' ? 'EN' : code === 'hi' ? 'हिं' : 'ಕ'}
                </button>
              ))}
            </div>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="lg:hidden min-h-[36px] px-2.5 rounded-lg bg-[#b04a17] text-white text-xs font-semibold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setIosGuideOpen(true)}
                className="lg:hidden min-h-[36px] px-2.5 rounded-lg border border-slate-300 text-xs font-semibold"
              >
                Install
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="lg:hidden min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-emerald-900/60 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Open notifications"
              className="relative min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-emerald-900/60 flex items-center justify-center"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#b04a17] text-white text-[10px] font-mono font-bold flex items-center justify-center px-1">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              aria-label={t('common.logout')}
              title={t('common.logout')}
              className="lg:hidden min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-emerald-900/60 flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {!isOnline && (
          <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>{t('common.offline')}</span>
          </div>
        )}

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 pb-24 lg:pb-8">
          {children}
          <footer className="mt-10 pt-4 border-t border-slate-200 dark:border-emerald-950/60 text-xs text-slate-500 dark:text-slate-400">
            {EPR_DISCLAIMER}
          </footer>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (natural thumb zone, <= 15% height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-emerald-950/60 bg-white/95 dark:bg-[#15201b]/95 backdrop-blur-md pb-safe"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition-all ${
                  active ? 'text-[#b04a17] -translate-y-0.5' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className={active ? 'scale-110 transition-transform' : 'transition-transform'}>
                  {tab.icon}
                </span>
                <span className="truncate max-w-full">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Notification Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-sm bg-white dark:bg-[#15201b] h-full p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Notifications</h2>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                aria-label="Close notifications"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-[#1b2923]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-[#b04a17] self-start underline"
              >
                Mark all as read
              </button>
            )}
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3 text-xs space-y-1 ${
                      n.readAt
                        ? 'border-slate-200 dark:border-emerald-950/60 opacity-75'
                        : 'border-[#b04a17]/50 bg-[#b04a17]/5'
                    }`}
                  >
                    <div className="font-mono font-bold text-[#b04a17]">{n.type}</div>
                    <div className="text-slate-700 dark:text-slate-200">
                      {JSON.stringify(n.payload)}
                    </div>
                    <div className="text-[11px] text-slate-500">{formatDateTimeIN(n.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {iosGuideOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-[#15201b] p-6 space-y-4">
            <h3 className="text-lg font-bold">Install Kabadiwala Connect</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              1. Tap Share in Safari. 2. Tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#b04a17] text-white font-semibold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
