import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  QrCode,
  Smartphone,
  X,
} from 'lucide-react';
import {
  buildEventShareUrl,
  buildStationShareUrl,
  type StationShareView,
} from '../utils/authSession';

export type StationShareTab = 'all' | StationShareView;

interface StationSharePanelProps {
  arenaId: string;
  arenaName?: string;
  compact?: boolean;
  onOpenScanner?: () => void;
}

interface ShareTabMeta {
  id: StationShareTab;
  label: string;
  title: string;
  subtitle: string;
  badgeClass: string;
}

const SHARE_TABS: ShareTabMeta[] = [
  {
    id: 'all',
    label: 'Semua Perangkat',
    title: 'QR Utama Event (Juri, Dewan, Timer & Monitor)',
    subtitle:
      'Satu QR Barcode praktis untuk semua tablet/HP. Cukup scan lalu pilih panel tugas tanpa harus login Google.',
    badgeClass: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
  },
  {
    id: 'juri',
    label: 'Juri',
    title: 'QR Khusus Panel Juri',
    subtitle: 'Langsung membuka panel Juri (Pukulan, Tendangan & Jurus TGRS) tersinkron real-time.',
    badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/45',
  },
  {
    id: 'dewan',
    label: 'Dewan',
    title: 'QR Khusus Panel Dewan',
    subtitle: 'Langsung membuka panel Dewan Pertandingan (Hukuman, Verifikasi & Keputusan).',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/45',
  },
  {
    id: 'timer',
    label: 'Timer',
    title: 'QR Khusus Panel Timer',
    subtitle: 'Langsung membuka kendali Timer Arena (Babak Tanding, Istirahat & Penampil Jurus).',
    badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/45',
  },
  {
    id: 'scoreboard',
    label: 'Monitor',
    title: 'QR Khusus Monitor LED',
    subtitle: 'Langsung membuka layar Scoreboard publik dengan skor & jadwal partai real-time.',
    badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/45',
  },
];

export function StationSharePanel({
  arenaId,
  arenaName,
  compact = false,
  onOpenScanner,
}: StationSharePanelProps) {
  const [selectedTab, setSelectedTab] = useState<StationShareTab>('all');
  const [qrImages, setQrImages] = useState<Partial<Record<StationShareTab, string>>>({});
  const [copiedTab, setCopiedTab] = useState<StationShareTab | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  const shareUrls = useMemo<Record<StationShareTab, string>>(
    () => ({
      all: buildEventShareUrl(arenaId),
      juri: buildStationShareUrl(arenaId, 'juri'),
      timer: buildStationShareUrl(arenaId, 'timer'),
      dewan: buildStationShareUrl(arenaId, 'dewan'),
      scoreboard: buildStationShareUrl(arenaId, 'scoreboard'),
    }),
    [arenaId]
  );

  useEffect(() => {
    let cancelled = false;
    const activeUrl = shareUrls[selectedTab];
    void QRCode.toDataURL(activeUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f0620',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrImages((prev) => ({ ...prev, [selectedTab]: dataUrl }));
        }
      })
      .catch(() => {
        // ignore QR generation failure
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrls, selectedTab]);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomOpen]);

  const activeMeta = SHARE_TABS.find((t) => t.id === selectedTab) || SHARE_TABS[0];
  const activeUrl = shareUrls[selectedTab];
  const activeQr = qrImages[selectedTab];
  const isCopied = copiedTab === selectedTab;

  const handleCopy = async () => {
    if (!activeUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopiedTab(selectedTab);
      window.setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      data-testid="station-share-panel"
      className={compact ? 'space-y-3' : 'space-y-3.5'}
    >
      <div className="rounded-xl bg-emerald-950/40 border border-emerald-400/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <Smartphone className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <div className="font-bold text-emerald-200">
              Sambungkan Perangkat Lain dengan 1x Scan QR
            </div>
            <p className="text-[11px] text-blue-100/90 leading-relaxed">
              Tablet <strong className="text-white">Juri, Dewan, Timer &amp; Monitor</strong> cukup scan QR di bawah (atau lewat <strong className="text-cyan-300">Kamera Scan QR</strong> di menu Pengaturan) tanpa perlu login Google.
            </p>
          </div>
        </div>
        {onOpenScanner && (
          <button
            type="button"
            data-testid="station-share-open-scanner-btn"
            onClick={onOpenScanner}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors shadow-md"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>Buka Kamera Scan QR</span>
          </button>
        )}
      </div>

      {/* Tab pilih QR Utama atau per Panel */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Pilih Target QR Barcode">
        {SHARE_TABS.map((tab) => {
          const active = tab.id === selectedTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`station-qr-tab-${tab.id}`}
              onClick={() => setSelectedTab(tab.id)}
              className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                active
                  ? 'bg-yellow-400 text-black border-yellow-300 shadow'
                  : 'bg-black/55 hover:bg-blue-950 text-blue-100 border-purple-700/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Kartu QR Tunggal Besar & Simpel */}
      <div
        data-testid={`station-share-card-${selectedTab}`}
        className={`rounded-2xl border border-purple-500/45 bg-black/50 ${
          compact ? 'p-3.5' : 'p-4 sm:p-5'
        } flex flex-col sm:flex-row items-center gap-4 sm:gap-6`}
      >
        <button
          type="button"
          data-testid="station-qr-primary-preview"
          onClick={() => setZoomOpen(true)}
          aria-label={`Perbesar ${activeMeta.title}`}
          className="shrink-0 rounded-2xl bg-white p-2.5 shadow-xl hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
        >
          {activeQr ? (
            <img
              src={activeQr}
              alt={`${activeMeta.title} - ${arenaId}`}
              className={compact ? 'w-36 h-36 block' : 'w-44 h-44 sm:w-48 sm:h-48 block'}
            />
          ) : (
            <div
              className={`flex items-center justify-center text-slate-400 ${
                compact ? 'w-36 h-36' : 'w-44 h-44 sm:w-48 sm:h-48'
              }`}
            >
              <QrCode className="w-10 h-10 animate-pulse" />
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
          <div className="space-y-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border ${activeMeta.badgeClass}`}
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span>{activeMeta.label}</span>
            </span>
            <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
              {activeMeta.title}
            </h3>
            <p className="text-xs text-blue-100/85 leading-relaxed">{activeMeta.subtitle}</p>
          </div>

          <div
            title={activeUrl}
            className="rounded-xl bg-black/70 border border-white/15 px-3 py-2 font-mono text-[11px] text-emerald-200 truncate select-all"
          >
            {activeUrl}
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              data-testid={`station-copy-link-${selectedTab}`}
              onClick={() => void handleCopy()}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isCopied ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 shrink-0" />
              )}
              <span>{isCopied ? 'Link Tersalin' : 'Salin Link HTTPS'}</span>
            </button>

            <button
              type="button"
              data-testid={`station-expand-qr-${selectedTab}`}
              onClick={() => setZoomOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
              <span>Perbesar QR</span>
            </button>

            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-400/50 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>Buka Tab Baru</span>
            </a>
          </div>
        </div>
      </div>

      {zoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-station-qr-title"
          data-testid="station-qr-zoom-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#120726] border border-yellow-400/60 p-6 shadow-2xl space-y-4 text-center text-white">
            <div className="flex items-center justify-between gap-2 border-b border-purple-800/60 pb-3">
              <div className="flex items-center gap-2 text-left">
                <QrCode className="w-5 h-5 text-yellow-300 shrink-0" />
                <div>
                  <h3
                    id="expanded-station-qr-title"
                    className="font-display text-base font-extrabold text-white"
                  >
                    {activeMeta.title}
                  </h3>
                  <div className="text-[11px] text-emerald-300 font-mono">
                    {arenaName ? `${arenaName} · ` : ''}
                    {arenaId}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                aria-label="Tutup modal QR"
                className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mx-auto inline-block rounded-2xl bg-white p-4 shadow-xl">
              {activeQr && (
                <img
                  src={activeQr}
                  alt={`QR Besar ${activeMeta.label}`}
                  className="w-64 h-64 sm:w-72 sm:h-72 block"
                />
              )}
            </div>

            <p className="text-xs text-blue-100 leading-relaxed">
              Scan menggunakan <strong className="text-cyan-300">Kamera Scan QR</strong> di Menu Pengaturan perangkat <strong className="text-yellow-300">{activeMeta.label}</strong> untuk sinkronisasi otomatis tanpa login Google.
            </p>

            <div className="rounded-xl bg-black/60 border border-white/15 px-3 py-2 font-mono text-[11px] text-emerald-200 break-all select-all">
              {activeUrl}
            </div>

            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isCopied ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 shrink-0" />
              )}
              <span>{isCopied ? 'Link Tersalin' : 'Salin Link HTTPS'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
