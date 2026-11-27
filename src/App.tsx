import { useEffect, useState } from 'react';
import { ArenaProvider, useArena } from './context/ArenaContext';
import { LandingPage } from './components/LandingPage';
import { NationalLoginPortal } from './components/NationalLoginPortal';
import { SekretarisView } from './components/SekretarisView';
import { DewanView } from './components/DewanView';
import { TimerView } from './components/TimerView';
import { JuriView } from './components/JuriView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ScoreboardView } from './components/ScoreboardView';
import { useAutoFullscreen } from './hooks/useAutoFullscreen';
import { enterFullscreen, shouldAutoFullscreenView } from './utils/fullscreen';
import type { AppView } from './types/silat';

const VALID_VIEWS: AppView[] = ['landing', 'sekretaris', 'dewan', 'timer', 'juri', 'scoreboard'];

function parseViewFromLocation(): AppView {
  if (typeof window === 'undefined') return 'landing';

  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (VALID_VIEWS.includes(hash as AppView) && hash !== 'landing') {
    return hash as AppView;
  }

  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view')?.toLowerCase();
  if (viewParam && VALID_VIEWS.includes(viewParam as AppView)) {
    return viewParam as AppView;
  }
  if (params.get('autostart') === '1') {
    return 'dewan';
  }

  return 'landing';
}

function AppContent() {
  const { user, authReady, isStationGuest } = useArena();
  const [view, setView] = useState<AppView>(() => parseViewFromLocation());

  // Main server (Sekretaris) & unlinked root ALWAYS require Google login;
  // Station devices (Juri, Timer, Dewan, Monitor) connected via QR/HTTPS link can enter without Google login.
  const canAccessAsStationGuest = isStationGuest && view !== 'sekretaris';
  const hasEnteredPortal = authReady && (Boolean(user) || canAccessAsStationGuest);

  useAutoFullscreen(hasEnteredPortal && shouldAutoFullscreenView(view));

  useEffect(() => {
    const onHashChange = () => {
      setView(parseViewFromLocation());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (nextView: AppView) => {
    if (shouldAutoFullscreenView(nextView)) {
      void enterFullscreen();
    }
    setView(nextView);
    if (nextView === 'landing') {
      window.location.hash = '#/';
    } else {
      window.location.hash = `#/${nextView}`;
    }
  };

  if (!authReady) {
    return (
      <div
        data-testid="auth-loading-screen"
        className="min-h-screen w-full bg-gradient-to-br from-black via-[#17092e] to-[#3b0764] text-white flex items-center justify-center p-6 select-none"
      >
        <div className="rounded-2xl bg-[#0e0620]/85 border border-purple-500/40 px-6 py-4 text-xs sm:text-sm font-semibold text-blue-100 shadow-xl">
          Memeriksa sesi Akun Google...
        </div>
      </div>
    );
  }

  if (!hasEnteredPortal) {
    return (
      <>
        <NationalLoginPortal />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <>
      {view === 'landing' && <LandingPage onSelectView={navigate} />}
      {view === 'sekretaris' && <SekretarisView onNavigate={navigate} />}
      {view === 'dewan' && <DewanView onNavigate={navigate} />}
      {view === 'timer' && <TimerView onNavigate={navigate} />}
      {view === 'juri' && <JuriView onNavigate={navigate} />}
      {view === 'scoreboard' && <ScoreboardView onNavigate={navigate} />}
      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <ArenaProvider>
      <AppContent />
    </ArenaProvider>
  );
}

