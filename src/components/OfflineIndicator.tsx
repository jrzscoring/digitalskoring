import React, { useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useArena } from '../context/ArenaContext';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingSyncCount, retrySyncNow } = useArena();
  const [isRetrying, setIsRetrying] = useState(false);

  if (isOnline && pendingSyncCount === 0) {
    return null;
  }

  const handleRetry = async () => {
    if (!isOnline || isRetrying) return;
    setIsRetrying(true);
    try {
      await retrySyncNow();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-cache-banner"
      className={`fixed bottom-3 left-3 z-50 flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-2xl backdrop-blur-md transition-colors ${
        !isOnline
          ? 'bg-amber-950/95 border-amber-400/75 text-amber-100'
          : 'bg-blue-950/95 border-sky-400/75 text-sky-100'
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
          <span>
            Mode Offline Aktif &mdash; Skor &amp; timer tersimpan di cache lokal
            {pendingSyncCount > 0 ? ` (${pendingSyncCount} antrean sync)` : ''}
          </span>
        </>
      ) : (
        <>
          <RefreshCw
            className={`w-4 h-4 text-sky-300 shrink-0 ${isRetrying ? 'animate-spin' : ''}`}
          />
          <span>Menyinkronkan {pendingSyncCount} perubahan offline...</span>
          <button
            type="button"
            disabled={isRetrying}
            onClick={() => void handleRetry()}
            className="ml-1 px-2 py-0.5 rounded-md bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold cursor-pointer disabled:opacity-50"
          >
            Sync
          </button>
        </>
      )}
    </div>
  );
};
