// Column definitions for the rankings table, shared by the on-screen table and the PNG export.
// Each column is [header, cell text, optional CSS class (string, or function of the row)].
export const COLS = [
  ['Team', r => r.name, 'team'],
  ['Power Rank', r => `#${r.powerRank}`, 'rank'],
  ['Δ', r => r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${-r.change}` : '–', r => r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''],
  ['PO Odds', r => `${Math.round(r.odds * 100)}%`],
  ['Record', r => `${r.wins}-${r.losses}`],
  ['Overall', r => `${r.ovw}-${r.ovl}`],
  ['Cons', r => `#${r.rankCons}`],
  ['PPG', r => `#${r.rankPpg}, ${Math.round(r.ppg)}`],
  ['ROS Roster', r => `#${r.rankRoster}`],
  ['Score', r => r.score.toFixed(2), 'score'],
];

export const cellClass = (col, row) => (typeof col[2] === 'function' ? col[2](row) : col[2] || '');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderTable(table, rows) {
  const head = `<tr>${COLS.map(c => `<th>${c[0]}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr>${COLS.map(c => `<td class="${cellClass(c, r)}">${esc(c[1](r))}</td>`).join('')}</tr>`).join('');
  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
}
