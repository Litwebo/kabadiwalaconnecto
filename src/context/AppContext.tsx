import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { tFor } from '../i18n/messages.ts';
import { apiFetch, setClientSessionToken } from '../lib/api.ts';
import { testFirestoreConnection } from '../lib/firebase.ts';
import type { CategoryDTO, LanguageCode, NotificationDTO, UserDTO } from '../shared/types.ts';

interface AppContextValue {
  user: UserDTO | null;
  loading: boolean;
  demoMode: boolean;
  categories: CategoryDTO[];
  notifications: NotificationDTO[];
  language: LanguageCode;
  theme: 'light' | 'dark';
  setLanguage: (lang: LanguageCode) => void;
  toggleTheme: () => void;
  t: (key: string) => string;
  refreshUser: () => Promise<UserDTO | null>;
  refreshCategories: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('kc_lang');
    return saved === 'hi' || saved === 'kn' ? saved : 'en';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('kc_theme') === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('kc_theme', theme);
  }, [theme]);

  const setLanguage = useCallback(
    (lang: LanguageCode) => {
      setLanguageState(lang);
      localStorage.setItem('kc_lang', lang);
      if (user) {
        apiFetch('/api/me', {
          method: 'PATCH',
          body: JSON.stringify({ language: lang }),
        }).catch(() => undefined);
      }
    },
    [user]
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const t = useCallback((key: string) => tFor(language, key), [language]);

  const refreshCategories = useCallback(async () => {
    try {
      const data = await apiFetch<{ categories: CategoryDTO[] }>('/api/categories');
      setCategories(data.categories);
    } catch {
      // ignore offline
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationDTO[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      setNotifications([]);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<UserDTO | null> => {
    try {
      const data = await apiFetch<{ user: UserDTO | null }>('/api/auth/session');
      setUser(data.user);
      if (data.user?.language) {
        setLanguageState(data.user.language);
        localStorage.setItem('kc_lang', data.user.language);
      }
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setClientSessionToken(null);
    setUser(null);
    setNotifications([]);
  }, []);

  useEffect(() => {
    testFirestoreConnection();
    (async () => {
      try {
        const health = await apiFetch<{ ok: boolean; demoMode: boolean }>('/api/health');
        setDemoMode(Boolean(health.demoMode));
      } catch {
        setDemoMode(false);
      }
      await refreshCategories();
      const me = await refreshUser();
      if (me) {
        await refreshNotifications();
      }
      setLoading(false);
    })();
  }, [refreshCategories, refreshNotifications, refreshUser]);

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        demoMode,
        categories,
        notifications,
        language,
        theme,
        setLanguage,
        toggleTheme,
        t,
        refreshUser,
        refreshCategories,
        refreshNotifications,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
