// Thin wrapper over the public Sleeper API (no auth, CORS-enabled).
const BASE = 'https://api.sleeper.app/v1';

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Sleeper ${res.status} for ${path}`);
  return res.json();
}

export const getState = () => get('/state/nfl');
export const getUser = name => get(`/user/${encodeURIComponent(name)}`);
export const getUserLeagues = (userId, season) => get(`/user/${userId}/leagues/nfl/${season}`);
export const getLeague = id => get(`/league/${id}`);

/** Everything the engine needs for one league, as plain objects. */
export async function loadLeague(leagueId, state) {
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId), get(`/league/${leagueId}/rosters`), get(`/league/${leagueId}/users`),
  ]);
  const userById = Object.fromEntries(users.map(u => [u.user_id, u]));
  const teams = rosters.map(r => {
    const u = userById[r.owner_id];
    return { id: r.roster_id, name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}` };
  });

  const lastRegular = (league.settings.playoff_week_start || 15) - 1;
  const live = league.season === state.season && state.season_type === 'regular';
  // an in-progress week isn't final, so only count weeks before the current one
  const lastDone = Math.min(lastRegular, live ? state.week - 1 : lastRegular);
  const wkNums = Array.from({ length: lastRegular }, (_, i) => i + 1);
  const raw = await Promise.all(wkNums.map(w => get(`/league/${leagueId}/matchups/${w}`)));

  const weeks = [], remaining = [];
  raw.forEach((entries, i) => {
    const week = i + 1;
    const groups = {};
    for (const e of entries) if (e.matchup_id != null) (groups[e.matchup_id] ||= []).push(e);
    const pairs = Object.values(groups).filter(g => g.length === 2);
    if (week <= lastDone && pairs.length && pairs.some(g => g.some(e => e.points > 0))) {
      const results = {};
      for (const [a, b] of pairs) {
        const win = a.points > b.points ? 1 : a.points < b.points ? 0 : 0.5;
        results[a.roster_id] = { points: a.points, win };
        results[b.roster_id] = { points: b.points, win: 1 - win };
      }
      weeks.push({ week, results, pairs: pairs.map(g => [g[0].roster_id, g[1].roster_id]) });
    } else {
      remaining.push({ week, pairs: pairs.map(g => [g[0].roster_id, g[1].roster_id]) });
    }
  });

  return { league, rosters, teams, weeks, remaining, playoffSpots: league.settings.playoff_teams || 6 };
}
