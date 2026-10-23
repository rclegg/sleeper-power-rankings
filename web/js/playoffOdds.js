// Monte Carlo playoff odds from the remaining schedule. The spreadsheet took these from FantasyPros;
// Sleeper doesn't publish them, so we simulate: each team scores ~ Normal(its mean, its stdev).

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * rows:      output of computeRankings (needs id, wins, total, pts, ppg, dev)
 * remaining: [{ week, pairs: [[idA, idB], ...] }]
 * Returns { [teamId]: probability 0..1 }
 */
export function playoffOdds({ rows, remaining, playoffSpots, sims = 5000 }) {
  const out = Object.fromEntries(rows.map(r => [r.id, 0]));
  if (!rows.length) return out;
  const leaguePpg = rows.reduce((s, r) => s + r.ppg, 0) / rows.length || 100;
  const dist = Object.fromEntries(rows.map(r => {
    const k = r.pts.length;
    // shrink toward league-wide values while the sample is small
    const mu = (r.ppg * k + leaguePpg * 3) / (k + 3);
    const sd = Math.max((r.dev * k + leaguePpg * 0.18 * 3) / (k + 3), leaguePpg * 0.08);
    return [r.id, { mu, sd }];
  }));
  if (!remaining.length) {
    const order = [...rows].sort((a, b) => b.wins - a.wins || b.total - a.total);
    order.slice(0, playoffSpots).forEach(r => { out[r.id] = 1; });
    return out;
  }
  for (let s = 0; s < sims; s++) {
    const wins = {}, pf = {};
    for (const r of rows) { wins[r.id] = r.wins; pf[r.id] = r.total; }
    for (const wk of remaining) {
      for (const [a, b] of wk.pairs) {
        const pa = dist[a].mu + dist[a].sd * gaussian();
        const pb = dist[b].mu + dist[b].sd * gaussian();
        pf[a] += pa; pf[b] += pb;
        if (pa > pb) wins[a]++; else wins[b]++;
      }
    }
    rows.map(r => r.id).sort((x, y) => wins[y] - wins[x] || pf[y] - pf[x])
      .slice(0, playoffSpots).forEach(id => { out[id]++; });
  }
  for (const id in out) out[id] /= sims;
  return out;
}
