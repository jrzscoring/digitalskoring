import { ClipboardList, Gavel, Monitor, ShieldCheck, Timer } from 'lucide-react';
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
    <main className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(29,78,216,0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(220,38,38,0.12),transparent_50%)]"
      />

      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-12">
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-center text-white text-balance">
          Skoring Pencak Silat Tanding
        </h1>

        <nav aria-label="Menu Utama" className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView(id)}
              className="group min-h-[112px] sm:min-h-[140px] px-6 py-6 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/70 hover:bg-slate-800/90 active:scale-[0.98] transition-all duration-150 flex flex-col items-center justify-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            >
              <Icon className="w-8 h-8 text-amber-400 group-hover:scale-110 transition-transform duration-150" />
              <span className="font-display text-2xl font-bold tracking-wide text-white whitespace-nowrap">
                {label}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}
