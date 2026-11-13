import type { ArenaData, MatchData } from '../types/silat';

interface TournamentIdentityBannerProps {
  arena: ArenaData;
  match?: MatchData;
  compact?: boolean;
}

export function TournamentIdentityBanner({ arena, match, compact = false }: TournamentIdentityBannerProps) {
  const details: string[] = [];
  if (arena.venue?.trim()) details.push(arena.venue.trim());
  if (arena.eventDate?.trim()) details.push(arena.eventDate.trim());
  if (match) {
    details.push(match.matchNumber, match.stage, match.weightClass);
  }

  return (
    <section
      aria-label="Identitas Kejuaraan"
      className={`rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 sm:gap-5 ${
        compact ? 'px-4 py-2.5' : 'px-4 sm:px-6 py-3'
      }`}
    >
      <div className="shrink-0 flex items-center justify-center">
        {arena.logoLeft ? (
          <img
            src={arena.logoLeft}
            alt="Logo Sisi Kiri"
            className={`${compact ? 'h-10 w-10' : 'h-12 w-12 sm:h-14 sm:w-14'} object-contain rounded-lg bg-slate-950/60 p-1 border border-slate-800`}
          />
        ) : null}
      </div>

      <div className="flex-1 min-w-0 text-center space-y-0.5">
        <div
          className={`font-display font-bold tracking-wider uppercase text-amber-400 truncate ${
            compact ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'
          }`}
        >
          {arena.tournamentName}
        </div>
        {details.length > 0 && (
          <div className="text-xs sm:text-sm text-slate-300 font-medium flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            {details.map((item, idx) => (
              <span key={`${item}-${idx}`} className="inline-flex items-center gap-2">
                {idx > 0 && <span aria-hidden="true" className="text-slate-600">&middot;</span>}
                <span>{item}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-center">
        {arena.logoRight ? (
          <img
            src={arena.logoRight}
            alt="Logo Sisi Kanan"
            className={`${compact ? 'h-10 w-10' : 'h-12 w-12 sm:h-14 sm:w-14'} object-contain rounded-lg bg-slate-950/60 p-1 border border-slate-800`}
          />
        ) : null}
      </div>
    </section>
  );
}
