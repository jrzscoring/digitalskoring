import { ClipboardList, Gavel, Monitor, ShieldCheck, Timer } from 'lucide-react';
import jrzScoreLogo from '@/jrzscoreutama.png';
import type { AppView } from '../types/silat';

interface LandingPageProps {
  onSelectView: (view: AppView) => void;
}

const MENU_ITEMS: { id: Exclude<AppView, 'landing'>; label: string; icon: typeof ClipboardList }[] = [
  { id: 'sekretaris', label: 'Sekretaris', icon: ClipboardList },
  { id: 'dewan', label: 'Dewan', icon: Gavel },
  { id: 'timer', label: 'Timer', icon: Timer },
  { id: 'juri', label: 'Juri', icon: ShieldCheck },
  { id: 'scoreboard', label: 'Scoreboard', icon: Monitor },
];

export function LandingPage({ onSelectView }: LandingPageProps) {
  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex flex-col items-center justify-center px-6 py-8 sm:py-10 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.22),transparent_58%),radial-gradient(ellipse_at_bottom_left,rgba(37,99,235,0.20),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(250,204,21,0.12),transparent_52%)]"
      />

      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-6 sm:gap-8">
        <h1 className="sr-only">JRZ Score - Realtime Digital Scoring for True Fighters</h1>

        <div className="relative flex items-center justify-center -my-6 sm:-my-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-6 rounded-full bg-[radial-gradient(circle_at_35%_48%,rgba(59,130,246,0.28),transparent_55%),radial-gradient(circle_at_65%_48%,rgba(239,68,68,0.24),transparent_55%)] blur-2xl"
          />
          <img
            src={jrzScoreLogo}
            alt="JRZ Score — Realtime Digital Scoring for True Fighters"
            className="relative z-10 w-[260px] sm:w-[340px] md:w-[400px] h-auto object-contain select-none drop-shadow-[0_14px_34px_rgba(0,0,0,0.78)] transition-transform duration-300 ease-out hover:scale-[1.02]"
          />
        </div>

        <nav aria-label="Menu Utama" className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView(id)}
              className="group min-h-[112px] sm:min-h-[140px] px-6 py-6 rounded-2xl bg-gradient-to-b from-blue-950/85 via-[#130829]/95 to-black/95 border border-blue-500/45 hover:border-yellow-400 hover:from-blue-900/90 hover:to-[#230847]/95 active:scale-[0.98] transition-all duration-150 flex flex-col items-center justify-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 cursor-pointer shadow-lg shadow-black/50"
            >
              <Icon className="w-8 h-8 text-yellow-400 group-hover:text-yellow-300 group-hover:scale-110 transition-transform duration-150" />
              <span className="font-display text-2xl font-bold tracking-wide text-white group-hover:text-yellow-300 whitespace-nowrap transition-colors">
                {label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
