import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, ShieldAlert, Undo2 } from 'lucide-react';
import { useArena } from '../context/ArenaContext';
import type { Corner, MatchData } from '../types/silat';
import {
  MAX_OFFICIAL_PROTESTS,
  canRecordOfficialProtest,
  getCornerProtestStatus,
} from '../utils/officialProtest';

interface ProtestCardIconProps {
  corner: Corner;
  cardNumber: number;
}

function ProtestCardIcon({ corner, cardNumber }: ProtestCardIconProps) {
  const isBlue = corner === 'blue';
  const frameClass = isBlue
    ? 'border-sky-400/80 bg-sky-950/85 text-sky-200'
    : 'border-rose-400/80 bg-rose-950/85 text-rose-200';
  const strokeColor = isBlue ? '#38bdf8' : '#fb7185';
  const accentFill = isBlue ? 'rgba(56, 189, 248, 0.22)' : 'rgba(251, 113, 133, 0.22)';

  return (
    <div
      data-testid={`protest-card-icon-${corner}-${cardNumber}`}
      title={`Kartu Protes Official ${isBlue ? 'Sudut Biru' : 'Sudut Merah'} #${cardNumber}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${frameClass} select-none`}
    >
      <svg
        width="20"
        height="26"
        viewBox="0 0 20 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="18"
          height="24"
          rx="3"
          fill={accentFill}
          stroke={strokeColor}
          strokeWidth="1.6"
        />
        <line x1="4.5" y1="6.5" x2="15.5" y2="6.5" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" />
        <line x1="4.5" y1="10.5" x2="12.5" y2="10.5" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="10" cy="18" r="3" fill={strokeColor} />
      </svg>
      <span className="font-mono text-xs font-bold tabular-nums">
        Kartu {cardNumber}
      </span>
    </div>
  );
}

export function OfficialProtestPanel() {
  const {
    matches,
    activeMatch,
    events,
    getMatchEvents,
    recordOfficialProtest,
    resetOfficialProtests,
  } = useArena();

  const [selectedMatchId, setSelectedMatchId] = useState<string>(activeMatch.id);
  const [followActive, setFollowActive] = useState<boolean>(true);
  const [busyCorner, setBusyCorner] = useState<Corner | 'reset' | null>(null);

  useEffect(() => {
    const exists = matches.some((m) => m.id === selectedMatchId);
    if (followActive || !exists) {
      setSelectedMatchId(activeMatch.id);
    }
  }, [activeMatch.id, followActive, matches, selectedMatchId]);

  const targetMatch: MatchData = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || activeMatch,
    [matches, selectedMatchId, activeMatch]
  );

  const isInspectingActive = targetMatch.id === activeMatch.id;
  const blueStatus = getCornerProtestStatus(targetMatch, 'blue');
  const redStatus = getCornerProtestStatus(targetMatch, 'red');
  const totalUsed = blueStatus.usedCount + redStatus.usedCount;
  const isFinished = targetMatch.status === 'finished';

  const latestProtestEvents = useMemo(() => {
    const list = isInspectingActive ? events : getMatchEvents(targetMatch.id);
    return list.filter((ev) => !ev.undone && ev.type === 'official_protest').slice(0, 2);
  }, [isInspectingActive, events, getMatchEvents, targetMatch.id]);

  const handleRecord = async (corner: Corner, delta: 1 | -1) => {
    if (busyCorner) return;
    setBusyCorner(corner);
    try {
      await recordOfficialProtest(targetMatch.id, corner, delta);
    } finally {
      setBusyCorner(null);
    }
  };

  const handleResetAll = async () => {
    if (busyCorner || totalUsed === 0 || isFinished) return;
    setBusyCorner('reset');
    try {
      await resetOfficialProtests(targetMatch.id);
    } finally {
      setBusyCorner(null);
    }
  };

  return (
    <section
      aria-label="Informasi Protes Pelatih Official"
      data-testid="official-protest-panel"
      className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-4 sm:p-5 space-y-4"
    >
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-purple-800/60">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-yellow-300 shrink-0" />
            <h2 className="font-display text-lg font-bold text-yellow-300 leading-tight">
              Informasi Protes Pelatih / Official
            </h2>
          </div>
          <p className="text-xs text-blue-200 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-white">
              {targetMatch.matchNumber} (Gel. {targetMatch.gelanggang || 'A'})
            </span>
            <span aria-hidden="true" className="text-purple-400">&middot;</span>
            <span>Kuota {MAX_OFFICIAL_PROTESTS} Kartu per Sudut</span>
            <span aria-hidden="true" className="text-purple-400">&middot;</span>
            <span className="font-mono tabular-nums text-yellow-200">
              Total Protes Tercatat: {totalUsed}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="protest-match-select" className="sr-only">
            Pilih Partai untuk Informasi Kartu Protes Official
          </label>
          <select
            id="protest-match-select"
            data-testid="protest-match-select"
            value={targetMatch.id}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedMatchId(nextId);
              setFollowActive(nextId === activeMatch.id);
            }}
            className="min-h-[36px] max-w-[260px] px-2.5 py-1.5 rounded-lg bg-black/65 border border-blue-500/45 text-xs text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
          >
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matchNumber} — {m.blueName} vs {m.redName}
                {m.id === activeMatch.id ? ' (Aktif)' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleResetAll()}
            disabled={totalUsed === 0 || isFinished || busyCorner !== null}
            data-testid="protest-reset-all-btn"
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-black/65 hover:bg-purple-950/70 disabled:opacity-45 border border-purple-600/55 text-xs font-semibold text-blue-100 flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
            <span>Reset 2 Kartu</span>
          </button>
        </div>
      </div>

      {/* 2-Column Flat Split for Sudut Biru & Sudut Merah (Hairline Divider, Zero Nested Boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-purple-800/60">
        {([
          {
            corner: 'blue' as Corner,
            label: 'Official Sudut Biru',
            athleteName: targetMatch.blueName,
            contingent: targetMatch.blueContingent,
            status: blueStatus,
            headingColor: 'text-sky-300',
            buttonClass:
              'bg-sky-600 hover:bg-sky-500 text-white border border-sky-400/60',
          },
          {
            corner: 'red' as Corner,
            label: 'Official Sudut Merah',
            athleteName: targetMatch.redName,
            contingent: targetMatch.redContingent,
            status: redStatus,
            headingColor: 'text-rose-300',
            buttonClass:
              'bg-rose-600 hover:bg-rose-500 text-white border border-rose-400/60',
          },
        ] as const).map((item, idx) => {
          const canProtest = canRecordOfficialProtest(targetMatch, item.corner);
          const paddingClass = idx === 0 ? 'pb-4 md:pb-0 md:pr-5' : 'pt-4 md:pt-0 md:pl-5';

          return (
            <div
              key={item.corner}
              data-testid={`protest-corner-section-${item.corner}`}
              className={`${paddingClass} space-y-3 min-w-0`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-xs font-semibold uppercase tracking-wide ${item.headingColor}`}>
                    {item.label}
                  </div>
                  <div className="text-sm font-bold text-white truncate">
                    {item.athleteName}
                  </div>
                  <div className="text-xs text-slate-300 truncate">
                    {item.contingent}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] text-blue-200">Protes Dilakukan</div>
                  <div
                    data-testid={`protest-used-count-${item.corner}`}
                    className="font-mono text-xl font-black text-white tabular-nums leading-tight"
                  >
                    {item.status.usedCount} / {item.status.maxCards}
                  </div>
                  <div
                    data-testid={`protest-remaining-label-${item.corner}`}
                    className={`text-[11px] font-mono tabular-nums ${
                      item.status.exhausted ? 'text-amber-300 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {item.status.exhausted
                      ? 'Kartu habis'
                      : `Sisa ${item.status.remainingCount} kartu`}
                  </div>
                </div>
              </div>

              {/* 2-Card Icons Area (Cards disappear as official files protests) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div
                  data-testid={`protest-cards-container-${item.corner}`}
                  aria-label={`Sisa kartu protes ${item.label}: ${item.status.remainingCount} dari 2`}
                  className="flex flex-wrap items-center gap-2 min-h-[40px]"
                >
                  {item.status.visibleCardNumbers.length > 0 ? (
                    item.status.visibleCardNumbers.map((cardNum) => (
                      <ProtestCardIcon
                        key={cardNum}
                        corner={item.corner}
                        cardNumber={cardNum}
                      />
                    ))
                  ) : (
                    <span
                      data-testid={`protest-empty-cards-${item.corner}`}
                      className="text-xs font-medium text-amber-300"
                    >
                      0 Kartu Tersisa &middot; Kuota Protes Habis ({item.status.usedCount}/{item.status.maxCards})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.status.usedCount > 0 && !isFinished && (
                    <button
                      type="button"
                      onClick={() => void handleRecord(item.corner, -1)}
                      disabled={busyCorner !== null}
                      data-testid={`protest-undo-btn-${item.corner}`}
                      title="Batalkan 1 catatan protes"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-black/65 hover:bg-purple-950/70 border border-purple-600/55 text-xs font-semibold text-blue-100 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Batalkan</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleRecord(item.corner, 1)}
                    disabled={!canProtest || busyCorner !== null}
                    data-testid={`protest-submit-btn-${item.corner}`}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${item.buttonClass} disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                  >
                    {item.status.exhausted
                      ? 'Kuota Protes Habis'
                      : 'Catat Protes Official'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Concise Audit Trail Line (Only when protest events exist) */}
      {latestProtestEvents.length > 0 && (
        <div className="pt-2.5 border-t border-purple-800/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-200/90">
          {latestProtestEvents.map((ev) => (
            <span key={ev.id} className="font-mono tabular-nums">
              [{ev.matchTimeFormatted} · R{ev.round}] {ev.description}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
