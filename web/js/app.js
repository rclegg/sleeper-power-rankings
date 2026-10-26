// UI controller: loads a league, keeps the view state (week, roster order, weights) in sync with the URL, and renders.
import { rankingsWithChange, resolveWeights } from './engine.js';
import { playoffOdds } from './playoffOdds.js';
import { fantasyCalcUrl, valuesBySleeperId, rosterRanks } from './rosterStrength.js';
import { getState, getUser, getUserLeagues, loadLeague } from './sleeper.js';
import { renderTable } from './table.js';
import { downloadPng } from './exportPng.js';
import { fillRankList, readRankList, initRankList } from './rankList.js';

const $ = id => document.getElementById(id);
const WEIGHT_FIELDS = [['wins', 'Record'], ['overallWins', 'Overall wins'], ['recent', 'Last 5'],
  ['consistency', 'Consistency'], ['points', 'Points'], ['roster', 'Roster']];

let state, data, values, custom, fcRanks, ranks, weights = {}, through;

// Manual roster order is remembered per league in localStorage.
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
  fillRankList($('rankList'), data.teams, ranks);
}
initRankList($('rankList'), () => {
  ranks = custom = readRankList($('rankList'));
  saveRanks(ranks); render(); updateUrl();
  $('rankHint').textContent = 'Using your order.';
});
$('rankReset').addEventListener('click', () => { custom = null; saveRanks(null); applyWeekRanks(); render(); updateUrl(); });

let lastRows = [];

function render() {
  showWeights();
  lastRows = currentRows();
  renderTable($('table'), lastRows);
  $('notes').textContent = 'Roster strength uses FantasyCalc trade values (best starting lineup plus 20% of bench). ' +
    'Playoff odds are simulated from remaining schedule and scoring history.';
}

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

$('png').addEventListener('click', () => downloadPng(data.league.name, lastRows));

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
