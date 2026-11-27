import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const ACTIVE_STORAGE_PREFIXES = [
  'silat_ipsi2026_',
  'silat_offline_backup_v1_',
  'silat_offline_sync_lock_v1_',
  'silat_portal_access_mode_v1',
  'firebase:',
];

const LEGACY_STORAGE_PREFIXES = [
  'jrz_',
  'ipsi_',
  'rtdb_',
  'satria_',
  'dojo_',
  'silat_',
];

function purgeLegacyBrowserData(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (ACTIVE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        continue;
      }
      if (LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

purgeLegacyBrowserData();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let hasReloadedForSw = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForSw) return;
    hasReloadedForSw = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        void registration.update();
      }
    },
    onRegisterError() {
      // Tetap beroperasi normal menggunakan localStorage backup jika SW diblokir di lingkungan tertentu
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);


