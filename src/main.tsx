import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    if (sessionStorage.getItem('kc_sw_reloaded') === '1') return;
    refreshing = true;
    sessionStorage.setItem('kc_sw_reloaded', '1');
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(<App />);
