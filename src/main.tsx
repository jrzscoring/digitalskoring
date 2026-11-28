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
  let activeRegistration: ServiceWorkerRegistration | undefined;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForSw) return;
    hasReloadedForSw = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      activeRegistration = registration;
      if (registration) {
        void registration.update();
      }
    },
    onRegisterError() {
      // Tetap beroperasi normal menggunakan localStorage backup jika SW diblokir di lingkungan tertentu
    },
  });

  if (import.meta.env.PROD) {
    let checkingFreshBuild = false;
    const checkForFreshBuild = async () => {
      if (checkingFreshBuild || !navigator.onLine) return;
      checkingFreshBuild = true;
      try {
        const currentScript = Array.from(document.querySelectorAll('script[type="module"][src]'))
          .map((el) => el.getAttribute('src') || '')
          .find((src) => /assets\/index-[a-zA-Z0-9_-]+\.js/.test(src));
        const currentBundle = currentScript?.match(/assets\/index-[a-zA-Z0-9_-]+\.js/)?.[0];
        if (!currentBundle) return;

        const res = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const latestBundle = html.match(/assets\/index-[a-zA-Z0-9_-]+\.js/)?.[0];
        if (!latestBundle || latestBundle === currentBundle) return;

        try {
          if (window.sessionStorage.getItem('jrz_build_reload') === latestBundle) return;
          window.sessionStorage.setItem('jrz_build_reload', latestBundle);
        } catch {
          // Ignore sessionStorage restriction
        }

        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((key) => window.caches.delete(key)));
        }
        await activeRegistration?.update();
        window.location.reload();
      } catch {
        // Ignore network errors while offline
      } finally {
        checkingFreshBuild = false;
      }
    };

    void checkForFreshBuild();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void checkForFreshBuild();
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);


