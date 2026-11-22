import { useEffect, useState } from 'react';
import { ArenaProvider } from './context/ArenaContext';
import { LandingPage } from './components/LandingPage';
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

export default function App() {
  const [view, setView] = useState<AppView>(() => parseViewFromLocation());

  useAutoFullscreen(shouldAutoFullscreenView(view));

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

  return (
    <ArenaProvider>
      {view === 'landing' && <LandingPage onSelectView={navigate} />}
      {view === 'sekretaris' && <SekretarisView onNavigate={navigate} />}
      {view === 'dewan' && <DewanView onNavigate={navigate} />}
      {view === 'timer' && <TimerView onNavigate={navigate} />}
      {view === 'juri' && <JuriView onNavigate={navigate} />}
      {view === 'scoreboard' && <ScoreboardView onNavigate={navigate} />}
      <OfflineIndicator />
    </ArenaProvider>
  );
}

