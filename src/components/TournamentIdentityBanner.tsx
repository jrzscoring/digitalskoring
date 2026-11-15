import { useEffect, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import type { ArenaData, MatchData } from '../types/silat';

interface TournamentIdentityBannerProps {
  arena: ArenaData;
  match?: MatchData;
  compact?: boolean;
  onBack?: () => void;
  showFullscreen?: boolean;
}

export function TournamentIdentityBanner({
  arena,
  match,
  compact = false,
  onBack,
  showFullscreen = false,
}: TournamentIdentityBannerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!showFullscreen) return;
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [showFullscreen]);

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

  const details: string[] = [];
  if (arena.venue?.trim()) details.push(arena.venue.trim());
  if (arena.eventDate?.trim()) details.push(arena.eventDate.trim());
  if (match) {
    details.push(match.matchNumber, match.stage, match.weightClass);
  }

  return (
    <section
      aria-label="Identitas Kejuaraan"
      className={`rounded-2xl bg-gradient-to-r from-[#0d051a]/95 via-[#16092e]/95 to-[#0d051a]/95 border border-purple-700/50 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-5 ${
        compact ? 'px-3 sm:px-4 py-2.5' : 'px-4 sm:px-6 py-3'
      }`}
    >
      <div className="shrink-0 flex items-center justify-start gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali ke Menu Utama"
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-yellow-300 shrink-0" />
            <span>Kembali</span>
          </button>
        )}
        {arena.logoLeft ? (
          <img
            src={arena.logoLeft}
            alt="Logo Sisi Kiri"
            className={`${compact ? 'h-10 w-10' : 'h-12 w-12 sm:h-14 sm:w-14'} object-contain rounded-lg bg-black/60 p-1 border border-blue-500/40`}
          />
        ) : null}
      </div>

      <div className="min-w-0 text-center space-y-0.5">
        <div
          className={`font-display font-bold tracking-wider uppercase text-yellow-300 truncate ${
            compact ? 'text-sm sm:text-lg' : 'text-lg sm:text-2xl'
          }`}
        >
          {arena.tournamentName}
        </div>
        {details.length > 0 && (
          <div className="text-xs sm:text-sm text-blue-200 font-medium flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            {details.map((item, idx) => (
              <span key={`${item}-${idx}`} className="inline-flex items-center gap-2">
                {idx > 0 && <span aria-hidden="true" className="text-yellow-400/70">&middot;</span>}
                <span className="text-white/95">{item}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2.5">
        {arena.logoRight ? (
          <img
            src={arena.logoRight}
            alt="Logo Sisi Kanan"
            className={`${compact ? 'h-10 w-10' : 'h-12 w-12 sm:h-14 sm:w-14'} object-contain rounded-lg bg-black/60 p-1 border border-blue-500/40`}
          />
        ) : null}
        {showFullscreen && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-blue-500/45 bg-blue-950/75 hover:bg-blue-900/85 hover:border-yellow-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap opacity-10 hover:opacity-100 focus-visible:opacity-100 transition-all"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-yellow-300 shrink-0" />
            ) : (
              <Maximize2 className="w-4 h-4 text-yellow-300 shrink-0" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
          </button>
        )}
      </div>
    </section>
  );
}
