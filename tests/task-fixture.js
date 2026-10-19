// Test/preview adapter only. Production reads native DSH services instead.
function taskSource(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of [...listeners]) fn(); }, listeners };
}
window.taskFixture = {
  mount(overrides = {}) {
    window.disposeSaber?.();
    const byId = overrides.byId || {
      self: { title: '当前会话', cwd: '/project' },
      run: { title: '整理接口文档', cwd: '/project' },
      run2: { title: '工作树回归测试', cwd: '/project' },
      wait: { title: '确认文件写入', cwd: '/project' },
      done: { title: '更新主题说明', cwd: '/project' },
      done2: { title: '恢复会话跳转', cwd: '/project' }
    };
    this.list = taskSource({ phase: 'ready', ids: Object.keys(byId), byId });
    this.statuses = taskSource(new Map(overrides.statuses || [
      ['self', { running: true }], ['run', { running: true }], ['run2', { running: true }],
      ['wait', { running: true, pendingInteraction: { key: 'approval-1', kind: 'approval' } }],
      ['done', { running: false, completionUnread: true }], ['done2', { running: false, completionUnread: true }]
    ]));
    this.current = taskSource({ key: overrides.current || 'self' });
    this.workspaces = taskSource({ items: [{ path: '/project', title: 'Saber Theme' }], archivedSessionIds: [] });
    this.calls = [];
    this.navigate = id => this.current.set({ key: id });
    const services = {
      sessions: { list: this.list, retain() { throw new Error('Tray must not retain sessions'); } },
      uiSession: { sessionStatus: this.statuses, adapter: { current: this.current } },
      uiWorkspace: { openSession: id => { this.calls.push(id); return this.navigate(id); } },
      workspaces: { list: this.workspaces }
    };
    function inject(keys, apply) {
      const disposers = [];
      let disposed = false;
      const scope = { ...services, inject, effect(create) { const stop = create(); if (stop) disposers.push(stop); return stop; } };
      if (keys.every(key => services[key])) apply(scope);
      return { dispose() { if (disposed) return; disposed = true; for (const stop of disposers.reverse()) stop(); } };
    }
    window.ctx.inject = inject;
    document.body.dataset.taskDemo = '';
    document.querySelector('.work').classList.remove('fixture_composerHero');
    const center = document.querySelector('.fixture_centerCol');
    center.setAttribute('data-conversation-content', '');
    document.querySelector('.fixture_composer').setAttribute('data-composer-seat', '');
    if (!document.querySelector('.fixture_turnIndex')) {
      const rail = document.createElement('nav'); rail.className = 'fixture_turnIndex';
      for (let i = 0; i < 8; i++) { const item = document.createElement('button'); item.dataset.index = i; item.setAttribute('aria-label', `Turn ${i + 1}`); rail.append(item); }
      center.append(rail);
      const copy = document.createElement('article'); copy.className = 'fixture_taskCopy';
      const title = document.createElement('h1'); title.textContent = '并行会话，一眼可见';
      const detail = document.createElement('p'); detail.textContent = '右侧索引下方的任务入口，移入查看状态，点击返回对应会话。';
      const label = document.createElement('small'); label.textContent = '真实主题组件 · 模拟会话数据';
      copy.append(title, detail, label); center.append(copy);
      const style = document.createElement('style');
      style.textContent = 'body[data-task-demo] .work{position:absolute;bottom:32px}body[data-task-demo] .fixture_welcomeBrand{display:none}.fixture_turnIndex{position:absolute;right:14px;top:150px;display:grid;gap:10px;width:24px}.fixture_turnIndex button{padding:0;border:0;width:12px;height:3px;background:var(--dsw-alias-border-l1)}.fixture_taskCopy{position:absolute;left:10%;top:100px;right:15%;max-width:700px}.fixture_taskCopy h1{font-size:28px;font-weight:600}.fixture_taskCopy p{color:var(--dsw-alias-label-secondary)}.fixture_taskCopy small{color:var(--dsw-alias-label-secondary);font-size:11px}';
      document.head.append(style);
    }
    window.saberModule.apply(window.ctx);
  },
  update(id, status) { this.statuses.set(new Map(this.statuses.getSnapshot()).set(id, status)); },
  listeners() { return [this.list, this.statuses, this.current, this.workspaces].map(source => source.listeners.size); }
};
