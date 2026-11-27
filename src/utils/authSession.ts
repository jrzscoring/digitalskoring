import type { AppView, ArenaCourt, OfficialStationRole } from '../types/silat';

export const SUPER_ADMIN_EMAIL = 'dmenterior@gmail.com';
export const PORTAL_ACCESS_PASSCODE = '211096';
export const PORTAL_ACCESS_STORAGE_KEY = 'silat_portal_access_mode_v1';
export const LIMITED_NOTICE_ACK_STORAGE_KEY = 'silat_limited_notice_ack_uid_v1';

export type PortalAccessMode = 'locked' | 'guest' | 'full';

export function verifyPortalPasscode(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Masukkan password login terlebih dahulu.',
    };
  }
  if (trimmed !== PORTAL_ACCESS_PASSCODE) {
    return {
      valid: false,
      error: 'Password login tidak sesuai. Silakan periksa kembali atau kosongkan untuk mode terbatas.',
    };
  }
  return { valid: true };
}

export function resolvePortalLoginInput(
  input: string
): { ok: true; mode: 'guest' | 'full' } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, mode: 'guest' };
  }
  if (trimmed === PORTAL_ACCESS_PASSCODE) {
    return { ok: true, mode: 'full' };
  }
  return {
    ok: false,
    error: 'Password tidak sesuai. Kosongkan password lalu tekan Masuk untuk mode terbatas.',
  };
}

export function isFullJuriUnlockedForMode(mode: PortalAccessMode): boolean {
  return mode === 'full';
}

export function isJudgeIdAllowedForMode(judgeId: number, mode: PortalAccessMode): boolean {
  if (mode === 'full') return true;
  return judgeId === 1;
}

export function resolvePortalModeAfterGoogleLogin(
  storedMode: PortalAccessMode
): 'guest' | 'full' {
  return storedMode === 'full' ? 'full' : 'guest';
}

export function readAcknowledgedLimitedNoticeUid(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(LIMITED_NOTICE_ACK_STORAGE_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writeAcknowledgedLimitedNoticeUid(uid: string | null): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (!uid || !uid.trim()) {
      window.sessionStorage.removeItem(LIMITED_NOTICE_ACK_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(LIMITED_NOTICE_ACK_STORAGE_KEY, uid.trim());
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function shouldShowLimitedModeNotice(params: {
  userUid?: string | null;
  isFullJuriUnlocked: boolean;
  acknowledgedUid?: string | null;
}): boolean {
  const uid = params.userUid?.trim();
  if (!uid || params.isFullJuriUnlocked) return false;
  return params.acknowledgedUid !== uid;
}

export function readStoredPortalAccessMode(): PortalAccessMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'locked';
  try {
    const raw = window.localStorage.getItem(PORTAL_ACCESS_STORAGE_KEY);
    if (raw === 'full' || raw === 'guest') return raw;
    return 'locked';
  } catch {
    return 'locked';
  }
}

export function writeStoredPortalAccessMode(mode: PortalAccessMode): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (mode === 'locked') {
      window.localStorage.removeItem(PORTAL_ACCESS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PORTAL_ACCESS_STORAGE_KEY, mode);
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

export interface OfficialRoleOption {
  role: OfficialStationRole;
  title: string;
  subtitle: string;
  targetView: Exclude<AppView, 'landing'>;
}

export const OFFICIAL_ROLE_OPTIONS: OfficialRoleOption[] = [
  {
    role: 'Sekretaris',
    title: 'Sekretaris Pertandingan',
    subtitle: 'Registrasi atlet, bagan bracket, kontrol partai & pembagian gelanggang',
    targetView: 'sekretaris',
  },
  {
    role: 'Dewan',
    title: 'Dewan Pertandingan',
    subtitle: 'Pengesahan nilai, hukuman wasit, verifikasi juri & penentuan pemenang',
    targetView: 'dewan',
  },
  {
    role: 'Timer',
    title: 'Timer Arena',
    subtitle: 'Kendali waktu babak tanding, waktu istirahat & timer penampil jurus',
    targetView: 'timer',
  },
  {
    role: 'Juri',
    title: 'Juri Penilai',
    subtitle: 'Input poin pukulan/tendangan tanding & penilaian jurus TGRS (Juri 1–10)',
    targetView: 'juri',
  },
  {
    role: 'Scoreboard',
    title: 'Operator Scoreboard',
    subtitle: 'Tampilan layar LED publik skor, bendera kontingen & jadwal partai berikutnya',
    targetView: 'scoreboard',
  },
];

export const ARENA_COURTS: ArenaCourt[] = ['A', 'B', 'C', 'D'];

export function isSuperAdminEmail(email?: string | null, emailVerified?: boolean): boolean {
  if (!email || emailVerified === false) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function courtIdFromCourtLetter(court: ArenaCourt): string {
  return `gelanggang-${court.toLowerCase()}`;
}

export function sanitizeArenaIdValue(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `id-${Date.now()}`;
}

export function getAccountArenaId(uid: string, court: ArenaCourt = 'A'): string {
  const trimmedUid = uid.trim();
  const base = sanitizeArenaIdValue(`arena-${trimmedUid.slice(0, 12)}`);
  if (court === 'A') return base;
  return sanitizeArenaIdValue(`${base}-${court.toLowerCase()}`);
}

export function isOwnAccountArenaId(arenaId: string, uid?: string | null): boolean {
  if (!uid || !uid.trim()) return false;
  return ARENA_COURTS.some((court) => getAccountArenaId(uid, court) === arenaId);
}

export function resolveCourtForArenaId(arenaId: string, uid?: string | null): ArenaCourt | null {
  for (const court of ARENA_COURTS) {
    if (uid && uid.trim() && getAccountArenaId(uid, court) === arenaId) return court;
    if (courtIdFromCourtLetter(court) === arenaId) return court;
  }
  return null;
}

export type StationShareView = 'juri' | 'timer' | 'dewan' | 'scoreboard';

export const STATION_SHARE_VIEWS: StationShareView[] = ['juri', 'timer', 'dewan', 'scoreboard'];
export const STATION_SESSION_ARENA_KEY = 'silat_station_session_arena_v1';

export function buildEventShareUrl(arenaId: string, currentHref?: string): string {
  const baseHref =
    currentHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (!baseHref) return `?arena=${encodeURIComponent(arenaId)}`;
  try {
    const url = new URL(baseHref);
    url.searchParams.set('arena', arenaId);
    url.hash = '';
    return url.toString();
  } catch {
    return `?arena=${encodeURIComponent(arenaId)}`;
  }
}

export function buildStationShareUrl(
  arenaId: string,
  view: StationShareView,
  currentHref?: string
): string {
  const baseHref =
    currentHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (!baseHref) {
    return `?arena=${encodeURIComponent(arenaId)}&view=${encodeURIComponent(view)}`;
  }
  try {
    const url = new URL(baseHref);
    url.searchParams.set('arena', arenaId);
    url.searchParams.set('view', view);
    url.hash = '';
    return url.toString();
  } catch {
    return `?arena=${encodeURIComponent(arenaId)}&view=${encodeURIComponent(view)}`;
  }
}

export function parseStationShareLink(
  search?: string,
  hash?: string
): { isStationLink: boolean; arenaId: string | null; view: StationShareView | null } {
  const rawSearch =
    search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const rawHash =
    hash ?? (typeof window !== 'undefined' ? window.location.hash : '');

  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch);
  const rawArena = params.get('arena')?.trim() || '';
  const arenaId = rawArena ? sanitizeArenaIdValue(rawArena) : null;

  const hashView = rawHash.replace(/^#\/?/, '').trim().toLowerCase();
  const queryView = (params.get('view') || '').trim().toLowerCase();
  const candidateView = STATION_SHARE_VIEWS.includes(hashView as StationShareView)
    ? (hashView as StationShareView)
    : STATION_SHARE_VIEWS.includes(queryView as StationShareView)
    ? (queryView as StationShareView)
    : null;

  if (arenaId && candidateView) {
    return {
      isStationLink: true,
      arenaId,
      view: candidateView,
    };
  }

  return {
    isStationLink: false,
    arenaId,
    view: null,
  };
}

export function readStationSessionArenaId(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STATION_SESSION_ARENA_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeStationSessionArenaId(arenaId: string | null): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (!arenaId || !arenaId.trim()) {
      window.sessionStorage.removeItem(STATION_SESSION_ARENA_KEY);
    } else {
      window.sessionStorage.setItem(STATION_SESSION_ARENA_KEY, arenaId.trim());
    }
  } catch {
    // ignore storage errors
  }
}

export function resolveTargetAppView(
  role: OfficialStationRole,
  jumpToStation: boolean
): AppView {
  if (!jumpToStation) return 'landing';
  const found = OFFICIAL_ROLE_OPTIONS.find((item) => item.role === role);
  return found ? found.targetView : 'landing';
}

export function detectClientDeviceLabel(rawUa?: string): string {
  const ua =
    rawUa ??
    (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '');
  if (!ua) return 'Perangkat Resmi';

  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  let os = 'Web';
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPad')) os = 'iPadOS';
  else if (ua.includes('iPhone')) os = 'iOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} · ${os}`.slice(0, 120);
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Jendela masuk Google ditutup sebelum proses selesai. Silakan klik tombol masuk kembali.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup login diblokir oleh browser. Izinkan popup untuk aplikasi ini lalu coba masuk lagi.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Koneksi internet tidak tersedia untuk verifikasi akun Google. Periksa jaringan lalu coba lagi.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Domain aplikasi belum terdaftar di Firebase Authentication. Hubungi administrator sistem.';
  }
  if (code === 'auth/user-disabled') {
    return 'Akun Google ini dinonaktifkan pada proyek otentikasi. Hubungi Ketua Panitia atau Admin.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Metode masuk Google belum diaktifkan pada Firebase Console proyek ini.';
  }
  if (message.trim()) {
    return `Autentikasi gagal: ${message.slice(0, 160)}`;
  }
  return 'Gagal melakukan autentikasi Google. Silakan coba beberapa saat lagi.';
}

export interface OfficialProfileFormInput {
  displayName: string;
  licenseNumber?: string;
  contingentOrigin?: string;
  preferredRole: OfficialStationRole;
  preferredCourt: ArenaCourt;
  preferredJudgeNumber?: number;
  connectionMode: 'own' | 'join';
  targetArenaId?: string;
}

export interface OfficialProfileValidationResult {
  valid: boolean;
  errors: Partial<Record<'displayName' | 'licenseNumber' | 'contingentOrigin' | 'targetArenaId', string>>;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

export function validateOfficialProfileInput(
  input: OfficialProfileFormInput
): OfficialProfileValidationResult {
  const errors: OfficialProfileValidationResult['errors'] = {};
  const trimmedName = input.displayName.trim();
  if (trimmedName.length < 2) {
    errors.displayName = 'Nama lengkap petugas minimal 2 karakter.';
  } else if (trimmedName.length > 80) {
    errors.displayName = 'Nama lengkap maksimal 80 karakter.';
  }

  const trimmedLicense = (input.licenseNumber || '').trim();
  if (trimmedLicense.length > 48) {
    errors.licenseNumber = 'Nomor lisensi / SK maksimal 48 karakter.';
  }

  const trimmedContingent = (input.contingentOrigin || '').trim();
  if (trimmedContingent.length > 80) {
    errors.contingentOrigin = 'Asal Pengprov / lembaga maksimal 80 karakter.';
  }

  if (input.connectionMode === 'join') {
    const trimmedArena = (input.targetArenaId || '').trim();
    if (!trimmedArena) {
      errors.targetArenaId = 'Masukkan ID Arena dari Sekretaris untuk bergabung ke gelanggang bersama.';
    } else if (!VALID_ID_REGEX.test(trimmedArena)) {
      errors.targetArenaId =
        'ID Arena harus 2–64 karakter dan hanya boleh huruf, angka, tanda hubung (-), atau garis bawah (_).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
