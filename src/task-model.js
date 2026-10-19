// Adapted from gord-dsh-worktree (MIT), task attention projection.
// Read summary/status sources only; never retain or hydrate a Session.
function baseName(value) { return String(value || '').split(/[\\/]/).filter(Boolean).at(-1) || ''; }
function workspaceSource(service) {
  if (service?.list?.getSnapshot) return service.list;
  return service?.getSnapshot ? service : null;
}

/** Summary-only attention projection. Never retain or hydrate a Session. */
export function createTaskMonitorStore(sessions, uiSession, navigation) {
  var listeners = new Set();
  var records = new Map();
  var stops = [];
  var pendingOpens = new Set();
  var workspaceStop = null;
  var workspaces = null;
  var started = false;
  var disposed = false;
  var sequence = 0;
  var statusVersion = null;
  var catalogCount = -1;
  var candidates = new Set();
  var workspaceVersion = null;
  var projects = new Map();
  var archived = new Set();
  var emptyWorkspace = {};
  var snapshot = { rows: [], unavailable: false };
  function currentId() {
    var binding = uiSession.adapter.current.getSnapshot();
    return binding && binding.key;
  }
  function publish(rows, unavailable) {
    var previous = snapshot.rows;
    if (snapshot.unavailable === unavailable && previous.length === rows.length && rows.every(function (row, index) {
      var old = previous[index];
      return old.id === row.id && old.token === row.token && old.title === row.title && old.project === row.project;
    })) return;
    snapshot = { rows: rows, unavailable: unavailable };
    listeners.forEach(function (listener) { listener(); });
  }
  function refresh() {
    if (disposed) return;
    try {
      var list = sessions.list.getSnapshot();
      if (!list || list.state === 'error' || list.phase === 'error') return publish(snapshot.rows, true);
      if (list.phase === 'pending' || list.phase === 'loading') return publish(snapshot.rows, true);
      var statuses = uiSession.sessionStatus.getSnapshot();
      var workspaceSnapshot = emptyWorkspace;
      try {
        var workspaceCatalog = workspaces && workspaceSource(workspaces);
        if (workspaceCatalog) workspaceSnapshot = workspaceCatalog.getSnapshot() || emptyWorkspace;
      } catch (_) { workspaceSnapshot = workspaceVersion || emptyWorkspace; }
      if (workspaceSnapshot !== workspaceVersion) {
        workspaceVersion = workspaceSnapshot;
        archived = new Set(workspaceSnapshot.archivedSessionIds || []);
        projects = new Map();
        (Array.isArray(workspaceSnapshot) ? workspaceSnapshot : workspaceSnapshot.items || []).forEach(function (row) {
          projects.set(row.path, row.title || baseName(row.path));
        });
      }
      // Streaming changes list timestamps/content hints, while the unified
      // status map is stable. Scan the catalog only on status/membership
      // changes; title-only list updates inspect just candidate summaries.
      var ids = Array.isArray(list.ids) ? list.ids : Object.keys(list.byId || {});
      if (statuses !== statusVersion || ids.length !== catalogCount) {
        statusVersion = statuses;
        catalogCount = ids.length;
        candidates = new Set();
        statuses.forEach(function (status, id) {
          if (status.running || status.pendingInteraction || status.completionUnread) candidates.add(id);
        });
        ids.forEach(function (id) {
          var status = statuses.get(id);
          if ((!status || status.running === undefined) && list.byId[id] && list.byId[id].running) candidates.add(id);
        });
      }
      var current = currentId();
      var kept = new Set();
      var rows = [];
      candidates.forEach(function (id) {
        var summary = list.byId[id];
        // A manual fork also has parentId; only explicit subagent origin
        // identifies an agent-owned child that should stay out of the tray.
        if (!summary || summary.blank || summary.origin === 'subagent' || archived.has(id)) return;
        var status = statuses.get(id) || {};
        var running = status.running === undefined ? summary.running === true : status.running === true;
        var pending = status.pendingInteraction;
        var phase = pending ? 'waiting' : running ? 'running' : status.completionUnread ? 'done' : '';
        if (!phase) return;
        kept.add(id);
        var record = records.get(id);
        if (!record) { record = { running: false, epoch: 0, token: '', dismissed: '', order: 0 }; records.set(id, record); }
        if (running && !record.running) record.epoch += 1;
        record.running = running;
        var token = phase + ':' + record.epoch + ':' + (pending ? pending.key || pending.kind : '');
        if (record.token !== token) { record.token = token; record.order = ++sequence; }
        // Opening through the ordinary sidebar also acknowledges the current
        // phase. A later stop or a new run gets a different token.
        if (current === id) record.dismissed = token;
        if (record.dismissed === token) return;
        rows.push({ id: id, phase: phase, token: token, order: record.order,
          title: typeof summary.title === 'string' ? summary.title.trim() : '',
          project: projects.get(summary.cwd) || (summary.cwd ? baseName(summary.cwd) : '') });
      });
      records.forEach(function (_, id) { if (!kept.has(id)) records.delete(id); });
      var rank = { waiting: 0, done: 1, running: 2 };
      rows.sort(function (a, b) { return rank[a.phase] - rank[b.phase] || b.order - a.order || a.id.localeCompare(b.id); });
      publish(rows, false);
    } catch (_) { publish(snapshot.rows, true); }
  }
  function waitForSelection(id) {
    return new Promise(function (resolve, reject) {
      var stop = null;
      var timer = null;
      var settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        if (stop) stop();
        if (timer) clearTimeout(timer);
        pendingOpens.delete(cancel);
        if (error) reject(error); else resolve();
      }
      function cancel() { finish(new Error('Session navigation was cancelled')); }
      function check() {
        try { if (currentId() === id) finish(); } catch (error) { finish(error); }
      }
      pendingOpens.add(cancel);
      if (disposed) return cancel();
      check();
      if (settled) return;
      try { stop = uiSession.adapter.current.subscribe(check); }
      catch (error) { finish(error); return; }
      if (settled) { stop(); return; }
      timer = setTimeout(function () { finish(new Error('Session navigation did not select the requested chat')); }, 5000);
      check();
    });
  }
  return {
    getSnapshot: function () { return snapshot; },
    subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
    start: function () {
      if (started || disposed) return;
      started = true;
      [sessions.list, uiSession.sessionStatus, uiSession.adapter.current].forEach(function (source) {
        stops.push(source.subscribe(refresh));
      });
      refresh();
    },
    setWorkspaces: function (service) {
      if (disposed) return;
      if (workspaceStop) workspaceStop();
      workspaceStop = null;
      workspaces = service;
      var source = service && workspaceSource(service);
      if (source && typeof source.subscribe === 'function') workspaceStop = source.subscribe(refresh);
      refresh();
    },
    open: function (id, token) {
      if (disposed) return Promise.reject(new Error('Task monitor is disposed'));
      if (snapshot.unavailable || !snapshot.rows.some(function (row) { return row.id === id && row.token === token; })) {
        return Promise.reject(new Error('Session task changed; try again'));
      }
      var open = navigation && typeof navigation.openSession === 'function'
        ? function () { return navigation.openSession(id); }
        : typeof sessions.open === 'function' ? function () { return sessions.open(id); } : null;
      if (!open) return Promise.reject(new Error('Session navigation is unavailable'));
      return Promise.resolve().then(function () {
        if (disposed) throw new Error('Task monitor is disposed');
        return open();
      }).then(function () { return waitForSelection(id); }).then(function () {
        var record = records.get(id);
        if (record && record.token === token) record.dismissed = token;
        refresh();
      });
    },
    dispose: function () {
      if (disposed) return;
      disposed = true;
      stops.forEach(function (stop) { stop(); });
      if (workspaceStop) workspaceStop();
      pendingOpens.forEach(function (cancel) { cancel(); });
      pendingOpens.clear();
      records.clear();
      candidates.clear();
      projects.clear();
      archived.clear();
      statusVersion = null;
      workspaceVersion = null;
      listeners.clear();
      snapshot = { rows: [], unavailable: false };
    },
  };
}

