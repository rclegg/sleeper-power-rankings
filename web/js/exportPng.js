import { COLS, cellClass } from './table.js';

// Draws the rankings table onto a canvas and downloads it as a PNG.
const ROW_H = 34;
const COL_W = [220, 90, 60, 80, 80, 80, 70, 110, 100, 70];

export function downloadPng(title, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = COL_W.reduce((a, b) => a + b, 0);
  canvas.height = ROW_H * (rows.length + 2);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.textBaseline = 'middle';
  g.font = 'bold 15px system-ui'; g.fillStyle = '#111';
  g.fillText(`${title} — Power Rankings`, 10, ROW_H / 2);

  // cells: [text, css class] per column; the rank column (index 1) is bold.
  const drawRow = (cells, y, isHeader) => {
    if (isHeader) { g.fillStyle = '#2b2b33'; g.fillRect(0, y, canvas.width, ROW_H); }
    let x = 0;
    cells.forEach(([text, cls], i) => {
      g.fillStyle = isHeader ? '#fff' : cls === 'up' ? '#1a9a3c' : cls === 'down' ? '#d12a2a' : '#111';
      g.font = `${isHeader || i === 1 ? 'bold ' : ''}13px system-ui`;
      g.textAlign = i === 0 ? 'left' : 'center';
      g.fillText(text, i === 0 ? x + 10 : x + COL_W[i] / 2, y + ROW_H / 2);
      x += COL_W[i];
    });
    if (!isHeader) { g.fillStyle = '#e2e2e8'; g.fillRect(0, y + ROW_H - 1, canvas.width, 1); }
  };
  drawRow(COLS.map(c => [c[0]]), ROW_H, true);
  rows.forEach((r, i) => drawRow(COLS.map(c => [c[1](r), cellClass(c, r)]), ROW_H * (i + 2), false));

  const a = document.createElement('a');
  a.download = 'power-rankings.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}
