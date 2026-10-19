import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskMonitorStore } from '../src/task-model.js';
import { taskMonitorPosition } from '../src/task-position.js';

function source(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of [...listeners]) fn(); }, listeners };
}
function fixture() {
  const byId = {
    self: { title: 'Current', cwd: '/project' }, run: { title: 'Running', cwd: 'C:\\project\\saber' },
    wait: { title: 'Approval', cwd: '/project' }, done: { title: 'Unseen', cwd: '/project' },
    child: { origin: 'subagent', title: 'Agent child' }, fork: { parentId: 'run', title: 'Manual fork' },
    blank: { blank: true }, archived: { title: 'Archived' }
  };
  const list = source({ phase: 'ready', ids: Object.keys(byId), byId });
  const statuses = source(new Map(Object.keys(byId).map(id => [id, id === 'wait' ? { running: true, pendingInteraction: { kind: 'approval', key: 'first' } } : id === 'done' ? { running: false, completionUnread: true } : { running: true }])));
  const current = source({ key: 'self' });
  const workspaces = source({ items: [{ path: '/project', title: 'Project' }], archivedSessionIds: ['archived'] });
  let navigate = id => current.set({ key: id });
  const store = createTaskMonitorStore({ list, retain() { throw new Error('Must not retain chat'); } }, { sessionStatus: statuses, adapter: { current } }, { openSession: id => navigate(id) });
  store.setWorkspaces({ list: workspaces });
  store.start();
  const row = id => store.getSnapshot().rows.find(row => row.id === id);
  const status = (id, value) => statuses.set(new Map(statuses.getSnapshot()).set(id, value));
  return { store, list, statuses, current, workspaces, row, status, navigate(fn) { navigate = fn; } };
}

test('task projection keeps real attention phases, excludes archived/subagent/current chats and supports Windows paths', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.store.getSnapshot().rows.map(row => row.phase), ['waiting', 'done', 'running', 'running']);
    for (const id of ['self', 'child', 'blank', 'archived']) assert.equal(f.row(id), undefined);
    assert.equal(f.row('fork').phase, 'running');
    assert.equal(f.row('run').project, 'saber');
    assert.equal(f.row('wait').project, 'Project');
    f.store.start();
    for (const value of [f.list, f.statuses, f.current, f.workspaces]) assert.equal(value.listeners.size, 1);
  } finally { f.store.dispose(); }
  for (const value of [f.list, f.statuses, f.current, f.workspaces]) assert.equal(value.listeners.size, 0);
});

test('failed and unconfirmed navigation keeps reminders; selection and later phases are acknowledged independently', async () => {
  const f = fixture();
  try {
    const row = f.row('wait');
    f.navigate(() => { throw new Error('Navigation refused'); });
    await assert.rejects(f.store.open(row.id, row.token), /refused/);
    assert.ok(f.row('wait'));
    let selected;
    f.navigate(id => { selected = id; });
    const opening = f.store.open(row.id, row.token);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(selected, 'wait'); assert.ok(f.row('wait'));
    f.current.set({ key: 'wait' }); await opening;
    f.current.set({ key: 'self' }); assert.equal(f.row('wait'), undefined);
    f.status('wait', { running: true, pendingInteraction: { kind: 'approval', key: 'replacement' } });
    assert.ok(f.row('wait'));
    await assert.rejects(f.store.open(row.id, row.token), /changed/);
    f.current.set({ key: 'run' }); f.current.set({ key: 'self' });
    assert.equal(f.row('run'), undefined);
    f.status('run', { running: false, completionUnread: true }); assert.equal(f.row('run').phase, 'done');
    f.status('run', { running: true, completionUnread: false }); assert.equal(f.row('run').phase, 'running');
  } finally { f.store.dispose(); }
});

test('message timestamp updates preserve the snapshot and inspect candidate summaries only', () => {
  const f = fixture();
  try {
    const idle = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`idle-${i}`, { running: false, title: 'Idle' }]));
    const byId = { ...idle, ...f.list.getSnapshot().byId };
    f.list.set({ phase: 'ready', ids: Object.keys(byId), byId });
    const before = f.store.getSnapshot();
    let reads = 0;
    const proxy = new Proxy(byId, { get(target, key) { reads++; return target[key]; } });
    for (let i = 0; i < 100; i++) f.list.set({ ...f.list.getSnapshot(), byId: proxy, updatedAt: i });
    assert.equal(f.store.getSnapshot(), before);
    assert.ok(reads < 1500, `Must not scan 2000 idle chats per stream update (${reads} reads)`);
  } finally { f.store.dispose(); }
});

test('disposal cancels an unconfirmed open and releases every source; catalog errors disable stale rows', async () => {
  const f = fixture();
  const row = f.row('done');
  f.list.set({ ...f.list.getSnapshot(), phase: 'error' });
  assert.equal(f.store.getSnapshot().unavailable, true);
  await assert.rejects(f.store.open(row.id, row.token), /changed/);
  f.list.set({ ...f.list.getSnapshot(), phase: 'ready' });
  f.navigate(() => {});
  const pending = f.store.open(row.id, row.token);
  const rejected = assert.rejects(pending, /cancelled/);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  f.store.dispose(); f.store.dispose();
  await rejected;
  assert.deepEqual(f.store.getSnapshot().rows, []);
  for (const value of [f.list, f.statuses, f.current, f.workspaces]) assert.equal(value.listeners.size, 0);
});

test('default task position follows the index and clamps saved positions above the composer', () => {
  const viewport = { width: 1400, height: 900 };
  const chat = { left: 250, top: 50, right: 1100, bottom: 850 };
  const rail = { left: 1060, bottom: 300 };
  const composer = { top: 700 };
  const base = taskMonitorPosition(viewport, chat, rail, composer, null);
  assert.equal(base.y, 312); assert.equal(base.x, 1049);
  const crowded = taskMonitorPosition(viewport, chat, { ...rail, bottom: 690 }, composer, null);
  assert.equal(crowded.x, 1010); assert.ok(crowded.y + 38 < composer.top);
  const moved = taskMonitorPosition({ width: 600, height: 600 }, { ...chat, right: 600 }, null, { top: 420 }, { x: 2, y: 2 });
  assert.ok(moved.x + 38 <= 600); assert.ok(moved.y + 38 < 420);
});
