import { useEffect, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import type { AppView } from '../types/silat';

interface ModuleHeaderProps {
  currentView?: Exclude<AppView, 'landing'>;
  onNavigate: (view: AppView) => void;
}

export function ModuleHeader({ onNavigate }: ModuleHeaderProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen denial in sandbox/headless environments
    }
  };

  return (
    <div
      className={`w-full mx-auto flex items-center justify-between gap-3 ${
        isFullscreen ? 'max-w-none px-2.5 pt-2' : 'max-w-7xl px-4 sm:px-6 pt-3'
      }`}
    >
      <button
        type="button"
        onClick={() => onNavigate('landing')}
        aria-label="Kembali ke Menu Utama"
        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
      >
        <ArrowLeft className="w-4 h-4 text-yellow-300" />
        <span>Kembali</span>
      </button>

      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4 text-yellow-300" />
        ) : (
          <Maximize2 className="w-4 h-4 text-yellow-300" />
        )}
        <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
      </button>
    </div>
  );
}
