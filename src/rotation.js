// Only compressed chunks are cached by DSH. Decode one candidate at a time;
// never preload the wallpaper collection or keep permanent animation layers.
function startRotation(declaration) {
  const interval = SABER_ROTATION.intervalMinutes * 60_000;
  let timer;
  let pending;
  let currentUrl;
  let currentIndex = 0;
  let stopped = false;

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (!stopped && !document.hidden) timer = setTimeout(rotate, interval);
  }

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timeout);
    if (pending.image) {
      pending.image.onload = pending.image.onerror = null;
      pending.image.removeAttribute('src');
    }
    if (pending.url) URL.revokeObjectURL(pending.url);
    pending = undefined;
  }

  function rotate() {
    timer = undefined;
    if (stopped || document.hidden) return;
    // This inexpensive layout check runs once per interval, never per message
    // or animation frame. The home screen keeps its own fixed illustration.
    if (document.querySelector('[class*="_composerHero"]')) { schedule(); return; }
    const index = (currentIndex + 1 + Math.floor(Math.random() * (SABER_ROTATION.files.length - 1))) % SABER_ROTATION.files.length;
    const operation = {};
    pending = operation;
    const valid = () => !stopped && !document.hidden && pending === operation;
    function finish() {
      if (pending !== operation) return;
      cancelPending();
      schedule();
    }
    // Bound image decoding and our reference to the native chunk request. A
    // late native response is ignored; its transport belongs to DSH's loader.
    operation.timeout = setTimeout(finish, 10_000);
    Promise.resolve().then(() => require.async(`./${SABER_ROTATION.files[index]}`)).then(resource => {
      if (!valid()) return;
      operation.url = URL.createObjectURL(resource.createBlob());
      const image = operation.image = new Image();
      image.onload = async () => {
        try { await image.decode(); }
        catch { finish(); return; }
        if (!valid()) return;
        // Navigation can happen while an image is loading. Do not replace the
        // chat image while the home screen is visible.
        if (!document.querySelector('[class*="_composerHero"]')) {
          declaration.setProperty('--saber-chat', `url("${operation.url}")`);
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = operation.url;
          currentIndex = index;
          operation.url = undefined;
        }
        finish();
      };
      image.onerror = finish;
      image.src = operation.url;
    }).catch(finish);
  }

  function visibilityChanged() {
    clearTimeout(timer);
    cancelPending();
    schedule(); // A fresh interval on return; no burst of missed rotations.
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    cancelPending();
    document.removeEventListener('visibilitychange', visibilityChanged);
    declaration.removeProperty('--saber-chat');
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = undefined;
  };
}
