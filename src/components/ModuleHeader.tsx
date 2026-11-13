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
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => onNavigate('landing')}
        aria-label="Kembali ke Menu Utama"
        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Kembali</span>
      </button>

      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
      </button>
    </div>
  );
}
