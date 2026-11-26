import { AlertCircle, LogIn, Maximize2, Minimize2, X } from 'lucide-react';
import jrzScoreLogo from '@/jrzscoreutama.png';
import { useArena } from '../context/ArenaContext';
import { useFullscreenState } from '../hooks/useAutoFullscreen';

export function NationalLoginPortal() {
  const { signInGoogle, authLoading, authError, clearAuthError } = useArena();
  const { isFullscreen, toggleFullscreen } = useFullscreenState();

  const marqueeText =
    'Selamat datang di Sistem Digital Skoring JRZ SCORE. Menjunjung tinggi sportivitas, transparansi, dan akurasi penilaian secara real-time | untuk info lebih lanjut hubungi Whatsapp : 0813 7987 6424';

  const handleGoogleLogin = () => {
    clearAuthError();
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    void signInGoogle();
  };

  return (
    <div
      data-testid="national-login-portal"
      className="min-h-screen w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col items-center justify-center px-4 pt-8 pb-16 relative overflow-hidden select-none caret-transparent"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.22),transparent_58%),radial-gradient(ellipse_at_bottom_left,rgba(37,99,235,0.18),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(250,204,21,0.10),transparent_52%)]"
      />

      {/* Full-width adaptive JRZ Score watermark */}
      <div
        aria-hidden="true"
        data-testid="portal-watermark"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
      >
        <img
          src={jrzScoreLogo}
          alt=""
          className="w-[94vw] sm:w-[88vw] lg:w-[80vw] h-auto object-contain opacity-[0.09] -rotate-6 drop-shadow-[0_0_48px_rgba(168,85,247,0.35)] transition-all duration-700"
        />
      </div>

      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? 'Keluar Full Screen' : 'Layar Penuh'}
        title={isFullscreen ? 'Keluar Full Screen' : 'Layar Penuh'}
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/15 hover:border-yellow-400/70 text-blue-100 hover:text-yellow-300 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4" />
        ) : (
          <Maximize2 className="w-4 h-4" />
        )}
      </button>

      <main className="relative z-10 w-full flex items-center justify-center">
        <section
          data-testid="google-event-login-card"
          className="w-full max-w-[360px] mx-auto rounded-2xl bg-[#0e0620]/85 backdrop-blur-md border border-purple-500/40 p-6 sm:p-7 shadow-2xl space-y-5"
        >
          <h1 className="sr-only">Login JRZ Score</h1>

          <div className="flex items-center justify-center">
            <img
              src={jrzScoreLogo}
              alt="JRZ Score"
              className="w-40 sm:w-44 h-auto object-contain select-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.72)]"
            />
          </div>

          {authError && (
            <div
              role="alert"
              data-testid="portal-auth-error"
              className="rounded-xl bg-rose-950/85 border border-rose-400/70 px-3.5 py-2.5 text-xs text-rose-100 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{authError}</span>
              <button
                type="button"
                onClick={clearAuthError}
                aria-label="Tutup pesan error login"
                className="p-0.5 text-rose-200 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            data-testid="portal-google-login-btn"
            disabled={authLoading}
            onClick={handleGoogleLogin}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:scale-[0.99] disabled:opacity-60 text-black font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap shadow-lg cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>
              {authLoading ? 'Menghubungkan Google...' : 'Masuk dengan Akun Google'}
            </span>
          </button>
        </section>
      </main>

      {/* Bottom Seamless Yellow Running Text */}
      <div
        data-testid="portal-running-text-bar"
        className="fixed bottom-0 inset-x-0 z-20 w-full overflow-hidden bg-black/75 border-t border-yellow-400/35 backdrop-blur-sm py-2.5 select-none pointer-events-none"
      >
        <div
          data-testid="portal-running-track"
          className="animate-portal-marquee-track text-xs sm:text-sm font-semibold tracking-wide text-yellow-300"
        >
          <div className="flex shrink-0 items-center">
            <span data-testid="portal-running-text" className="whitespace-nowrap pr-12">
              {marqueeText}
            </span>
            <span aria-hidden="true" className="whitespace-nowrap pr-12">
              {marqueeText}
            </span>
          </div>
          <div aria-hidden="true" className="flex shrink-0 items-center">
            <span className="whitespace-nowrap pr-12">{marqueeText}</span>
            <span className="whitespace-nowrap pr-12">{marqueeText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
