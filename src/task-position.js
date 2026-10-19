// Adapted from gord-dsh-worktree (MIT). Event-driven geometry; no polling.
var TASK_POSITION_KEY = 'gord-dsh-saber-theme:task-position';
export function taskPositionStorage(value, write) {
  try {
    var storage = window.localStorage;
    if (write) {
      if (value === null) storage.removeItem(TASK_POSITION_KEY);
      else storage.setItem(TASK_POSITION_KEY, JSON.stringify(value));
      return value;
    }
    var saved = JSON.parse(storage.getItem(TASK_POSITION_KEY));
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && saved.x >= 0 && saved.x <= 1 && saved.y >= 0 && saved.y <= 1 ? saved : null;
  } catch (_) { return null; }
}
export function clampTask(value, min, max) { return Math.max(min, Math.min(Math.max(min, max), value)); }
/** Geometry is independent of locale and the host's hashed CSS names. */
export function taskMonitorPosition(viewport, chat, rail, composer, saved) {
  var width = viewport.width;
  var height = viewport.height;
  chat = chat || { left: 0, top: 0, right: width, bottom: height };
  var minX = Math.max(8, Math.min(width - 46, chat.left + 8));
  var maxX = Math.max(minX, Math.min(width - 51, chat.right - 51));
  var minY = Math.max(8, Math.min(height - 46, chat.top + 8));
  var maxY = Math.max(minY, Math.min(height - 46, (composer ? composer.top : chat.bottom) - 50));
  var defaultX = rail && rail.bottom + 12 > maxY ? rail.left - 50 : maxX;
  return { x: clampTask(saved ? minX + saved.x * (maxX - minX) : defaultX, minX, maxX),
    y: clampTask(saved ? minY + saved.y * (maxY - minY) : rail ? rail.bottom + 12 : chat.top + (maxY - chat.top) * .6, minY, maxY),
    minX: minX, maxX: maxX, minY: minY, maxY: maxY, width: width, height: height };
}
/** Event-driven anchor tracking; no polling, no token/character observers. */
export function watchTaskMonitorPosition(changed, saved) {
  var frame = null;
  var closed = false;
  var observed = [];
  var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  function schedule() {
    if (frame !== null || closed) return;
    frame = window.requestAnimationFrame(measure);
  }
  function measure() {
    frame = null;
    if (closed) return;
    var chat = document.querySelector('[data-conversation-content]');
    var rail = null;
    var composer = chat && chat.querySelector('[data-composer-seat]');
    if (chat) Array.from(chat.querySelectorAll('nav')).some(function (nav) {
      if (!nav.querySelector('button[data-index]')) return false;
      rail = nav;
      return true;
    });
    var next = [chat, rail, composer].filter(Boolean);
    if (resize && (next.length !== observed.length || next.some(function (el, i) { return el !== observed[i]; }))) {
      resize.disconnect();
      next.forEach(function (el) { resize.observe(el); });
      observed = next;
    }
    function rect(el) {
      if (!el) return null;
      var value = el.getBoundingClientRect();
      return value.width > 0 && value.height > 0 ? value : null;
    }
    changed({ ...taskMonitorPosition({ width: window.innerWidth, height: window.innerHeight }, rect(chat), rect(rail), rect(composer), saved()), blocked: Boolean(document.querySelector('[data-task-monitor]')) });
  }
  var mutations = typeof MutationObserver === 'function' ? new MutationObserver(function (changes) {
    var selector = '[data-conversation-content],nav,[data-composer-seat],[data-task-monitor]';
    var relevant = changes.some(function (change) {
      return Array.from(change.addedNodes).concat(Array.from(change.removedNodes)).some(function (node) {
        return node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
      });
    });
    if (relevant) schedule();
  }) : null;
  if (mutations && document.body) mutations.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  // Capturing ancestor scroll catches rail movement without a layout timer.
  document.addEventListener('scroll', schedule, true);
  measure();
  return { refresh: schedule, dispose: function () {
    closed = true;
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (resize) resize.disconnect();
    if (mutations) mutations.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
  } };
}

