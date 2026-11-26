import type { MatchData, MatchEvent } from '../types/silat';
import { isJurusMatch } from './ipsiRules';

export interface RoundRecapRow {
  round: number;
  label: string;
  shortLabel: string;
  // Tanding / Jurus normalized display values (integer pts for Tanding, decimal 0.00-10.00 for Jurus)
  blueNet: number;
  redNet: number;
  blueCumulative: number;
  redCumulative: number;
  blueGross: number;
  redGross: number;
  bluePenalties: number; // Positive magnitude of deducted points
  redPenalties: number; // Positive magnitude of deducted points
  bluePunchPts: number;
  blueKickPts: number;
  blueFallPts: number;
  redPunchPts: number;
  redKickPts: number;
  redFallPts: number;
  blueActionCount: number;
  redActionCount: number;
  eventCount: number;
  isActiveRound: boolean;
}

export interface RoundRecapSummary {
  isJurus: boolean;
  roundCount: number;
  hasEventTimeline: boolean;
  rows: RoundRecapRow[];
  totalBlueNet: number;
  totalRedNet: number;
  totalBlueGross: number;
  totalRedGross: number;
  totalBluePenalties: number;
  totalRedPenalties: number;
  totalEvents: number;
  leadingCorner: 'blue' | 'red' | 'tie';
  scoreDiff: number;
}

const PENALTY_EVENT_TYPES = new Set([
  'teguran1',
  'teguran2',
  'peringatan1',
  'peringatan2',
]);

const FALL_EVENT_TYPES = new Set(['fall', 'cancel_fall']);

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function getEffectiveTandingRoundCount(match: MatchData, validEvents: MatchEvent[]): number {
  const configured = match.totalRounds === 2 ? 2 : 3;
  const maxEventRound = validEvents.reduce((acc, ev) => {
    const r = Number.isFinite(ev.round) ? Math.round(ev.round) : 1;
    return Math.max(acc, r);
  }, 1);
  return Math.min(3, Math.max(configured, match.currentRound || 1, maxEventRound));
}

export function computeRoundPointRecap(
  match: MatchData,
  events: MatchEvent[] = []
): RoundRecapSummary {
  const isJurus = isJurusMatch(match);

  if (isJurus) {
    const validJurusEvents = events.filter(
      (ev) => ev && !ev.undone && ev.type !== 'judge_press'
    );
    const bluePenaltyHundredths = validJurusEvents
      .filter((ev) => ev.corner === 'blue' && ev.type === 'jurus_penalty')
      .reduce((acc, ev) => acc + Math.max(0, -ev.pointsDelta), 0);
    const redPenaltyHundredths = validJurusEvents
      .filter((ev) => ev.corner === 'red' && ev.type === 'jurus_penalty')
      .reduce((acc, ev) => acc + Math.max(0, -ev.pointsDelta), 0);

    const blueNet = roundToTwo((match.blueScore || 0) / 100);
    const redNet = roundToTwo((match.redScore || 0) / 100);
    const bluePen = roundToTwo(bluePenaltyHundredths / 100);
    const redPen = roundToTwo(redPenaltyHundredths / 100);
    const blueGross = roundToTwo(blueNet + bluePen);
    const redGross = roundToTwo(redNet + redPen);

    const row: RoundRecapRow = {
      round: 1,
      label: 'Babak Jurus',
      shortLabel: 'Jurus',
      blueNet,
      redNet,
      blueCumulative: blueNet,
      redCumulative: redNet,
      blueGross,
      redGross,
      bluePenalties: bluePen,
      redPenalties: redPen,
      bluePunchPts: 0,
      blueKickPts: 0,
      blueFallPts: 0,
      redPunchPts: 0,
      redKickPts: 0,
      redFallPts: 0,
      blueActionCount: validJurusEvents.filter((ev) => ev.corner === 'blue').length,
      redActionCount: validJurusEvents.filter((ev) => ev.corner === 'red').length,
      eventCount: validJurusEvents.length,
      isActiveRound: match.status !== 'finished',
    };

    const leadingCorner =
      blueNet > redNet ? 'blue' : redNet > blueNet ? 'red' : 'tie';

    return {
      isJurus: true,
      roundCount: 1,
      hasEventTimeline: validJurusEvents.length > 0,
      rows: [row],
      totalBlueNet: blueNet,
      totalRedNet: redNet,
      totalBlueGross: blueGross,
      totalRedGross: redGross,
      totalBluePenalties: bluePen,
      totalRedPenalties: redPen,
      totalEvents: validJurusEvents.length,
      leadingCorner,
      scoreDiff: roundToTwo(Math.abs(blueNet - redNet)),
    };
  }

  const scoringEvents = events.filter(
    (ev) =>
      ev &&
      !ev.undone &&
      ev.type !== 'judge_press' &&
      ev.type !== 'winner' &&
      ev.type !== 'official_protest' &&
      !ev.type.startsWith('verifikasi_')
  );

  const roundCount = getEffectiveTandingRoundCount(match, scoringEvents);
  const rows: RoundRecapRow[] = Array.from({ length: roundCount }, (_, idx) => {
    const roundNum = idx + 1;
    return {
      round: roundNum,
      label: `Ronde ${roundNum}`,
      shortLabel: `R${roundNum}`,
      blueNet: 0,
      redNet: 0,
      blueCumulative: 0,
      redCumulative: 0,
      blueGross: 0,
      redGross: 0,
      bluePenalties: 0,
      redPenalties: 0,
      bluePunchPts: 0,
      blueKickPts: 0,
      blueFallPts: 0,
      redPunchPts: 0,
      redKickPts: 0,
      redFallPts: 0,
      blueActionCount: 0,
      redActionCount: 0,
      eventCount: 0,
      isActiveRound: match.status !== 'finished' && (match.currentRound || 1) === roundNum,
    };
  });

  const hasGranularScoreEvents = scoringEvents.some(
    (ev) => ev.pointsDelta !== 0 || ev.type === 'binaan' || ev.type === 'binaan1' || ev.type === 'binaan2'
  );

  if (hasGranularScoreEvents) {
    for (const ev of scoringEvents) {
      const roundIdx = Math.min(
        roundCount - 1,
        Math.max(0, (Number.isFinite(ev.round) ? Math.round(ev.round) : 1) - 1)
      );
      const row = rows[roundIdx];
      row.eventCount += 1;

      if (ev.corner !== 'blue' && ev.corner !== 'red') {
        continue;
      }

      const isBlue = ev.corner === 'blue';
      const delta = Number.isFinite(ev.pointsDelta) ? ev.pointsDelta : 0;

      if (isBlue) {
        row.blueActionCount += 1;
        row.blueNet += delta;
        if (PENALTY_EVENT_TYPES.has(ev.type) || (delta < 0 && !FALL_EVENT_TYPES.has(ev.type))) {
          row.bluePenalties += Math.abs(delta);
        } else {
          row.blueGross += delta;
          if (ev.type === 'punch') row.bluePunchPts += delta;
          else if (ev.type === 'kick') row.blueKickPts += delta;
          else if (FALL_EVENT_TYPES.has(ev.type)) row.blueFallPts += delta;
        }
      } else {
        row.redActionCount += 1;
        row.redNet += delta;
        if (PENALTY_EVENT_TYPES.has(ev.type) || (delta < 0 && !FALL_EVENT_TYPES.has(ev.type))) {
          row.redPenalties += Math.abs(delta);
        } else {
          row.redGross += delta;
          if (ev.type === 'punch') row.redPunchPts += delta;
          else if (ev.type === 'kick') row.redKickPts += delta;
          else if (FALL_EVENT_TYPES.has(ev.type)) row.redFallPts += delta;
        }
      }
    }
  } else if (
    match.blueScore !== 0 ||
    match.redScore !== 0 ||
    match.bluePunches > 0 ||
    match.redPunches > 0 ||
    match.blueKicks > 0 ||
    match.redKicks > 0 ||
    match.blueFalls > 0 ||
    match.redFalls > 0
  ) {
    // Fallback when viewing an aggregate/imported match without granular event docs
    const fallbackIdx = Math.min(roundCount - 1, Math.max(0, (match.currentRound || 1) - 1));
    const row = rows[fallbackIdx];

    row.bluePunchPts = Math.max(0, match.bluePunches || 0);
    row.blueKickPts = Math.max(0, match.blueKicks || 0) * 2;
    row.blueFallPts = Math.max(0, match.blueFalls || 0) * 3;
    row.blueGross = row.bluePunchPts + row.blueKickPts + row.blueFallPts;
    row.bluePenalties = Math.max(0, row.blueGross - (match.blueScore || 0));
    row.blueNet = match.blueScore || 0;

    row.redPunchPts = Math.max(0, match.redPunches || 0);
    row.redKickPts = Math.max(0, match.redKicks || 0) * 2;
    row.redFallPts = Math.max(0, match.redFalls || 0) * 3;
    row.redGross = row.redPunchPts + row.redKickPts + row.redFallPts;
    row.redPenalties = Math.max(0, row.redGross - (match.redScore || 0));
    row.redNet = match.redScore || 0;
  }

  let runningBlue = 0;
  let runningRed = 0;
  let totalBlueNet = 0;
  let totalRedNet = 0;
  let totalBlueGross = 0;
  let totalRedGross = 0;
  let totalBluePenalties = 0;
  let totalRedPenalties = 0;
  let totalEvents = 0;

  for (const row of rows) {
    row.blueGross = Math.max(0, row.blueGross);
    row.redGross = Math.max(0, row.redGross);
    row.blueFallPts = Math.max(0, row.blueFallPts);
    row.redFallPts = Math.max(0, row.redFallPts);

    runningBlue += row.blueNet;
    runningRed += row.redNet;
    row.blueCumulative = runningBlue;
    row.redCumulative = runningRed;

    totalBlueNet += row.blueNet;
    totalRedNet += row.redNet;
    totalBlueGross += row.blueGross;
    totalRedGross += row.redGross;
    totalBluePenalties += row.bluePenalties;
    totalRedPenalties += row.redPenalties;
    totalEvents += row.eventCount;
  }

  const leadingCorner =
    totalBlueNet > totalRedNet ? 'blue' : totalRedNet > totalBlueNet ? 'red' : 'tie';

  return {
    isJurus: false,
    roundCount,
    hasEventTimeline: hasGranularScoreEvents,
    rows,
    totalBlueNet,
    totalRedNet,
    totalBlueGross,
    totalRedGross,
    totalBluePenalties,
    totalRedPenalties,
    totalEvents,
    leadingCorner,
    scoreDiff: Math.abs(totalBlueNet - totalRedNet),
  };
}
