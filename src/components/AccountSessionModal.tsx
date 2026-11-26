import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { ArenaCourt, OfficialStationRole } from '../types/silat';
import {
  ARENA_COURTS,
  OFFICIAL_ROLE_OPTIONS,
  buildEventShareUrl,
  validateOfficialProfileInput,
} from '../utils/authSession';

interface AccountSessionModalProps {
  open: boolean;
  onClose: () => void;
}

export function AccountSessionModal({ open, onClose }: AccountSessionModalProps) {
  const {
    user,
    userProfile,
    loginLogs,
    arena,
    isSuperAdmin,
    saveOfficialProfile,
    joinArenaById,
    signOutGoogle,
  } = useArena();

  const [displayName, setDisplayName] = useState(userProfile?.displayName || user?.displayName || '');
  const [licenseNumber, setLicenseNumber] = useState(userProfile?.licenseNumber || '');
  const [contingentOrigin, setContingentOrigin] = useState(userProfile?.contingentOrigin || '');
  const [preferredRole, setPreferredRole] = useState<OfficialStationRole>(
    userProfile?.preferredRole || 'Sekretaris'
  );
  const [preferredCourt, setPreferredCourt] = useState<ArenaCourt>(
    userProfile?.preferredCourt || 'A'
  );
  const [joinIdInput, setJoinIdInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copiedField, setCopiedField] = useState<'uid' | 'arena' | 'link' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(userProfile?.displayName || user?.displayName || '');
    setLicenseNumber(userProfile?.licenseNumber || '');
    setContingentOrigin(userProfile?.contingentOrigin || '');
    setPreferredRole(userProfile?.preferredRole || 'Sekretaris');
    setPreferredCourt(userProfile?.preferredCourt || 'A');
    setNotice(null);
    setError(null);
  }, [open, userProfile, user?.displayName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !user) return null;

  const handleCopy = async (kind: 'uid' | 'arena' | 'link', text: string) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const validation = validateOfficialProfileInput({
      displayName,
      licenseNumber,
      contingentOrigin,
      preferredRole,
      preferredCourt,
      connectionMode: 'own',
    });

    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0];
      setError(firstErr || 'Periksa kembali data profil.');
      return;
    }

    setSaving(true);
    try {
      const ok = await saveOfficialProfile({
        displayName: displayName.trim(),
        licenseNumber: licenseNumber.trim(),
        contingentOrigin: contingentOrigin.trim(),
        preferredRole,
        preferredCourt,
        lastArenaId: arena.id,
        onboardingCompleted: true,
      });
      if (ok) {
        setNotice('Profil petugas berhasil diperbarui.');
      } else {
        setError('Gagal memperbarui profil petugas.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleJoinArena = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinIdInput.trim()) return;
    setError(null);
    setNotice(null);
    setJoining(true);
    try {
      const ok = await joinArenaById(joinIdInput.trim());
      if (ok) {
        setNotice(`Berhasil terhubung ke Arena "${joinIdInput.trim()}".`);
        setJoinIdInput('');
      } else {
        setError('Gagal terhubung. Pastikan ID Arena benar dan UID Anda telah didaftarkan Sekretaris.');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-session-modal-title"
      data-testid="account-session-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#120726] border border-purple-500/60 p-5 sm:p-6 shadow-2xl space-y-5 text-white">
        <div className="flex items-center justify-between gap-3 border-b border-purple-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-yellow-300 shrink-0" />
            <h2 id="account-session-modal-title" className="font-display text-lg font-bold">
              Profil Petugas &amp; Sesi Kejuaraan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup profil petugas"
            className="p-1.5 rounded-lg bg-black/50 text-blue-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Verified Account & IDs */}
        <div className="space-y-3 border-b border-purple-800/50 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={userProfile?.displayName || user.displayName || 'Foto Petugas'}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-blue-950 border border-blue-400/50 flex items-center justify-center text-base font-bold text-yellow-300 shrink-0">
                  {(userProfile?.displayName || user.displayName || 'P').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold text-white truncate">
                  <span className="truncate">{userProfile?.displayName || user.displayName}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
                <div className="text-xs text-blue-200 truncate">
                  {user.email}
                  {isSuperAdmin ? ' · Administrator Kejuaraan' : ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              data-testid="account-modal-logout-btn"
              onClick={() => {
                onClose();
                void signOutGoogle();
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-950/75 hover:bg-rose-800 border border-rose-500/50 text-xs font-bold text-rose-100 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/50 border border-white/10">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400">UID Petugas</div>
                <div className="font-mono text-white truncate">{user.uid}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('uid', user.uid)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-yellow-300 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedField === 'uid' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'uid' ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/50 border border-white/10">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400">ID Arena Event (Firestore)</div>
                <div className="font-mono text-emerald-300 font-bold truncate">{arena.id}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopy('arena', arena.id)}
                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-yellow-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'arena' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'arena' ? 'Disalin' : 'ID'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('link', buildEventShareUrl(arena.id))}
                  className="px-2 py-1 rounded bg-blue-900/80 hover:bg-blue-800 text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'link' ? <Check className="w-3 h-3 text-emerald-300" /> : <Link2 className="w-3 h-3 text-yellow-300" />}
                  <span>{copiedField === 'link' ? 'Disalin' : 'Link'}</span>
                </button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-blue-200/85 leading-relaxed">
            Gunakan akun Google yang sama di seluruh perangkat event ini untuk sinkronisasi langsung tanpa daftar UID, atau gunakan ID Arena di bawah jika perangkat petugas memakai akun Google terpisah.
          </p>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3 border-b border-purple-800/50 pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-yellow-300">
            <UserCheck className="w-4 h-4 shrink-0" />
            <span>Identitas &amp; Penugasan Petugas</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="sm:col-span-2">
              <label htmlFor="acc-display-name" className="block text-[11px] text-blue-200 mb-1">
                Nama Lengkap Petugas
              </label>
              <input
                id="acc-display-name"
                type="text"
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label htmlFor="acc-license" className="block text-[11px] text-blue-200 mb-1">
                No. Lisensi / SK Wasit-Juri
              </label>
              <input
                id="acc-license"
                type="text"
                maxLength={48}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white font-mono text-xs focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label htmlFor="acc-contingent" className="block text-[11px] text-blue-200 mb-1">
                Asal Pengprov / Lembaga
              </label>
              <input
                id="acc-contingent"
                type="text"
                maxLength={80}
                value={contingentOrigin}
                onChange={(e) => setContingentOrigin(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label htmlFor="acc-role" className="block text-[11px] text-blue-200 mb-1">
                Peran Tugas
              </label>
              <select
                id="acc-role"
                value={preferredRole}
                onChange={(e) => setPreferredRole(e.target.value as OfficialStationRole)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400 cursor-pointer"
              >
                {OFFICIAL_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.role} value={opt.role}>
                    {opt.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="acc-court" className="block text-[11px] text-blue-200 mb-1">
                Gelanggang Tugas
              </label>
              <select
                id="acc-court"
                value={preferredCourt}
                onChange={(e) => setPreferredCourt(e.target.value as ArenaCourt)}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white text-xs focus:outline-none focus:border-yellow-400 cursor-pointer"
              >
                {ARENA_COURTS.map((c) => (
                  <option key={c} value={c}>
                    Gelanggang {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black text-xs font-bold cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
            </button>
          </div>
        </form>

        {/* Join External Arena */}
        <form onSubmit={(e) => void handleJoinArena(e)} className="space-y-2 border-b border-purple-800/50 pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
            <KeyRound className="w-4 h-4 text-yellow-300 shrink-0" />
            <span>Gabung Arena Gelanggang Lain (Multi-Perangkat)</span>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={joinIdInput}
              onChange={(e) => setJoinIdInput(e.target.value)}
              placeholder="Masukkan ID Arena dari Sekretaris..."
              maxLength={64}
              className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-white font-mono text-xs focus:outline-none focus:border-yellow-400"
            />
            <button
              type="submit"
              disabled={joining || !joinIdInput.trim()}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 border border-blue-400/50 text-xs font-bold text-white cursor-pointer"
            >
              {joining ? 'Menghubungkan...' : 'Gabung'}
            </button>
          </div>
        </form>

        {/* Recent Login Audit History */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
            <Clock className="w-4 h-4 text-yellow-300 shrink-0" />
            <span>Riwayat Sesi Masuk Terakhir</span>
          </div>
          {loginLogs.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada catatan sesi masuk tersimpan.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/50 text-slate-300 border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Waktu</th>
                    <th className="px-3 py-2 font-semibold">Peran</th>
                    <th className="px-3 py-2 font-semibold">Gel.</th>
                    <th className="px-3 py-2 font-semibold">Perangkat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {loginLogs.slice(0, 5).map((log) => (
                    <tr key={log.id} className="bg-black/25">
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {new Date(log.loginAtMs).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 text-white font-medium">{log.stationRole}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-yellow-300">
                        {log.court}
                      </td>
                      <td className="px-3 py-2 text-slate-300 truncate max-w-[180px]">
                        {log.deviceLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-950/85 border border-rose-400/65 px-3 py-2 text-xs text-rose-100 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-xl bg-emerald-950/85 border border-emerald-400/65 px-3 py-2 text-xs text-emerald-100 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
      </div>
    </div>
  );
}
