import { MotionConfig } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { AdminWorkspace } from './components/AdminWorkspace.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { CollectorWorkspace } from './components/CollectorWorkspace.tsx';
import { HelpChatbot } from './components/HelpChatbot.tsx';
import { IntroSplash } from './components/IntroSplash.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { PublicReceiptPage } from './components/PublicReceiptPage.tsx';
import { RecyclerWorkspace } from './components/RecyclerWorkspace.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';

function getReceiptRouteId(): string | null {
  const match = window.location.pathname.match(/^\/r\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

const RouterView: React.FC = () => {
  const { user, loading } = useApp();
  const [view, setView] = useState<'landing' | 'auth' | 'receipt'>(() =>
    getReceiptRouteId() ? 'receipt' : 'landing'
  );
  const [showIntro, setShowIntro] = useState<boolean>(() => !getReceiptRouteId());
  const [authDefaultRole, setAuthDefaultRole] = useState<'COLLECTOR' | 'RECYCLER'>('COLLECTOR');
  const [receiptId, setReceiptId] = useState<string | null>(() => getReceiptRouteId());

  useEffect(() => {
    const onPop = () => {
      const rId = getReceiptRouteId();
      if (rId) {
        setReceiptId(rId);
        setView('receipt');
      } else {
        setReceiptId(null);
        setView('landing');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openReceipt = (id: string) => {
    window.history.pushState({}, '', `/r/${id}`);
    setReceiptId(id);
    setView('receipt');
  };

  const backFromReceipt = () => {
    window.history.pushState({}, '', '/');
    setReceiptId(null);
    setView('landing');
  };

  if (view === 'receipt' && receiptId) {
    return (
      <>
        <PublicReceiptPage receiptId={receiptId} onBack={backFromReceipt} />
        <HelpChatbot currentView="receipt" />
      </>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f6f4] dark:bg-[#0d1512] flex items-center justify-center p-6">
        <div className="text-sm font-mono text-slate-500">Loading Kabadiwala Connect...</div>
      </div>
    );
  }

  if (user) {
    return (
      <>
        {user.role === 'COLLECTOR' ? (
          <CollectorWorkspace onOpenReceipt={openReceipt} />
        ) : user.role === 'RECYCLER' ? (
          <RecyclerWorkspace onOpenReceipt={openReceipt} />
        ) : (
          <AdminWorkspace />
        )}
        <HelpChatbot currentView="workspace" />
      </>
    );
  }

  if (view === 'auth') {
    return (
      <>
        <AuthScreen
          defaultRole={authDefaultRole}
          onBack={() => setView('landing')}
          onAuthenticated={() => setView('landing')}
        />
        <HelpChatbot currentView="auth" />
      </>
    );
  }

  if (showIntro) {
    return <IntroSplash onComplete={() => setShowIntro(false)} />;
  }

  return (
    <>
      <LandingPage
        onOpenAuth={(role = 'COLLECTOR') => {
          setAuthDefaultRole(role);
          setView('auth');
        }}
        onOpenVerifySample={openReceipt}
        onReplayIntro={() => setShowIntro(true)}
      />
      <HelpChatbot currentView="landing" />
    </>
  );
};

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <RouterView />
      </AppProvider>
    </MotionConfig>
  );
}
