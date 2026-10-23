// Pure ranking logic, ported from the "2019 PR 10t, wPO" spreadsheet. No DOM / network.
// Rank convention follows Excel RANK(): ties share the best rank. Lower rank = better.

export const DEFAULT_WEIGHTS = {
  wins: null,        // null = auto: min(games*1.2, 3)
  overallWins: 1,
  recent: null,      // null = auto: 1.2 once 8 games are played, else 0
  consistency: null, // null = auto: 0 until 3 games played, else 1
  points: 1,
  roster: 1.5,
};
const SCORE_DIVISOR = 7; // from the spreadsheet; only scales the displayed score

export function rankDesc(values) {
  return values.map(v => 1 + values.filter(o => o > v).length);
}
export function rankAsc(values) {
  return values.map(v => 1 + values.filter(o => o < v).length);
}
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);
export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
}

export function resolveWeights(overrides, games) {
  const w = { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(overrides || {}).filter(([, v]) => v != null && v !== '')) };
  return {
    wins: w.wins ?? Math.min(games * 1.2, 3),
    overallWins: w.overallWins,
    recent: w.recent ?? (games >= 8 ? 1.2 : 0),
    consistency: w.consistency ?? (games >= 3 ? 1 : 0),
    points: w.points,
    roster: w.roster,
  };
}

/**
 * teams:      [{ id, name }]
 * weeks:      [{ week, results: { [teamId]: { points, win } } }]  win: 1 | 0.5 | 0 | null (bye)
 * rosterRank: { [teamId]: 1..N }   (1 = strongest roster)
 * Returns one row per team, sorted best power rank first.
 */
export function computeRankings({ teams, weeks, rosterRank, weights }) {
  const n = teams.length;
  const games = weeks.length;
  const w = resolveWeights(weights, games);

  const stats = teams.map(t => {
    const played = weeks.map(wk => wk.results[t.id]).filter(Boolean);
    const pts = played.map(r => r.points);
    const wins = sum(played.map(r => r.win ?? 0));
    const gp = played.filter(r => r.win != null).length;
    // overall wins: number of teams outscored each week (all-play record)
    let ovw = 0, ovl = 0;
    for (const wk of weeks) {
      const me = wk.results[t.id];
      if (!me) continue;
      for (const o of teams) {
        if (o.id === t.id || !wk.results[o.id]) continue;
        if (me.points > wk.results[o.id].points) ovw++;
        else if (me.points < wk.results[o.id].points) ovl++;
      }
    }
    const recent = sum(played.filter(r => r.win != null).slice(-5).map(r => r.win));
    return { team: t, pts, wins, gp, losses: gp - wins, ovw, ovl, recent, ppg: mean(pts), dev: stdev(pts), total: sum(pts) };
  });

  const leagueAvg = mean(stats.map(s => s.ppg));
  for (const s of stats) s.cons = s.pts.length >= 2 ? s.ppg - 3 * s.dev - 0.75 * leagueAvg : -99;

  const rWins = rankDesc(stats.map(s => s.wins));
  const rOvw = rankDesc(stats.map(s => s.ovw));
  const rRecent = rankDesc(stats.map(s => s.recent));
  const rCons = rankDesc(stats.map(s => s.cons));
  const rPpg = rankDesc(stats.map(s => s.ppg));

  const rows = stats.map((s, i) => {
    const rRoster = rosterRank[s.team.id] ?? n;
    const score = (rWins[i] * w.wins + rOvw[i] * w.overallWins + rRecent[i] * w.recent +
      rCons[i] * w.consistency + rPpg[i] * w.points + rRoster * w.roster) / SCORE_DIVISOR;
    return { ...s, id: s.team.id, name: s.team.name, rankWins: rWins[i], rankOvw: rOvw[i], rankRecent: rRecent[i],
      rankCons: rCons[i], rankPpg: rPpg[i], rankRoster: rRoster, score };
  });

  // Excel would share ranks on ties; break them (points scored, then roster) so the table is a strict order.
  rows.sort((a, b) => a.score - b.score || b.total - a.total || a.rankRoster - b.rankRoster);
  rows.forEach((r, i) => { r.powerRank = i + 1; });
  return rows;
}

/** Rankings now plus rankings one week earlier (with that week's roster ranks), to derive the Δ column. */
export function rankingsWithChange({ teams, weeks, rosterRank, prevRosterRank, weights }) {
  const current = computeRankings({ teams, weeks, rosterRank, weights });
  const prev = weeks.length > 0 ? computeRankings({ teams, weeks: weeks.slice(0, -1), rosterRank: prevRosterRank || rosterRank, weights }) : null;
  const prevRank = prev && Object.fromEntries(prev.map(r => [r.id, r.powerRank]));
  for (const r of current) r.change = prevRank ? prevRank[r.id] - r.powerRank : 0;
  return current;
}
