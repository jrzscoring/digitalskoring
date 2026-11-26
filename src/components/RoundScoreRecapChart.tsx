import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Radio, TrendingUp, Layers } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useArena } from '../context/ArenaContext';
import { db } from '../lib/firebase';
import type { MatchData, MatchEvent } from '../types/silat';
import { isOfflineNetworkError, isPermissionDeniedError } from '../utils/offlineSync';
import { computeRoundPointRecap, type RoundRecapRow } from '../utils/roundRecap';

type ChartMode = 'net' | 'cumulative' | 'breakdown';

function formatRecapValue(value: number, isJurus: boolean): string {
  if (isJurus) {
    return value.toFixed(2);
  }
  return String(Math.round(value));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
    payload?: RoundRecapRow;
  }>;
  label?: string;
  isJurus: boolean;
  blueLabel: string;
  redLabel: string;
}

function RecapChartTooltip({
  active,
  payload,
  label,
  isJurus,
  blueLabel,
  redLabel,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-xl bg-[#090314]/95 border border-purple-500/60 px-3.5 py-2.5 shadow-2xl text-xs min-w-[210px]">
      <div className="flex items-center justify-between gap-3 pb-1.5 mb-2 border-b border-purple-800/70">
        <span className="font-bold text-yellow-300">{label || row.label}</span>
        {row.isActiveRound && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            Ronde Aktif
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-sky-300 truncate max-w-[140px]">
              Biru · {blueLabel}
            </span>
            <span className="font-mono font-bold text-white tabular-nums">
              {formatRecapValue(row.blueNet, isJurus)} pts
            </span>
          </div>
          <div className="text-[11px] text-slate-300 font-mono tabular-nums flex items-center justify-between gap-2">
            <span>
              Teknik +{formatRecapValue(row.blueGross, isJurus)} · Hukum -
              {formatRecapValue(row.bluePenalties, isJurus)}
            </span>
            <span className="text-sky-200">
              Σ {formatRecapValue(row.blueCumulative, isJurus)}
            </span>
          </div>
        </div>

        <div className="space-y-0.5 pt-1.5 border-t border-purple-900/60">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-rose-300 truncate max-w-[140px]">
              Merah · {redLabel}
            </span>
            <span className="font-mono font-bold text-white tabular-nums">
              {formatRecapValue(row.redNet, isJurus)} pts
            </span>
          </div>
          <div className="text-[11px] text-slate-300 font-mono tabular-nums flex items-center justify-between gap-2">
            <span>
              Teknik +{formatRecapValue(row.redGross, isJurus)} · Hukum -
              {formatRecapValue(row.redPenalties, isJurus)}
            </span>
            <span className="text-rose-200">
              Σ {formatRecapValue(row.redCumulative, isJurus)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoundScoreRecapChart() {
  const {
    mode,
    user,
    isSuperAdmin,
    arena,
    matches,
    activeMatch,
    events,
    getMatchEvents,
    rtdbConnected,
    isOnline,
  } = useArena();

  const [selectedMatchId, setSelectedMatchId] = useState<string>(activeMatch.id);
  const [followActiveMatch, setFollowActiveMatch] = useState<boolean>(true);
  const [chartMode, setChartMode] = useState<ChartMode>('net');
  const [remoteMatchEvents, setRemoteMatchEvents] = useState<MatchEvent[] | null>(null);
  const [listenerStatus, setListenerStatus] = useState<'idle' | 'live' | 'fallback'>('idle');

  // Keep synced with activeMatch when auto-follow is enabled or if previously selected match was deleted
  useEffect(() => {
    const exists = matches.some((m) => m.id === selectedMatchId);
    if (followActiveMatch || !exists) {
      setSelectedMatchId(activeMatch.id);
    }
  }, [activeMatch.id, followActiveMatch, matches, selectedMatchId]);

  const selectedMatch: MatchData = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) || activeMatch,
    [matches, selectedMatchId, activeMatch]
  );

  const isInspectingActive = selectedMatch.id === activeMatch.id;

  // Direct Firestore real-time subscription when inspecting a non-active match
  useEffect(() => {
    if (isInspectingActive) {
      setRemoteMatchEvents(null);
      setListenerStatus('live');
      return;
    }

    const canQueryMatchEvents =
      mode === 'firebase' &&
      Boolean(user) &&
      (arena.ownerId === user?.uid || isSuperAdmin);

    if (!canQueryMatchEvents || !arena.id || !selectedMatch.id) {
      setRemoteMatchEvents(null);
      setListenerStatus('fallback');
      return;
    }

    setListenerStatus('live');
    const eventsQuery = query(
      collection(db, 'arenas', arena.id, 'matches', selectedMatch.id, 'events'),
      where('ownerId', '==', arena.ownerId),
      orderBy('createdAt', 'desc'),
      limit(500)
    );

    const unsub = onSnapshot(
      eventsQuery,
      (snap) => {
        setRemoteMatchEvents(snap.docs.map((d) => d.data() as MatchEvent));
        setListenerStatus('live');
      },
      (err) => {
        if (isOfflineNetworkError(err) || isPermissionDeniedError(err)) {
          setRemoteMatchEvents(null);
          setListenerStatus('fallback');
          return;
        }
        setRemoteMatchEvents(null);
        setListenerStatus('fallback');
      }
    );

    return () => unsub();
  }, [isInspectingActive, mode, user, isSuperAdmin, arena.id, arena.ownerId, selectedMatch.id]);

  const resolvedEvents = useMemo(() => {
    if (isInspectingActive) return events;
    if (remoteMatchEvents !== null) return remoteMatchEvents;
    return getMatchEvents(selectedMatch.id);
  }, [isInspectingActive, events, remoteMatchEvents, getMatchEvents, selectedMatch.id]);

  const recap = useMemo(
    () => computeRoundPointRecap(selectedMatch, resolvedEvents),
    [selectedMatch, resolvedEvents]
  );

  const syncSourceLabel = useMemo(() => {
    if (!isOnline) return 'Offline · Cache Lokal IndexedDB';
    if (mode === 'firebase') {
      return listenerStatus === 'live'
        ? 'Real-time · Cloud Firestore'
        : 'Cache · Cloud Firestore';
    }
    if (mode === 'rtdb') {
      return rtdbConnected ? 'Real-time · Firebase RTDB' : 'Menghubungkan · Firebase RTDB';
    }
    return 'Mode Lokal · Perangkat';
  }, [isOnline, mode, listenerStatus, rtdbConnected]);

  const blueShortName = selectedMatch.blueName || 'Sudut Biru';
  const redShortName = selectedMatch.redName || 'Sudut Merah';

  return (
    <section
      aria-label="Visualisasi Rekapitulasi Poin per Ronde"
      data-testid="round-recap-chart-section"
      className="rounded-2xl bg-[#0d051c]/90 border border-purple-700/60 p-4 sm:p-5 space-y-4"
    >
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-purple-800/60">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-yellow-300 shrink-0" />
            <h2 className="font-display text-lg font-bold text-yellow-300 leading-tight">
              Rekapitulasi Poin per Ronde
            </h2>
          </div>
          <p className="text-xs text-blue-200 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
              <Radio className="w-3 h-3 shrink-0" />
              <span>{syncSourceLabel}</span>
            </span>
            <span aria-hidden="true" className="text-purple-400">&middot;</span>
            <span className="font-mono text-white">
              {selectedMatch.matchNumber} (Gel. {selectedMatch.gelanggang || 'A'})
            </span>
            <span aria-hidden="true" className="text-purple-400">&middot;</span>
            <span className="truncate">{selectedMatch.weightClass}</span>
          </p>
        </div>

        {/* Controls: Match Selector + Chart Mode Segmented Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="recap-match-select" className="sr-only">
              Pilih Partai untuk Grafik Rekap Poin
            </label>
            <select
              id="recap-match-select"
              data-testid="recap-match-select"
              value={selectedMatch.id}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedMatchId(nextId);
                setFollowActiveMatch(nextId === activeMatch.id);
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

            {!isInspectingActive && (
              <button
                type="button"
                onClick={() => {
                  setFollowActiveMatch(true);
                  setSelectedMatchId(activeMatch.id);
                }}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-yellow-400/15 hover:bg-yellow-400/25 border border-yellow-400/50 text-[11px] font-semibold text-yellow-200 whitespace-nowrap cursor-pointer"
              >
                Ikuti Aktif
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Mode Grafik Poin"
            className="inline-flex rounded-lg bg-black/65 border border-purple-700/60 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'net'}
              onClick={() => setChartMode('net')}
              data-testid="chart-mode-net"
              className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                chartMode === 'net'
                  ? 'bg-yellow-400 text-black'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span>Per Ronde</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'cumulative'}
              onClick={() => setChartMode('cumulative')}
              data-testid="chart-mode-cumulative"
              className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                chartMode === 'cumulative'
                  ? 'bg-yellow-400 text-black'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>Akumulasi</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'breakdown'}
              onClick={() => setChartMode('breakdown')}
              data-testid="chart-mode-breakdown"
              className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                chartMode === 'breakdown'
                  ? 'bg-yellow-400 text-black'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Teknik &amp; Hukum</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Scoreboard Headline Strip (Flat Typographic Metrics, No Nested Boxes) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center py-2 px-3 rounded-xl bg-black/50 border border-purple-800/50">
        <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
              Sudut Biru
            </div>
            <div className="text-sm font-bold text-white truncate">{blueShortName}</div>
            <div className="text-[11px] text-blue-200/80 truncate">
              {selectedMatch.blueContingent}
            </div>
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-black text-sky-300 tabular-nums shrink-0">
            {formatRecapValue(recap.totalBlueNet, recap.isJurus)}
          </div>
        </div>

        <div className="text-center border-y sm:border-y-0 sm:border-x border-purple-800/50 py-1.5 sm:py-0 sm:px-3">
          <div className="text-[11px] uppercase tracking-wider text-yellow-300 font-semibold">
            {recap.isJurus ? 'Skor Penampilan Jurus' : `${recap.roundCount} Ronde`}
          </div>
          <div className="text-xs text-slate-200 font-mono tabular-nums mt-0.5">
            {recap.leadingCorner === 'tie'
              ? 'Skor Imbang'
              : `Unggul ${recap.leadingCorner === 'blue' ? 'Biru' : 'Merah'} (+${formatRecapValue(
                  recap.scoreDiff,
                  recap.isJurus
                )})`}
          </div>
          <div className="text-[11px] text-blue-300/80 mt-0.5">
            {recap.totalEvents > 0
              ? `${recap.totalEvents} kejadian poin tercatat`
              : 'Menunggu input poin ronde'}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 min-w-0">
          <div className="font-mono text-2xl sm:text-3xl font-black text-rose-300 tabular-nums shrink-0 sm:order-1">
            {formatRecapValue(recap.totalRedNet, recap.isJurus)}
          </div>
          <div className="min-w-0 sm:text-right sm:order-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-300">
              Sudut Merah
            </div>
            <div className="text-sm font-bold text-white truncate">{redShortName}</div>
            <div className="text-[11px] text-red-200/80 truncate">
              {selectedMatch.redContingent}
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Canvas */}
      <div className="w-full h-[270px] rounded-xl bg-black/45 border border-purple-800/45 pt-3 pr-3 pb-1 pl-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
          {chartMode === 'cumulative' ? (
            <AreaChart
              data={recap.rows}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="blueRecapGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.42} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="redRecapGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fb7185" stopOpacity={0.42} />
                  <stop offset="95%" stopColor="#fb7185" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.2)" />
              <XAxis
                dataKey="label"
                stroke="#cbd5e1"
                tick={{ fill: '#e2e8f0', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#cbd5e1"
                tick={{ fill: '#cbd5e1', fontSize: 11 }}
                tickLine={false}
                allowDecimals={recap.isJurus}
              />
              <ReferenceLine y={0} stroke="rgba(250, 204, 21, 0.35)" />
              <Tooltip
                content={
                  <RecapChartTooltip
                    isJurus={recap.isJurus}
                    blueLabel={blueShortName}
                    redLabel={redShortName}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }}
              />
              <Area
                type="monotone"
                dataKey="blueCumulative"
                name={`Akumulasi Biru (${blueShortName})`}
                stroke="#38bdf8"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#blueRecapGrad)"
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="redCumulative"
                name={`Akumulasi Merah (${redShortName})`}
                stroke="#fb7185"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#redRecapGrad)"
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : chartMode === 'breakdown' ? (
            <BarChart
              data={recap.rows}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.2)" />
              <XAxis
                dataKey="label"
                stroke="#cbd5e1"
                tick={{ fill: '#e2e8f0', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#cbd5e1"
                tick={{ fill: '#cbd5e1', fontSize: 11 }}
                tickLine={false}
                allowDecimals={recap.isJurus}
              />
              <Tooltip
                cursor={{ fill: 'rgba(147, 51, 234, 0.12)' }}
                content={
                  <RecapChartTooltip
                    isJurus={recap.isJurus}
                    blueLabel={blueShortName}
                    redLabel={redShortName}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
              <Bar
                dataKey="blueGross"
                name="Teknik/Jatuhan Biru (+)"
                fill="#38bdf8"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
              <Bar
                dataKey="bluePenalties"
                name="Hukuman Biru (-)"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Bar
                dataKey="redGross"
                name="Teknik/Jatuhan Merah (+)"
                fill="#fb7185"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
              <Bar
                dataKey="redPenalties"
                name="Hukuman Merah (-)"
                fill="#c084fc"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <BarChart
              data={recap.rows}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
              barGap={8}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.2)" />
              <XAxis
                dataKey="label"
                stroke="#cbd5e1"
                tick={{ fill: '#e2e8f0', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#cbd5e1"
                tick={{ fill: '#cbd5e1', fontSize: 11 }}
                tickLine={false}
                allowDecimals={recap.isJurus}
              />
              <ReferenceLine y={0} stroke="rgba(250, 204, 21, 0.4)" />
              <Tooltip
                cursor={{ fill: 'rgba(147, 51, 234, 0.12)' }}
                content={
                  <RecapChartTooltip
                    isJurus={recap.isJurus}
                    blueLabel={blueShortName}
                    redLabel={redShortName}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
              <Bar
                dataKey="blueNet"
                name={`Sudut Biru (${blueShortName})`}
                fill="#38bdf8"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
              <Bar
                dataKey="redNet"
                name={`Sudut Merah (${redShortName})`}
                fill="#fb7185"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Tabular Round Recapitulation */}
      <div className="overflow-x-auto rounded-xl border border-purple-800/55">
        <table className="w-full text-left text-xs">
          <thead className="bg-black/60 text-blue-200 border-b border-purple-800/55">
            <tr>
              <th className="px-3 py-2 font-semibold">Ronde</th>
              <th className="px-3 py-2 font-semibold text-sky-300">Biru · Teknik</th>
              <th className="px-3 py-2 font-semibold text-amber-300">Biru · Hukum</th>
              <th className="px-3 py-2 font-semibold text-sky-200">Biru · Ronde</th>
              <th className="px-3 py-2 font-semibold text-rose-300">Merah · Teknik</th>
              <th className="px-3 py-2 font-semibold text-purple-300">Merah · Hukum</th>
              <th className="px-3 py-2 font-semibold text-rose-200">Merah · Ronde</th>
              <th className="px-3 py-2 font-semibold text-right text-yellow-300">Akumulasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-900/45 font-mono tabular-nums">
            {recap.rows.map((row) => (
              <tr
                key={row.round}
                className={row.isActiveRound ? 'bg-purple-950/35' : 'bg-black/30'}
              >
                <td className="px-3 py-2 font-sans font-semibold text-white whitespace-nowrap">
                  <span>{row.label}</span>
                  {row.isActiveRound && (
                    <span className="ml-2 text-[10px] font-mono uppercase text-emerald-300">
                      Aktif
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-sky-200">
                  +{formatRecapValue(row.blueGross, recap.isJurus)}
                </td>
                <td className="px-3 py-2 text-amber-200">
                  -{formatRecapValue(row.bluePenalties, recap.isJurus)}
                </td>
                <td className="px-3 py-2 font-bold text-sky-300">
                  {formatRecapValue(row.blueNet, recap.isJurus)}
                </td>
                <td className="px-3 py-2 text-rose-200">
                  +{formatRecapValue(row.redGross, recap.isJurus)}
                </td>
                <td className="px-3 py-2 text-purple-200">
                  -{formatRecapValue(row.redPenalties, recap.isJurus)}
                </td>
                <td className="px-3 py-2 font-bold text-rose-300">
                  {formatRecapValue(row.redNet, recap.isJurus)}
                </td>
                <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                  <span className="text-sky-300">
                    {formatRecapValue(row.blueCumulative, recap.isJurus)}
                  </span>
                  <span className="text-slate-400 mx-1">:</span>
                  <span className="text-rose-300">
                    {formatRecapValue(row.redCumulative, recap.isJurus)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
