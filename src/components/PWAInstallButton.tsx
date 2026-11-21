import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-500/50 hover:border-yellow-400 px-3.5 py-2 text-xs font-bold text-white shadow-lg cursor-pointer transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
        <span>Install Aplikasi Offline</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-500/50 hover:border-yellow-400 px-3.5 py-2 text-xs font-bold text-white shadow-lg cursor-pointer transition-colors"
        >
          <Share className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
          <span>Install di iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Panduan Install di iPhone / iPad"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#120726] border border-purple-500/60 p-5 shadow-2xl space-y-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-yellow-300">
                  Install di iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Tutup panduan"
                  className="p-1 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-blue-100 leading-relaxed">
                1. Tekan tombol <strong className="text-yellow-300">Share</strong> pada bilah Safari.
                <br />
                2. Gulir ke bawah lalu pilih{' '}
                <strong className="text-yellow-300">Add to Home Screen</strong> agar sistem skoring tetap siap pakai saat offline.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[38px] rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold cursor-pointer transition-colors"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
