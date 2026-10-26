// The "Roster ranks" list: drag a team by its grip, or use the ▲/▼ buttons, to set a manual order.

const rowHtml = `<span class="num"></span><span class="grip" title="Drag">⠿</span><span class="nm"></span>` +
  `<button type="button" class="mv" data-d="-1" aria-label="Move up">▲</button>` +
  `<button type="button" class="mv" data-d="1" aria-label="Move down">▼</button>`;

const numberRows = list => {
  [...list.children].forEach((li, i) => { li.querySelector('.num').textContent = i + 1; });
};

/** Fills the list with teams ordered by `ranks` ({teamId: rank}). */
export function fillRankList(list, teams, ranks) {
  const sorted = [...teams].sort((x, y) => ranks[x.id] - ranks[y.id]);
  list.replaceChildren(...sorted.map(t => {
    const li = document.createElement('li');
    li.dataset.id = t.id;
    li.innerHTML = rowHtml;
    li.querySelector('.nm').textContent = t.name;
    return li;
  }));
  numberRows(list);
}

/** Current on-screen order as {teamId: rank}. */
export const readRankList = list =>
  Object.fromEntries([...list.children].map((li, i) => [+li.dataset.id, i + 1]));

/** Wires drag and arrow handling once; calls onCommit() after each completed reorder. */
export function initRankList(list, onCommit) {
  let dragging = null;
  const commit = () => { numberRows(list); onCommit(); };

  list.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grip')) return;
    dragging = e.target.closest('li');
    dragging.classList.add('dragging');
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', e => {
    if (!dragging) return;
    const over = [...list.children].find(li => li !== dragging &&
      e.clientY >= li.getBoundingClientRect().top && e.clientY <= li.getBoundingClientRect().bottom);
    if (!over) return;
    const mid = over.getBoundingClientRect().top + over.offsetHeight / 2;
    list.insertBefore(dragging, e.clientY < mid ? over : over.nextSibling);
    numberRows(list);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
    commit();
  };
  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);

  list.addEventListener('click', e => {
    const button = e.target.closest('.mv');
    if (!button) return;
    const li = button.closest('li');
    const dir = +button.dataset.d;
    if (dir < 0 && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    else if (dir > 0 && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    else return;
    commit();
  });
}
