// Preserve links that previously opened the organizer at index.html.
(() => {
  const params = new URLSearchParams(window.location.search);
  const appParams = ["entry", "storage", "helper", "token", "view", "layout", "seed", "delay", "capacity", "refill", "folders", "kuwahara"];
  if (!appParams.some((name) => params.has(name))) return;

  const target = new URL("./app.html", window.location.href);
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();
