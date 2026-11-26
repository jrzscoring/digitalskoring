import { ArrowLeft, Maximize2, RotateCw, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LandscapeOrientationGuardProps {
  panelLabel: string;
  onBack?: () => void;
}

function detectPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerHeight > 0 && window.innerWidth > 0) {
    return window.innerHeight > window.innerWidth;
  }
  return window.matchMedia?.('(orientation: portrait)').matches ?? false;
}

export function LandscapeOrientationGuard({
  panelLabel,
  onBack,
}: LandscapeOrientationGuardProps) {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => detectPortrait());
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateOrientation = () => {
      const portrait = detectPortrait();
      setIsPortrait(portrait);
      if (!portrait) {
        setLockMessage(null);
      }
    };

    updateOrientation();

    const mql = window.matchMedia?.('(orientation: portrait)');
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    mql?.addEventListener?.('change', updateOrientation);
    window.screen?.orientation?.addEventListener?.('change', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      mql?.removeEventListener?.('change', updateOrientation);
      window.screen?.orientation?.removeEventListener?.('change', updateOrientation);
    };
  }, []);

  const handleTryForceLandscape = async () => {
    setLockMessage(null);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const orientationApi = window.screen?.orientation as
        | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
        | undefined;
      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
        setIsPortrait(detectPortrait());
        return;
      }
      setLockMessage('Putar perangkat Anda secara fisik ke posisi mendatar (Landscape).');
    } catch {
      setLockMessage('Browser memerlukan rotasi perangkat secara manual ke posisi Landscape.');
    }
  };

  if (!isPortrait) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="landscape-guard-title"
      data-testid="landscape-orientation-guard"
      className="fixed inset-0 z-[70] bg-[#06020e]/96 backdrop-blur-md flex items-center justify-center p-5 text-white select-none"
    >
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#17092e] via-[#0e051d] to-black border-2 border-yellow-400/75 shadow-[0_0_50px_rgba(250,204,21,0.22)] p-6 sm:p-7 text-center space-y-5">
        <div className="relative mx-auto w-24 h-24 rounded-2xl bg-purple-950/70 border border-purple-400/50 flex items-center justify-center">
          <Smartphone className="w-11 h-11 text-blue-200 -rotate-90 transition-transform duration-500" />
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center shadow-lg">
            <RotateCw className="w-4 h-4 animate-spin" style={{ animationDuration: '4s' }} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-yellow-300">
            Orientasi Layar Terkunci Landscape
          </div>
          <h2
            id="landscape-guard-title"
            className="font-display text-2xl font-black uppercase tracking-wide text-white leading-tight"
          >
            Putar Perangkat ke Mode Landscape
          </h2>
          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
            <strong className="text-yellow-300">{panelLabel}</strong> wajib menggunakan posisi
            mendatar (Landscape) agar tombol penilaian dan tampilan waktu tampil maksimal dan responsif.
          </p>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={() => void handleTryForceLandscape()}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Maximize2 className="w-4 h-4 shrink-0" />
            <span>Putar &amp; Fullscreen Landscape</span>
          </button>

          {lockMessage && (
            <p className="text-[11px] text-amber-300 font-medium leading-snug">
              {lockMessage}
            </p>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-blue-950/75 hover:bg-blue-900 border border-blue-500/45 text-xs font-semibold text-blue-100 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-yellow-300 shrink-0" />
              <span>Kembali ke Menu Utama</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
