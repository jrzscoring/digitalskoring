import { ArrowLeft, Cloud, CloudOff, LogOut } from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';

interface ModuleHeaderProps {
  currentView: Exclude<AppView, 'landing'>;
  onNavigate: (view: AppView) => void;
}

const NAV_LINKS: { id: Exclude<AppView, 'landing'>; label: string }[] = [
  { id: 'sekretaris', label: 'Sekretaris' },
  { id: 'dewan', label: 'Dewan' },
  { id: 'timer', label: 'Timer' },
  { id: 'juri', label: 'Juri' },
  { id: 'scoreboard', label: 'Scoreboard' },
];

export function ModuleHeader({ currentView, onNavigate }: ModuleHeaderProps) {
  const { mode, rtdbConnected, rtdbProjectId, user, signInGoogle, signOutGoogle, arena } = useArena();

  return (
    <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            aria-label="Kembali ke Menu Utama"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-display text-xl font-bold tracking-wide text-white whitespace-nowrap">
            {arena.name}
          </span>
        </div>

        <nav aria-label="Navigasi Peran" className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_LINKS.map((item) => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-amber-400 text-amber-300 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {mode === 'firebase' && user ? (
            <button
              type="button"
              onClick={() => void signOutGoogle()}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60 text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[140px] truncate">{user.email}</span>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          ) : rtdbConnected ? (
            <span className="min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-xs font-semibold flex items-center gap-2 whitespace-nowrap">
              <Cloud className="w-3.5 h-3.5" />
              <span>Firebase RTDB{rtdbProjectId ? ` · ${rtdbProjectId}` : ''}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void signInGoogle()}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span>Hubungkan Firebase</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile role switcher strip */}
      <nav aria-label="Menu Peran Mobile" className="flex md:hidden items-center gap-1 px-3 py-1.5 border-t border-slate-800/80 overflow-x-auto">
        {NAV_LINKS.map((item) => {
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
