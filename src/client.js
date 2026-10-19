// This file is wrapped in the native DSH module registration by build.mjs.
function apply(ctx) {
  const body = document.body;
  const style = document.createElement('style');
  style.dataset.plugin = 'gord-dsh-saber-theme';
  style.textContent = SABER_CSS;
  const previous = body.getAttribute('data-dsh-saber');
  let disposeTokens;
  let disposeRotation;
  let disposeTasks;
  let cleaned = false;
  try {
    disposeTokens = ctx.theme.overrideTokens('gord-dsh-saber-theme', SABER_TOKENS);
    document.head.append(style);
    body.setAttribute('data-dsh-saber', SABER_VERSION);
    const rule = style.sheet.insertRule('body[data-dsh-saber] {}', style.sheet.cssRules.length);
    disposeRotation = startRotation(style.sheet.cssRules[rule].style);
    disposeTasks = startTasks(ctx);
    ctx.effect(() => cleanup, 'Saber theme presentation');
  } catch (error) {
    cleanup();
    throw error;
  }
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    disposeTasks?.();
    disposeRotation?.();
    style.remove();
    disposeTokens?.();
    if (previous === null) body.removeAttribute('data-dsh-saber');
    else body.setAttribute('data-dsh-saber', previous);
  }
}
