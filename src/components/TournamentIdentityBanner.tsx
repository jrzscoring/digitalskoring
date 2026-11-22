import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useFullscreenState } from '../hooks/useAutoFullscreen';
import type { ArenaData, MatchData } from '../types/silat';

interface TournamentIdentityBannerProps {
  arena: ArenaData;
  match?: MatchData;
  compact?: boolean;
  hideEventDetails?: boolean;
  onBack?: () => void;
  showFullscreen?: boolean;
  leftBadge?: React.ReactNode;
  rightBadge?: React.ReactNode;
}

export function TournamentIdentityBanner({
  arena,
  match,
  compact = false,
  hideEventDetails = false,
  onBack,
  showFullscreen = false,
  leftBadge,
  rightBadge,
}: TournamentIdentityBannerProps) {
  const { isFullscreen, toggleFullscreen } = useFullscreenState();

  const details: string[] = [];
  if (!hideEventDetails) {
    if (arena.venue?.trim()) details.push(arena.venue.trim());
    if (arena.eventDate?.trim()) details.push(arena.eventDate.trim());
  }
  if (match) {
    details.push(match.matchNumber, match.stage, match.weightClass);
  }

  const hasSideBadges = Boolean(leftBadge || rightBadge);

  return (
    <section
      aria-label="Identitas Kejuaraan"
      className={`rounded-2xl bg-gradient-to-r from-[#0d051a]/95 via-[#16092e]/95 to-[#0d051a]/95 border border-purple-700/50 grid items-center gap-2.5 sm:gap-5 ${
        hasSideBadges
          ? 'grid-cols-[auto_auto] justify-between sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:justify-stretch'
          : 'grid-cols-[auto_minmax(0,1fr)_auto]'
      } ${compact ? 'px-3 sm:px-4 py-2.5' : 'px-4 sm:px-6 py-3'}`}
    >
      <div className="shrink-0 flex items-center justify-start gap-2 sm:gap-2.5">
        {onBack && (
          <button
            type="button"
            data-fullscreen-ignore="true"
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
        {leftBadge}
      </div>

      <div
        className={`min-w-0 text-center space-y-0.5 flex flex-col justify-center ${
          hasSideBadges ? 'col-span-2 sm:col-span-1 order-last sm:order-none' : ''
        }`}
      >
        <div
          className={`font-display font-bold tracking-wider uppercase text-yellow-300 ${
            compact
              ? 'text-sm sm:text-lg truncate'
              : details.length === 0
              ? 'text-xl sm:text-2xl md:text-3xl lg:text-4xl leading-tight line-clamp-2'
              : 'text-lg sm:text-2xl truncate'
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

      <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-2.5">
        {rightBadge}
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
            data-fullscreen-ignore="true"
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
