import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const ACTIVE_STORAGE_PREFIXES = [
  'silat_ipsi2026_',
  'silat_offline_backup_v1_',
  'silat_offline_sync_lock_v1_',
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

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      }).catch(() => {});
    }
    if ('caches' in window) {
      window.caches.keys().then((cacheNames) => {
        for (const name of cacheNames) {
          void window.caches.delete(name);
        }
      }).catch(() => {});
    }
  } catch {
    // Ignore service worker/cache cleanup errors
  }
}

purgeLegacyBrowserData();

createRoot(document.getElementById('root')!).render(<App />);

