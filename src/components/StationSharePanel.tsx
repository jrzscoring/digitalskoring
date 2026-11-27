import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, Maximize2, QrCode, Smartphone, X } from 'lucide-react';
import {
  buildStationShareUrl,
  type StationShareView,
} from '../utils/authSession';

interface StationSharePanelProps {
  arenaId: string;
  arenaName?: string;
  compact?: boolean;
}

interface StationMeta {
  view: StationShareView;
  label: string;
  subtitle: string;
  accentClass: string;
  badgeClass: string;
}

const STATION_META_LIST: StationMeta[] = [
  {
    view: 'juri',
    label: 'Juri',
    subtitle: 'Input poin pukulan/tendangan & penilaian jurus',
    accentClass: 'border-cyan-500/45 bg-cyan-950/20',
    badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  },
  {
    view: 'timer',
    label: 'Timer',
    subtitle: 'Kendali waktu babak tanding & jeda istirahat',
    accentClass: 'border-rose-500/45 bg-rose-950/20',
    badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
  },
  {
    view: 'dewan',
    label: 'Dewan',
    subtitle: 'Pengesahan nilai, hukuman wasit & verifikasi',
    accentClass: 'border-amber-500/45 bg-amber-950/20',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  },
  {
    view: 'scoreboard',
    label: 'Monitor',
    subtitle: 'Layar skor LED publik, kontingen & hasil partai',
    accentClass: 'border-purple-500/45 bg-purple-950/20',
    badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
  },
];

export function StationSharePanel({
  arenaId,
  arenaName,
  compact = false,
}: StationSharePanelProps) {
  const [qrImages, setQrImages] = useState<Partial<Record<StationShareView, string>>>({});
  const [copiedView, setCopiedView] = useState<StationShareView | null>(null);
  const [expandedView, setExpandedView] = useState<StationShareView | null>(null);

  const stationUrls = useMemo(() => {
    const map: Record<StationShareView, string> = {
      juri: buildStationShareUrl(arenaId, 'juri'),
      timer: buildStationShareUrl(arenaId, 'timer'),
      dewan: buildStationShareUrl(arenaId, 'dewan'),
      scoreboard: buildStationShareUrl(arenaId, 'scoreboard'),
    };
    return map;
  }, [arenaId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Partial<Record<StationShareView, string>> = {};
      await Promise.all(
        STATION_META_LIST.map(async ({ view }) => {
          try {
            next[view] = await QRCode.toDataURL(stationUrls[view], {
              width: 320,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#0f0620',
                light: '#ffffff',
              },
            });
          } catch {
            // ignore QR generation failure
          }
        })
      );
      if (!cancelled) {
        setQrImages(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stationUrls]);

  useEffect(() => {
    if (!expandedView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedView(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedView]);

  const handleCopy = async (view: StationShareView) => {
    const url = stationUrls[view];
    if (!url || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedView(view);
      window.setTimeout(() => setCopiedView(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const expandedStation = expandedView
    ? STATION_META_LIST.find((s) => s.view === expandedView) || null
    : null;

  return (
    <div
      data-testid="station-share-panel"
      className={compact ? 'space-y-2.5' : 'space-y-3.5'}
    >
      <div className="rounded-xl bg-emerald-950/40 border border-emerald-400/40 px-3.5 py-2.5 flex items-start gap-2.5">
        <Smartphone className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <div className="font-bold text-emerald-200">
            Hubungkan Perangkat Lain Tanpa Login Google
          </div>
          <p className="text-[11px] text-blue-100/90 leading-relaxed">
            Scan <strong className="text-white">QR Barcode</strong> atau buka{' '}
            <strong className="text-yellow-300">Link HTTPS tersendiri</strong> pada tablet/HP{' '}
            <strong className="text-white">Juri, Timer, Dewan, dan Monitor</strong> untuk sinkronisasi otomatis ke event ini. Login Google cukup hanya untuk Server Utama (Sekretaris).
          </p>
        </div>
      </div>

      <div
        className={`grid gap-3 ${
          compact
            ? 'grid-cols-2 sm:grid-cols-4'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
        }`}
      >
        {STATION_META_LIST.map((station) => {
          const url = stationUrls[station.view];
          const qrSrc = qrImages[station.view];
          const isCopied = copiedView === station.view;

          return (
            <div
              key={station.view}
              data-testid={`station-share-card-${station.view}`}
              className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 ${station.accentClass}`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border ${station.badgeClass}`}
                  >
                    {station.label}
                  </span>
                  <button
                    type="button"
                    data-testid={`station-expand-qr-${station.view}`}
                    onClick={() => setExpandedView(station.view)}
                    title={`Perbesar QR ${station.label}`}
                    aria-label={`Perbesar QR ${station.label}`}
                    className="p-1.5 rounded-lg bg-black/45 hover:bg-black/75 border border-white/15 text-blue-100 hover:text-yellow-300 cursor-pointer transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!compact && (
                  <p className="text-[11px] text-blue-100/80 leading-snug">
                    {station.subtitle}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setExpandedView(station.view)}
                aria-label={`Tampilkan QR Barcode ${station.label}`}
                className="mx-auto rounded-xl bg-white p-2 shadow-md hover:scale-[1.03] active:scale-95 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              >
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt={`QR Barcode ${station.label} - ${arenaId}`}
                    className={compact ? 'w-24 h-24 block' : 'w-32 h-32 block'}
                  />
                ) : (
                  <div
                    className={`flex items-center justify-center text-slate-400 ${
                      compact ? 'w-24 h-24' : 'w-32 h-32'
                    }`}
                  >
                    <QrCode className="w-8 h-8 animate-pulse" />
                  </div>
                )}
              </button>

              <div className="space-y-1.5">
                {!compact && (
                  <div
                    title={url}
                    className="rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 font-mono text-[10px] text-emerald-200 truncate select-all"
                  >
                    {url}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`station-copy-link-${station.view}`}
                    onClick={() => void handleCopy(station.view)}
                    className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{isCopied ? 'Tersalin' : 'Salin Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedView(station.view)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-black/55 hover:bg-black/80 border border-white/15 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <QrCode className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                    <span>QR</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {expandedStation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-station-qr-title"
          data-testid="station-qr-zoom-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpandedView(null);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
                    Scan QR — Panel {expandedStation.label}
                  </h3>
                  <div className="text-[11px] text-emerald-300 font-mono">
                    {arenaName ? `${arenaName} · ` : ''}
                    {arenaId}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedView(null)}
                aria-label="Tutup modal QR"
                className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mx-auto inline-block rounded-2xl bg-white p-4 shadow-xl">
              {qrImages[expandedStation.view] && (
                <img
                  src={qrImages[expandedStation.view]}
                  alt={`QR Besar ${expandedStation.label}`}
                  className="w-60 h-60 sm:w-64 sm:h-64 block"
                />
              )}
            </div>

            <p className="text-xs text-blue-100 leading-relaxed">
              Arahkan kamera HP/Tablet <strong className="text-yellow-300">{expandedStation.label}</strong> ke QR di atas untuk langsung terhubung ke event ini tanpa login Google.
            </p>

            <div className="rounded-xl bg-black/60 border border-white/15 px-3 py-2 font-mono text-[11px] text-emerald-200 break-all select-all">
              {stationUrls[expandedStation.view]}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(expandedStation.view)}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedView === expandedStation.view ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {copiedView === expandedStation.view ? 'Link Disalin' : 'Salin Link HTTPS'}
                </span>
              </button>
              <a
                href={stationUrls[expandedStation.view]}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 border border-blue-400/50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>Buka Tab</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
