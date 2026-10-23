import { rankingsWithChange } from './engine.js';
import { playoffOdds } from './playoffOdds.js';
import { fantasyCalcUrl, valuesBySleeperId, rosterRanks } from './rosterStrength.js';
import { getState, getUser, getUserLeagues, loadLeague } from './sleeper.js';

const $ = id => document.getElementById(id);
const WEIGHT_FIELDS = [['wins', 'Record'], ['overallWins', 'Overall wins'], ['recent', 'Last 5'],
  ['consistency', 'Consistency'], ['points', 'Points'], ['roster', 'Roster']];

let state, data, ranks, weights = {}, through;

const setStatus = (msg, err = false) => { $('status').textContent = msg; $('status').className = err ? 'err' : ''; };

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('q').value.trim();
  $('result').hidden = true; $('leagues').hidden = true;
  try {
    setStatus('Loading…');
    state ||= await getState();
    if (/^\d{8,}$/.test(q)) return await open(q);
    const user = await getUser(q);
    if (!user?.user_id) throw new Error('User not found');
    const leagues = await getUserLeagues(user.user_id, state.league_season);
    if (!leagues.length) throw new Error(`No ${state.league_season} leagues for ${q}`);
    $('leagues').replaceChildren(...leagues.map(l => {
      const b = document.createElement('button');
      b.textContent = l.name; b.type = 'button';
      b.onclick = () => open(l.league_id).catch(err => setStatus(err.message, true));
      return b;
    }));
    $('leagues').hidden = false;
    syncUrl({ user: q });
    setStatus('Pick a league.');
  } catch (err) { setStatus(err.message, true); }
});

function syncUrl(params) {
  const p = new URLSearchParams(params);
  history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
}

async function open(leagueId, week) {
  setStatus('Loading league…');
  data = await loadLeague(leagueId, state);
  setStatus('Valuing rosters…');
  const fc = await fetch(fantasyCalcUrl(data.league)).then(r => r.json());
  ranks = rosterRanks(data.rosters, valuesBySleeperId(fc), data.league.roster_positions);
  through = week != null && week >= 0 && week <= data.weeks.length ? week : data.weeks.length;
  $('title').textContent = `${data.league.name} — ${data.league.season}`;
  $('through').replaceChildren(...Array.from({ length: data.weeks.length + 1 }, (_, i) =>
    new Option(i === 0 ? 'Preseason' : `Week ${data.weeks[i - 1].week}`, i, i === through, i === through)));
  $('result').hidden = false;
  setStatus('');
  syncUrl(through === data.weeks.length ? { league: leagueId } : { league: leagueId, week: through });
  render();
}

function currentRows() {
  const weeks = data.weeks.slice(0, through);
  const rows = rankingsWithChange({ teams: data.teams, weeks, rosterRank: ranks, weights });
  const remaining = [...data.weeks.slice(through), ...data.remaining]
    .filter(w => w.pairs.length);
  const odds = playoffOdds({ rows, remaining, playoffSpots: data.playoffSpots });
  rows.forEach(r => { r.odds = odds[r.id]; });
  return rows;
}

const COLS = [
  ['Team', r => r.name, 'team'], ['Power Rank', r => `#${r.powerRank}`, 'rank'], ['Δ', r => r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${-r.change}` : '–', r => r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''],
  ['PO Odds', r => `${Math.round(r.odds * 100)}%`], ['Record', r => `${r.wins}-${r.losses}`],
  ['Overall', r => `${r.ovw}-${r.ovl}`], ['Cons', r => `#${r.rankCons}`],
  ['PPG', r => `#${r.rankPpg}, ${Math.round(r.ppg)}`], ['ROS Roster', r => `#${r.rankRoster}`],
  ['Score', r => r.score.toFixed(2), 'score'],
];
let lastRows = [];

function render() {
  lastRows = currentRows();
  const thead = `<tr>${COLS.map(c => `<th>${c[0]}</th>`).join('')}</tr>`;
  const body = lastRows.map(r => `<tr>${COLS.map(([, f, cls]) => {
    const c = typeof cls === 'function' ? cls(r) : cls || '';
    return `<td class="${c}">${esc(f(r))}</td>`;
  }).join('')}</tr>`).join('');
  $('table').innerHTML = `<thead>${thead}</thead><tbody>${body}</tbody>`;
  $('notes').textContent = 'Roster strength uses FantasyCalc trade values (best starting lineup plus 20% of bench). ' +
    'Playoff odds are simulated from remaining schedule and scoring history.';
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('through').addEventListener('change', e => {
  through = +e.target.value; render();
  syncUrl(through === data.weeks.length ? { league: data.league.league_id } : { league: data.league.league_id, week: through });
});
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); setStatus('Link copied.'); }
  catch { setStatus(location.href); }
});
$('weights').replaceChildren(...WEIGHT_FIELDS.map(([k, label]) => {
  const l = document.createElement('label'), i = document.createElement('input');
  i.type = 'number'; i.step = '0.1'; i.min = '0'; i.placeholder = 'auto'; i.style.minWidth = '0';
  i.oninput = () => { weights[k] = i.value === '' ? null : +i.value; if (data) render(); };
  l.append(label, i); return l;
}));

$('png').addEventListener('click', () => {
  const rowH = 34, colW = [220, 90, 60, 80, 80, 80, 70, 110, 100, 70];
  const c = document.createElement('canvas');
  c.width = colW.reduce((a, b) => a + b, 0); c.height = rowH * (lastRows.length + 2);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.font = 'bold 15px system-ui'; g.fillStyle = '#111'; g.textBaseline = 'middle';
  g.fillText(`${data.league.name} — Power Rankings`, 10, rowH / 2);
  const draw = (cells, y, head) => {
    if (head) { g.fillStyle = '#2b2b33'; g.fillRect(0, y, c.width, rowH); }
    let x = 0;
    cells.forEach(([t, cls], i) => {
      g.fillStyle = head ? '#fff' : cls === 'up' ? '#1a9a3c' : cls === 'down' ? '#d12a2a' : '#111';
      g.font = `${head || i === 1 ? 'bold ' : ''}13px system-ui`;
      g.textAlign = i === 0 ? 'left' : 'center';
      g.fillText(t, i === 0 ? x + 10 : x + colW[i] / 2, y + rowH / 2); x += colW[i];
    });
    if (!head) { g.fillStyle = '#e2e2e8'; g.fillRect(0, y + rowH - 1, c.width, 1); }
  };
  draw(COLS.map(col => [col[0]]), rowH, true);
  lastRows.forEach((r, i) => draw(COLS.map(([, f, cls]) => [f(r), typeof cls === 'function' ? cls(r) : cls]), rowH * (i + 2), false));
  const a = document.createElement('a');
  a.download = 'power-rankings.png'; a.href = c.toDataURL('image/png'); a.click();
});

const params = new URLSearchParams(location.search);
if (params.get('league')) {
  $('q').value = params.get('league');
  getState().then(s => { state = s; return open(params.get('league'), params.has('week') ? +params.get('week') : null); })
    .catch(err => setStatus(err.message, true));
} else if (params.get('user')) {
  $('q').value = params.get('user');
  $('form').requestSubmit();
}
