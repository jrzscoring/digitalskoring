import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Link2,
  RefreshCw,
  SwitchCamera,
  X,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { AppView } from '../types/silat';
import { parseScannedQrPayload, type StationShareView } from '../utils/authSession';

export type ScannerTargetView = StationShareView | 'auto';

interface QRScannerModalProps {
  open: boolean;
  onClose: () => void;
  defaultTargetView?: ScannerTargetView;
  onConnected?: (view: AppView, arenaId: string) => void;
}

const TARGET_VIEW_OPTIONS: { id: ScannerTargetView; label: string }[] = [
  { id: 'auto', label: 'Otomatis (Sesuai QR)' },
  { id: 'juri', label: 'Juri' },
  { id: 'dewan', label: 'Dewan' },
  { id: 'timer', label: 'Timer' },
  { id: 'scoreboard', label: 'Monitor' },
];

export function QRScannerModal({
  open,
  onClose,
  defaultTargetView = 'auto',
  onConnected,
}: QRScannerModalProps) {
  const { connectStationByQrOrId } = useArena();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDecodeAtRef = useRef<number>(0);
  const handledScanRef = useRef<boolean>(false);

  const [selectedView, setSelectedView] = useState<ScannerTargetView>(defaultTargetView);
  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedView(defaultTargetView);
      setStatusMessage(null);
      setErrorMessage(null);
      setManualInput('');
      handledScanRef.current = false;
    } else {
      stopCamera();
    }
  }, [open, defaultTargetView, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleDecodedRawText = useCallback(
    async (rawText: string) => {
      if (handledScanRef.current || connecting) return;
      const parsed = parseScannedQrPayload(rawText);
      if (!parsed.ok) {
        setErrorMessage(parsed.error);
        return;
      }

      handledScanRef.current = true;
      setConnecting(true);
      setErrorMessage(null);

      const resolvedTarget: StationShareView | null =
        selectedView !== 'auto' ? selectedView : parsed.view;

      try {
        const res = await connectStationByQrOrId(parsed.arenaId, resolvedTarget);
        if (!res.ok) {
          handledScanRef.current = false;
          setErrorMessage(res.error || 'Gagal menghubungkan perangkat ke Arena.');
          return;
        }
        stopCamera();
        setStatusMessage(`Terhubung ke Arena ${res.arenaId}. Membuka panel...`);
        window.setTimeout(() => {
          onClose();
          onConnected?.(res.view, res.arenaId);
        }, 350);
      } catch (err) {
        handledScanRef.current = false;
        setErrorMessage(err instanceof Error ? err.message : 'Terjadi kesalahan saat menyambungkan.');
      } finally {
        setConnecting(false);
      }
    },
    [connecting, selectedView, connectStationByQrOrId, stopCamera, onClose, onConnected]
  );

  const startCamera = useCallback(
    async (preferredDeviceId?: string | null) => {
      stopCamera();
      setCameraState('starting');
      setCameraError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError(
          'Browser atau perangkat ini tidak mendukung akses kamera langsung. Gunakan Scan Foto QR atau tempel Link HTTPS di bawah.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          const constraints: MediaStreamConstraints = {
            video: preferredDeviceId
              ? { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const trackSettings = stream.getVideoTracks()[0]?.getSettings();
        if (trackSettings?.deviceId) {
          setActiveDeviceId(trackSettings.deviceId);
        }

        if (navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
        }

        setCameraState('active');
      } catch (err) {
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak oleh browser. Aktifkan izin kamera pada bilah alamat browser, atau gunakan tombol Scan dari Foto.'
            : 'Kamera tidak dapat dibuka pada perangkat ini. Pastikan tidak dipakai aplikasi lain atau gunakan Scan dari Foto.';
        setCameraState('error');
        setCameraError(msg);
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!open) return;
    void startCamera(activeDeviceId);
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Continuous QR frame scanner loop
  useEffect(() => {
    if (!open || cameraState !== 'active') return;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const video = videoRef.current;
      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        now - lastDecodeAtRef.current >= 120 &&
        !handledScanRef.current
      ) {
        lastDecodeAtRef.current = now;
        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const decoded = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (decoded?.data) {
            void handleDecodedRawText(decoded.data);
          }
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, cameraState, handleDecodedRawText]);

  const handleSwitchCamera = () => {
    if (videoDevices.length < 2) return;
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === activeDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextId = videoDevices[nextIndex]?.deviceId;
    if (nextId) {
      setActiveDeviceId(nextId);
      void startCamera(nextId);
    }
  };

  const handlePhotoQrUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Gagal memuat gambar QR.'));
        el.src = objectUrl;
      });
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setErrorMessage('Browser tidak mendukung pemindaian gambar.');
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const decoded = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (!decoded?.data) {
        setErrorMessage('QR Barcode tidak terdeteksi pada gambar tersebut. Coba foto ulang lebih jelas.');
        return;
      }
      await handleDecodedRawText(decoded.data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membaca foto QR.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleManualConnect = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    await handleDecodedRawText(manualInput.trim());
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-modal-title"
      data-testid="qr-scanner-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#120726] border border-cyan-400/60 p-5 shadow-2xl space-y-4 text-white">
        <div className="flex items-center justify-between gap-3 border-b border-purple-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2
                id="qr-scanner-modal-title"
                className="font-display text-base sm:text-lg font-extrabold text-white"
              >
                Scan QR Barcode (Kamera)
              </h2>
              <p className="text-[11px] text-cyan-200/90">
                Arahkan kamera ke QR Barcode di pengaturan Sekretaris
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="qr-scanner-close-btn"
            onClick={onClose}
            aria-label="Tutup kamera scanner QR"
            className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pilihan panel tujuan setelah scan */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
            Buka Panel Setelah Scan:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TARGET_VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`qr-scanner-target-${opt.id}`}
                onClick={() => setSelectedView(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  selectedView === opt.id
                    ? 'bg-yellow-400 text-black border-yellow-300'
                    : 'bg-black/55 hover:bg-blue-950 text-blue-100 border-purple-700/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area Kamera */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-cyan-500/45 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${cameraState === 'active' ? 'block' : 'hidden'}`}
          />

          {cameraState === 'active' && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="w-52 h-52 sm:w-60 sm:h-60 relative rounded-2xl border-2 border-cyan-300/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-yellow-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-yellow-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-yellow-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-yellow-400 rounded-br-lg" />
                </div>
              </div>

              {videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="absolute bottom-3 right-3 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black border border-white/25 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Ganti Kamera</span>
                </button>
              )}
            </>
          )}

          {cameraState === 'starting' && (
            <div className="text-center space-y-2 p-6 text-blue-200">
              <RefreshCw className="w-7 h-7 mx-auto animate-spin text-cyan-300" />
              <div className="text-xs font-semibold">Mengaktifkan kamera perangkat...</div>
            </div>
          )}

          {cameraState === 'error' && (
            <div className="text-center space-y-3 p-6 max-w-sm">
              <Camera className="w-8 h-8 mx-auto text-amber-300" />
              <p className="text-xs text-amber-100 leading-relaxed">{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera(activeDeviceId)}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Buka Kamera Lagi</span>
              </button>
            </div>
          )}
        </div>

        {/* Tombol Scan dari Foto / Galeri */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="qr-photo-upload-input"
            className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-400/55 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <ImagePlus className="w-4 h-4 text-yellow-300 shrink-0" />
            <span>Scan QR dari Foto / Galeri</span>
          </label>
          <input
            id="qr-photo-upload-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void handlePhotoQrUpload(e)}
            className="sr-only"
          />
        </div>

        {/* Fallback Manual Paste Link HTTPS / ID Arena */}
        <form onSubmit={(e) => void handleManualConnect(e)} className="space-y-1.5 border-t border-purple-800/60 pt-3">
          <label htmlFor="qr-manual-arena-input" className="block text-[11px] font-semibold text-blue-200">
            Atau tempel Link HTTPS / ID Arena secara manual:
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="w-3.5 h-3.5 text-cyan-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="qr-manual-arena-input"
                data-testid="qr-manual-arena-input"
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="https://.../?arena=arena-xxx atau ID Arena"
                className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-black/65 border border-purple-600/55 text-xs text-white placeholder:text-blue-300/45 focus:outline-none focus:border-yellow-400"
              />
            </div>
            <button
              type="submit"
              disabled={!manualInput.trim() || connecting}
              data-testid="qr-manual-connect-btn"
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-extrabold cursor-pointer shrink-0"
            >
              {connecting ? 'Menghubungkan...' : 'Hubungkan'}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div
            role="alert"
            data-testid="qr-scanner-error"
            className="rounded-xl bg-rose-950/90 border border-rose-400/65 px-3 py-2 text-xs text-rose-100 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            data-testid="qr-scanner-success"
            className="rounded-xl bg-emerald-950/90 border border-emerald-400/65 px-3 py-2 text-xs text-emerald-100 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
