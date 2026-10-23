// Stand-in for the spreadsheet's FantasyPros roster rankings: value each roster with FantasyCalc
// trade values (keyed by Sleeper player id), summing the best starting lineup plus a bit of bench.

const BENCH_WEIGHT = 0.2;
const FLEX_SLOTS = {
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

export function fantasyCalcUrl(league) {
  const slots = league.roster_positions || [];
  const numQbs = slots.includes('SUPER_FLEX') ? 2 : 1;
  const ppr = league.scoring_settings?.rec ?? 1;
  const isDynasty = league.settings?.type === 2;
  return `https://api.fantasycalc.com/values/current?isDynasty=${isDynasty}&numQbs=${numQbs}&numTeams=${league.total_rosters}&ppr=${ppr}`;
}

export function valuesBySleeperId(fcPlayers) {
  const m = {};
  for (const p of fcPlayers) if (p.player?.sleeperId) m[p.player.sleeperId] = { value: p.value, pos: p.player.position };
  return m;
}

export function rosterValue(playerIds, values, rosterPositions) {
  const pool = (playerIds || []).map(id => values[id]).filter(Boolean).sort((a, b) => b.value - a.value);
  const used = new Set();
  let total = 0;
  const take = allowed => {
    const i = pool.findIndex((p, idx) => !used.has(idx) && allowed.includes(p.pos));
    if (i >= 0) { used.add(i); total += pool[i].value; }
  };
  const slots = (rosterPositions || []).filter(s => s !== 'BN' && s !== 'IR' && s !== 'TAXI');
  // fill dedicated slots before flexes so flexes take the leftovers
  slots.filter(s => !FLEX_SLOTS[s]).forEach(s => take([s]));
  slots.filter(s => FLEX_SLOTS[s]).forEach(s => take(FLEX_SLOTS[s]));
  pool.forEach((p, idx) => { if (!used.has(idx)) total += p.value * BENCH_WEIGHT; });
  return total;
}

/** -> { [rosterId]: rank (1 = strongest) } */
export function rosterRanks(rosters, values, rosterPositions) {
  const scored = rosters.map(r => ({ id: r.roster_id, v: rosterValue(r.players, values, rosterPositions) }));
  scored.sort((a, b) => b.v - a.v);
  return Object.fromEntries(scored.map((s, i) => [s.id, i + 1]));
}
