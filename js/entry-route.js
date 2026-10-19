// Preserve links that previously opened the organizer at index.html.
(() => {
  const params = new URLSearchParams(window.location.search);
  const appParams = ["entry", "storage", "helper", "token", "view", "layout", "seed", "delay", "capacity", "refill", "folders", "quality"];
  // Desktop Helper v0.2.2+ puts its connection in the fragment (#helper=…&token=…); #end (landing) stays here.
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!appParams.some((name) => params.has(name)) && !hash.has("helper")) return;

  const target = new URL("./app.html", window.location.href);
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();
