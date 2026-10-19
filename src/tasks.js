// The tray uses native summary subscriptions and ordinary DOM, without another
// framework runtime, session retention, chat-content reads or polling.
const TASK_TEXT = {
  zh: { title: '任务关注', button: '任务', hint: '悬浮查看任务；拖动调整位置', running: '运行中', waiting: '待处理', done: '已结束未查看', untitled: '未命名会话', reset: '恢复索引下方的位置', failed: '未能打开会话', unavailable: '会话状态暂时不可用', project: '未分组', previous: '上一页', next: '下一页', attention: '待处理或未查看' },
  en: { title: 'Task attention', button: 'Tasks', hint: 'Hover to view tasks; drag to reposition', running: 'Running', waiting: 'Needs attention', done: 'Ended, unseen', untitled: 'Untitled chat', reset: 'Reset below the turn index', failed: 'Could not open chat', unavailable: 'Session status is temporarily unavailable', project: 'Ungrouped', previous: 'Previous', next: 'Next', attention: 'Waiting or unseen' }
};

function mountTaskMonitor(store) {
  const root = document.createElement('div');
  root.dataset.saberTaskHost = '';
  root.className = 'saber-task-monitor';
  root.hidden = true;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, action) => {
    const node = element('button', className, text);
    node.type = 'button';
    node.onclick = action;
    return node;
  };
  const trigger = button('saber-task-trigger', '', () => {
    if (suppressClick) { suppressClick = false; return; }
    setOpen(true);
  });
  trigger.dataset.saberTaskTrigger = '';
  root.append(trigger);
  document.body.append(root);
  let alive = true;
  let data = store.getSnapshot();
  let open = false;
  let position;
  let tracker;
  let tracking = false;
  let panel;
  let page = 0;
  let busy = '';
  let error = '';
  let closeTimer;
  let drag;
  let suppressClick = false;
  let ignoreFocus = false;
  let saved = taskPositionStorage();
  const text = () => TASK_TEXT[document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'];
  function keepOpen() { clearTimeout(closeTimer); closeTimer = undefined; }
  function setOpen(value) { keepOpen(); if (open === value) return; open = value; render(); }
  function laterClose() { keepOpen(); closeTimer = setTimeout(() => { closeTimer = undefined; open = false; render(); }, 200); }
  function restoreFocus() {
    ignoreFocus = true;
    trigger.focus({ preventScroll: true });
    ignoreFocus = false;
  }
  function render() {
    if (!alive) return;
    const focused = document.activeElement?.dataset?.saberTaskRow;
    const action = document.activeElement?.dataset?.saberTaskAction;
    const t = text();
    root.dataset.saberTaskState = data.unavailable ? 'unavailable' : 'ready';
    const visible = data.rows.length > 0;
    if (visible && !tracker && !tracking) {
      tracking = true;
      tracker = watchTaskMonitorPosition(next => { position = next; if (!tracking) render(); }, () => saved);
      tracking = false;
    } else if (!visible && tracker) {
      tracker.dispose(); tracker = undefined;
    }
    root.hidden = !visible || !position || position.blocked;
    if (root.hidden) { open = false; keepOpen(); }
    if (position) { root.style.left = `${position.x}px`; root.style.top = `${position.y}px`; }
    const counts = { waiting: 0, done: 0, running: 0 };
    for (const row of data.rows) counts[row.phase]++;
    const attention = counts.waiting + counts.done;
    const summary = ['waiting', 'done', 'running'].filter(kind => counts[kind]).map(kind => `${t[kind]} ${counts[kind]}`).join(' · ');
    trigger.title = t.hint;
    trigger.setAttribute('aria-label', `${t.title}: ${summary}`);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.replaceChildren(element('strong', 'saber-task-total', data.rows.length > 99 ? '99+' : data.rows.length), element('span', 'saber-task-label', t.button));
    if (attention) {
      const badge = element('span', `saber-task-badge${counts.waiting ? ' needs-attention' : ''}`, attention > 99 ? '99+' : attention);
      badge.title = `${t.attention}: ${attention}`;
      badge.setAttribute('aria-hidden', 'true');
      trigger.append(badge);
    }
    panel?.remove(); panel = undefined;
    if (!open || root.hidden) { trigger.removeAttribute('aria-controls'); return; }
    trigger.setAttribute('aria-controls', 'saber-task-panel');
    panel = element('section', 'saber-task-panel');
    panel.id = 'saber-task-panel';
    panel.setAttribute('aria-label', t.title);
    const width = Math.min(320, position.width - 24);
    const left = Math.max(12, position.x >= width + 20 ? position.x - width - 12 : Math.min(position.width - width - 12, position.x + 50));
    const bottom = Math.min(position.height - 12, position.maxY + 38);
    const height = Math.min(420, 104 + Math.min(20, data.rows.length) * 58 + (error || data.unavailable ? 40 : 0) + (data.rows.length > 20 ? 40 : 0));
    const top = clampTask(position.y - 24, 12, bottom - height);
    Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(60, bottom - top)}px` });
    const header = element('header', 'saber-task-heading');
    const reset = button('saber-task-reset', '↺', () => { saved = null; taskPositionStorage(null, true); tracker?.refresh(); });
    reset.dataset.saberTaskAction = 'reset';
    reset.title = t.reset; reset.setAttribute('aria-label', t.reset);
    header.append(element('strong', '', t.title), reset);
    const chips = element('div', 'saber-task-summary');
    for (const phase of ['waiting', 'done', 'running']) if (counts[phase]) chips.append(element('span', `saber-task-chip ${phase}`, `${t[phase]} ${counts[phase]}`));
    panel.append(header, chips);
    if (error || data.unavailable) {
      const notice = element('div', 'saber-task-error', error || t.unavailable);
      notice.setAttribute('role', 'alert'); panel.append(notice);
    }
    const rows = element('div', 'saber-task-rows');
    page = Math.min(page, Math.max(0, Math.ceil(data.rows.length / 20) - 1));
    for (const row of data.rows.slice(page * 20, page * 20 + 20)) {
      const item = button('saber-task-row', '', () => select(row));
      item.dataset.saberTaskRow = row.id;
      item.disabled = Boolean(busy || data.unavailable);
      item.title = row.title || t.untitled;
      const dot = element('span', `saber-task-dot ${row.phase}`);
      dot.setAttribute('aria-hidden', 'true');
      const content = element('span', 'saber-task-row-content');
      content.append(element('span', 'saber-task-row-title', row.title || t.untitled), element('span', 'saber-task-row-detail', `${row.project || t.project} · ${t[row.phase]}`));
      item.append(dot, content);
      if (busy === row.id) item.append(element('span', '', '…'));
      rows.append(item);
    }
    panel.append(rows);
    if (data.rows.length > 20) {
      const pages = element('footer', 'saber-task-pages');
      const previous = button('', t.previous, () => { page--; render(); }); previous.disabled = page === 0;
      const next = button('', t.next, () => { page++; render(); }); next.disabled = page >= Math.ceil(data.rows.length / 20) - 1;
      previous.dataset.saberTaskAction = 'previous'; next.dataset.saberTaskAction = 'next';
      pages.append(previous, element('span', '', `${page + 1} / ${Math.ceil(data.rows.length / 20)}`), next);
      panel.append(pages);
    }
    root.append(panel);
    if (focused) ([...rows.children].find(node => node.dataset.saberTaskRow === focused && !node.disabled) || trigger).focus({ preventScroll: true });
    if (action) ([...panel.querySelectorAll('[data-saber-task-action]')].find(node => node.dataset.saberTaskAction === action && !node.disabled) || trigger).focus({ preventScroll: true });
  }
  function select(row) {
    if (busy) return;
    busy = row.id; error = ''; render();
    store.open(row.id, row.token).then(() => {
      if (alive) { open = false; restoreFocus(); }
    }, failure => {
      if (alive) { error = `${text().failed}: ${failure.message || failure}`; open = true; }
    }).finally(() => { if (alive) { busy = ''; render(); } });
  }
  root.onpointerenter = event => { if (event.pointerType !== 'touch' && !drag) setOpen(true); };
  root.onpointerleave = () => { if (!drag) laterClose(); };
  root.onfocusin = event => { if (!ignoreFocus) { keepOpen(); if (!open && event.target.matches(':focus-visible')) setOpen(true); } };
  root.onfocusout = event => { if (!root.contains(event.relatedTarget)) laterClose(); };
  root.onkeydown = event => { if (event.key === 'Escape') { setOpen(false); restoreFocus(); event.stopPropagation(); } };
  trigger.onpointerdown = event => {
    if (event.button !== 0) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: position, saved, moved: false };
    trigger.setPointerCapture(event.pointerId);
  };
  trigger.onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    drag.moved = true; open = false; keepOpen();
    const start = drag.start;
    position = { ...start, x: clampTask(start.x + dx, start.minX, start.maxX), y: clampTask(start.y + dy, start.minY, start.maxY) };
    saved = { x: start.maxX === start.minX ? 0 : (position.x - start.minX) / (start.maxX - start.minX), y: start.maxY === start.minY ? 0 : (position.y - start.minY) / (start.maxY - start.minY) };
    render();
  };
  trigger.onpointerup = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved; drag = undefined;
    if (trigger.hasPointerCapture(event.pointerId)) trigger.releasePointerCapture(event.pointerId);
    if (moved) { suppressClick = true; taskPositionStorage(saved, true); }
  };
  function cancelDrag() {
    if (!drag) return;
    saved = drag.saved; drag = undefined; tracker?.refresh();
  }
  trigger.onpointercancel = cancelDrag;
  trigger.onlostpointercapture = cancelDrag;
  const stop = store.subscribe(() => { data = store.getSnapshot(); render(); });
  const locale = new MutationObserver(render);
  locale.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const visibility = () => { if (document.hidden) setOpen(false); };
  document.addEventListener('visibilitychange', visibility);
  render();
  return () => {
    if (!alive) return;
    alive = false; keepOpen(); stop(); tracker?.dispose(); locale.disconnect(); document.removeEventListener('visibilitychange', visibility); root.remove(); drag = undefined;
  };
}

function startTasks(ctx) {
  if (typeof ctx.inject !== 'function') return () => {};
  let stopped = false;
  const cleanups = new Set();
  const fiber = ctx.inject(['sessions', 'uiSession', 'uiWorkspace'], scope => {
    const observable = value => value && typeof value.getSnapshot === 'function' && typeof value.subscribe === 'function';
    if (stopped || !observable(scope.sessions?.list) || !observable(scope.uiSession?.sessionStatus) || !observable(scope.uiSession?.adapter?.current) || typeof scope.uiWorkspace?.openSession !== 'function') return;
    const monitor = createTaskMonitorStore(scope.sessions, scope.uiSession, scope.uiWorkspace);
    scope.effect(() => {
      let disposeView;
      try { monitor.start(); disposeView = mountTaskMonitor(monitor); }
      catch (error) { monitor.dispose(); throw error; }
      let disposed = false;
      const cleanup = () => { if (disposed) return; disposed = true; disposeView(); monitor.dispose(); cleanups.delete(cleanup); };
      cleanups.add(cleanup);
      return cleanup;
    }, 'Saber task attention');
    scope.inject(['workspaces'], inner => {
      inner.effect(() => {
        monitor.setWorkspaces(inner.workspaces);
        return () => monitor.setWorkspaces(null);
      }, 'Saber task workspace labels');
    });
  });
  return () => { stopped = true; for (const cleanup of [...cleanups]) cleanup(); fiber?.dispose?.(); };
}
