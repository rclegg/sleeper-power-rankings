import { rankingsWithChange, resolveWeights } from './engine.js';
import { playoffOdds } from './playoffOdds.js';
import { fantasyCalcUrl, valuesBySleeperId, rosterRanks } from './rosterStrength.js';
import { getState, getUser, getUserLeagues, loadLeague } from './sleeper.js';

const $ = id => document.getElementById(id);
const WEIGHT_FIELDS = [['wins', 'Record'], ['overallWins', 'Overall wins'], ['recent', 'Last 5'],
  ['consistency', 'Consistency'], ['points', 'Points'], ['roster', 'Roster']];

let state, data, values, custom, fcRanks, ranks, weights = {}, through;

const storeKey = () => `rosterRanks:${data.league.league_id}`;
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(storeKey())); } catch { return null; } };
const saveRanks = m => { try { m ? localStorage.setItem(storeKey(), JSON.stringify(m)) : localStorage.removeItem(storeKey()); } catch {} };

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

// Everything that shapes the view lives in the URL so a shared link reproduces it:
// week, manual roster order (team ids, best first) and any weight overrides.
function updateUrl() {
  if (!data) return;
  const p = { league: data.league.league_id };
  if (through !== data.weeks.length) p.week = through;
  if (custom) p.order = Object.entries(custom).sort((x, y) => x[1] - y[1]).map(e => e[0]).join('-');
  for (const [k] of WEIGHT_FIELDS) if (weights[k] != null) p['w_' + k] = weights[k];
  syncUrl(p);
}

function parseOrder(s) {
  const ids = (s || '').split('-').map(Number);
  const ok = ids.length === data.teams.length && new Set(ids).size === ids.length && data.teams.every(t => ids.includes(t.id));
  return ok ? Object.fromEntries(ids.map((id, i) => [id, i + 1])) : null;
}

async function open(leagueId, week, init = {}) {
  setStatus('Loading league…');
  data = await loadLeague(leagueId, state);
  setStatus('Valuing rosters…');
  const fc = await fetch(fantasyCalcUrl(data.league)).then(r => r.json());
  values = valuesBySleeperId(fc);
  const saved = loadSaved();
  custom = parseOrder(init.order) || (saved && data.teams.every(t => saved[t.id]) ? saved : null);
  weights = {};
  for (const [k] of WEIGHT_FIELDS) {
    const v = init.weights?.[k];
    weightInputs[k].value = '';
    if (v != null && v !== '' && +v >= 0) { weights[k] = +v; weightInputs[k].value = +v; weightInputs[k].classList.remove('auto'); }
  }
  through = week != null && week >= 0 && week <= data.weeks.length ? week : data.weeks.length;
  applyWeekRanks();
  $('title').textContent = `${data.league.name} — ${data.league.season}`;
  $('through').replaceChildren(...Array.from({ length: data.weeks.length + 1 }, (_, i) =>
    new Option(i === 0 ? 'Preseason' : `Week ${data.weeks[i - 1].week}`, i, i === through, i === through)));
  $('result').hidden = false;
  setStatus('');
  updateUrl();
  render();
}

// Roster ranks for "through week W" value the rosters as they stood in W's matchup data
// (preseason uses week 1's). Values are today's FantasyCalc values: Sleeper keeps no price history.
function ranksFor(w) {
  const snap = data.weeks[Math.max(w, 1) - 1]?.players;
  const rosters = data.rosters.map(r => ({ roster_id: r.roster_id, players: snap?.[r.roster_id] ?? r.players }));
  return rosterRanks(rosters, values, data.league.roster_positions);
}
function applyWeekRanks() {
  fcRanks = ranksFor(through);
  ranks = custom || { ...fcRanks };
  renderRankInputs();
}

function currentRows() {
  const weeks = data.weeks.slice(0, through);
  const rows = rankingsWithChange({ teams: data.teams, weeks, rosterRank: ranks, prevRosterRank: custom || (through > 0 ? ranksFor(through - 1) : null), weights });
  const remaining = [...data.weeks.slice(through), ...data.remaining]
    .filter(w => w.pairs.length);
  const odds = playoffOdds({ rows, remaining, playoffSpots: data.playoffSpots });
  rows.forEach(r => { r.odds = odds[r.id]; });
  return rows;
}

function renderRankInputs() {
  $('rankHint').textContent = custom ? 'Using your order.' : 'Prefilled from FantasyCalc values of each roster as of the selected week. Drag teams (or use the arrows) to match FantasyPros or your own order.';
  const list = $('rankList');
  const sorted = [...data.teams].sort((x, y) => ranks[x.id] - ranks[y.id]);
  list.replaceChildren(...sorted.map(t => {
    const li = document.createElement('li');
    li.dataset.id = t.id;
    li.innerHTML = `<span class="num"></span><span class="grip" title="Drag">⠿</span><span class="nm"></span>` +
      `<button type="button" class="mv" data-d="-1" aria-label="Move up">▲</button><button type="button" class="mv" data-d="1" aria-label="Move down">▼</button>`;
    li.querySelector('.nm').textContent = t.name;
    return li;
  }));
  numberList();
}
function numberList() {
  [...$('rankList').children].forEach((li, i) => { li.querySelector('.num').textContent = i + 1; });
}
function commitOrder() {
  ranks = custom = Object.fromEntries([...$('rankList').children].map((li, i) => [+li.dataset.id, i + 1]));
  saveRanks(ranks); numberList(); render(); updateUrl();
  $('rankHint').textContent = 'Using your order.';
}
(() => {
  const list = $('rankList');
  let drag = null;
  list.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grip')) return;
    drag = e.target.closest('li');
    drag.classList.add('dragging');
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', e => {
    if (!drag) return;
    const over = [...list.children].find(li => li !== drag && e.clientY >= li.getBoundingClientRect().top && e.clientY <= li.getBoundingClientRect().bottom);
    if (!over) return;
    const mid = over.getBoundingClientRect().top + over.offsetHeight / 2;
    list.insertBefore(drag, e.clientY < mid ? over : over.nextSibling);
    numberList();
  });
  const end = () => { if (!drag) return; drag.classList.remove('dragging'); drag = null; commitOrder(); };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  list.addEventListener('click', e => {
    const b = e.target.closest('.mv'); if (!b) return;
    const li = b.closest('li'), d = +b.dataset.d;
    if (d < 0 && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    else if (d > 0 && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    else return;
    commitOrder();
  });
})();
$('rankReset').addEventListener('click', () => { custom = null; saveRanks(null); applyWeekRanks(); render(); updateUrl(); });

const COLS = [
  ['Team', r => r.name, 'team'], ['Power Rank', r => `#${r.powerRank}`, 'rank'], ['Δ', r => r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${-r.change}` : '–', r => r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''],
  ['PO Odds', r => `${Math.round(r.odds * 100)}%`], ['Record', r => `${r.wins}-${r.losses}`],
  ['Overall', r => `${r.ovw}-${r.ovl}`], ['Cons', r => `#${r.rankCons}`],
  ['PPG', r => `#${r.rankPpg}, ${Math.round(r.ppg)}`], ['ROS Roster', r => `#${r.rankRoster}`],
  ['Score', r => r.score.toFixed(2), 'score'],
];
let lastRows = [];

function render() {
  showWeights();
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
  through = +e.target.value; applyWeekRanks(); render();
  updateUrl();
});
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); setStatus('Link copied.'); }
  catch { setStatus(location.href); }
});
const weightInputs = {};
$('weights').replaceChildren(...WEIGHT_FIELDS.map(([k, label]) => {
  const l = document.createElement('label'), i = document.createElement('input');
  i.type = 'number'; i.step = '0.1'; i.min = '0'; i.style.minWidth = '0'; i.className = 'auto';
  i.oninput = () => {
    weights[k] = i.value === '' ? null : +i.value;
    i.classList.toggle('auto', weights[k] == null);
    if (data) { render(); updateUrl(); }
  };
  weightInputs[k] = i;
  l.append(label, i); return l;
}));
// Show the weight actually in use; untouched fields follow the week (e.g. last-5 switches on at week 8).
function showWeights() {
  const eff = resolveWeights(weights, through ?? 0);
  for (const [k] of WEIGHT_FIELDS) {
    const i = weightInputs[k];
    if (weights[k] == null) { i.value = +eff[k].toFixed(2); i.classList.add('auto'); }
  }
}
$('weightReset').addEventListener('click', () => {
  weights = {};
  for (const k in weightInputs) weightInputs[k].value = '';
  showWeights(); if (data) { render(); updateUrl(); }
});

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
  getState().then(s => { state = s; return open(params.get('league'), params.has('week') ? +params.get('week') : null, {
    order: params.get('order'),
    weights: Object.fromEntries(WEIGHT_FIELDS.map(([k]) => [k, params.get('w_' + k)])),
  }); })
    .catch(err => setStatus(err.message, true));
} else if (params.get('user')) {
  $('q').value = params.get('user');
  $('form').requestSubmit();
}
