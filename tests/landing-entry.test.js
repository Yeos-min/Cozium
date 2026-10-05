import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Onboarding } from "../js/ui/onboarding.js";

function element() {
  const events = new Map();
  return {
    events,
    dataset: {},
    hidden: false,
    disabled: false,
    textContent: "",
    classList: { add() {}, remove() {} },
    addEventListener(name, handler) { events.set(name, handler); },
    querySelectorAll() { return []; },
    focus(options) { this.focusOptions = options; },
    scrollIntoView(options) { this.scrollOptions = options; },
    contains() { return false; },
  };
}

function setup({ onStart = async () => {}, memoryProvider = { name: "sample" } } = {}) {
  const elements = new Map();
  const errors = [];
  let imports = 0;
  let helpers = 0;
  const root = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
  };
  const onboarding = new Onboarding({
    root,
    onStart,
    memoryProvider,
    status: { logError: (...args) => errors.push(args) },
    createWebProvider() { imports += 1; return {}; },
    createHelperProvider() { helpers += 1; return {}; },
  });
  return { onboarding, elements, errors, get imports() { return imports; }, get helpers() { return helpers; } };
}

test("sample starts once while a previous start is pending and releases the busy state", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const starts = [];
  const provider = { name: "sample" };
  const { onboarding, elements } = setup({ memoryProvider: provider, onStart: (value) => { starts.push(value); return pending; } });

  const first = onboarding.startSample();
  assert.equal(elements.get("#load-sample").disabled, true);
  assert.equal(await onboarding.startSample(), false);
  assert.deepEqual(starts, [provider]);
  finish();
  assert.equal(await first, true);
  assert.equal(elements.get("#load-sample").disabled, false);
});

test("the existing sample button uses the public guarded start path", async () => {
  const starts = [];
  const provider = { name: "sample" };
  const { elements } = setup({ memoryProvider: provider, onStart: async (value) => starts.push(value) });
  assert.equal(await elements.get("#load-sample").events.get("click")(), true);
  assert.deepEqual(starts, [provider]);
});

test("a failed sample start reports the error and permits a later attempt", async () => {
  let attempt = 0;
  const { onboarding, elements, errors } = setup({ onStart: async () => {
    if (attempt++ === 0) throw new Error("could not prepare sample");
  } });
  assert.equal(await onboarding.startSample(), false);
  assert.deepEqual(errors, [["가상 파일을 열지 못했습니다", "could not prepare sample"]]);
  assert.equal(elements.get("#load-sample").disabled, false);
  assert.equal(await onboarding.startSample(), true);
});

test("no memory provider means no sample start or provider creation", async () => {
  let starts = 0;
  const result = setup({ memoryProvider: null, onStart: async () => { starts += 1; } });
  assert.equal(await result.onboarding.startSample(), false);
  assert.equal(starts, 0);
  assert.equal(result.imports, 0);
  assert.equal(result.helpers, 0);
  assert.equal(result.elements.get("#memory-tools").hidden, true);
  assert.deepEqual(result.errors, []);
});

test("file entry focuses and reveals the drop target without reading or starting anything", () => {
  let starts = 0;
  const result = setup({ onStart: async () => { starts += 1; } });
  result.onboarding.focusWebImport();
  const target = result.elements.get('[data-drop="desktop"]');
  assert.deepEqual(target.focusOptions, { preventScroll: true });
  assert.deepEqual(target.scrollOptions, { block: "center" });
  assert.equal(starts, 0);
  assert.equal(result.imports, 0);
  assert.equal(result.helpers, 0);
});

// Run the application's actual initialization function with its external adapters
// stubbed. Importing the whole application would initialize a WebGL board and DOM.
const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
const start = appSource.indexOf("async function initialize() {");
const end = appSource.lastIndexOf("\ninitialize();");
assert.ok(start >= 0 && end > start, "app initialization boundaries exist");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const initialize = new AsyncFunction("params", "memoryMode", "WebDropProvider", "onboarding", "window", "history", "location", `${appSource.slice(start, end)}\nreturn initialize();`);

async function enter(query, supported = true) {
  const calls = [];
  const params = new URLSearchParams(query);
  const location = { href: `http://localhost:5174/index.html?${query}` };
  const onboarding = {
    showUnsupported: (...args) => calls.push(["unsupported", ...args]),
    connectHelper: async (...args) => calls.push(["helper", ...args]),
    startSample: async () => calls.push(["sample"]),
    focusWebImport: () => calls.push(["files"]),
  };
  const history = { replaceState: (state, title, url) => calls.push(["clean-url", String(url)]) };
  await initialize(params, params.get("storage") === "memory", { isSupported: () => supported }, onboarding, { isSecureContext: true }, history, location);
  return calls;
}

test("the sample CTA entry starts immediately and does not prepare real file access", async () => {
  assert.deepEqual(await enter("entry=sample&storage=memory"), [["sample"]]);
});

test("the file CTA entry focuses import and waits for the user's drop", async () => {
  assert.deepEqual(await enter("entry=files"), [["files"]]);
});

test("normal URLs and storage=memory preserve the manual onboarding path", async () => {
  assert.deepEqual(await enter(""), []);
  assert.deepEqual(await enter("storage=memory"), []);
  assert.deepEqual(await enter("entry=unknown"), []);
});

test("Helper connection takes precedence and still removes credentials from the address", async () => {
  const calls = await enter("entry=sample&storage=memory&helper=5175&token=test-token");
  assert.deepEqual(calls, [
    ["clean-url", "http://localhost:5174/index.html?entry=sample&storage=memory"],
    ["helper", "5175", "test-token"],
  ]);
});

test("incomplete or empty Helper parameters do not fall through to either CTA entry", async () => {
  for (const query of ["entry=sample&helper=5175", "entry=files&token=test-token", "entry=sample&helper=", "entry=files&token="]) {
    assert.deepEqual(await enter(query), [], query);
  }
});

test("the existing unsupported-browser notice remains on the file path", async () => {
  const calls = await enter("entry=files", false);
  assert.equal(calls[0][0], "unsupported");
  assert.deepEqual(calls[1], ["files"]);
  assert.deepEqual(await enter("entry=sample&storage=memory", false), [["sample"]]);
});
