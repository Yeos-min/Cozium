/**
 * finish-desk.js — 정리 결과 = 정리된 노트북 바탕화면 (2026-10-18, 사용자 선택).
 *
 * 랜딩 → 노트북 바탕화면(가져오기) → 다락방 → 다시 그 바탕화면으로 나온다. 처음엔 정리 전 모습이고,
 * 옮긴 파일이 각자 폴더로 날아 들어가 안 치운 파일만 남는다. 오른쪽 창이 결과(다 치웠어요 / 여기까지 정리했어요).
 *
 * 체험 모드는 디스크가 그대로라 창에서 Desktop Helper로 적용하거나 계획을 저장한다(js/state/cleanup-plan.js).
 * Helper 모드는 이미 옮겨져 있다. 샘플은 적용할 게 없다.
 * 이 모듈은 보여 주기와 적용 단추만 맡는다. 무엇을 보여 줄지(report)는 app.js가 만든다.
 */
import { extensionOf, familyOf } from "./layout.js";
import { enableDrag, enableResize } from "./win-frame.js";
import { applyPlan, clearPendingPlan, pathLabel, planFileName, savePendingPlan, splitPlan, undoApplied } from "../state/cleanup-plan.js";

const ICONS = "./assets/landing/parts/desktop-v4/icons/";
const ICON_BY_FAMILY = { image: "photo", design: "photo", video: "video", audio: "audio", archive: "archive" };
const CELL = { w: 100, h: 104 };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fileIcon = (name) => `${ICONS}${ICON_BY_FAMILY[familyOf(extensionOf(name))] ?? "document"}.webp`;
/** 폴더는 모든 화면에서 한 색(갈색·샌드, 10-18 사용자). 초록·갈색을 섞으면 뜻이 있는 줄 안다. */
const folderIcon = () => `${ICONS}folder-sand.webp`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduced() ? 0 : ms));
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function formatElapsed(ms) {
  if (!(ms > 0)) return "—";
  const s = Math.round(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h) return `${h}시간 ${m % 60}분`;
  if (m) return `${m}분 ${s % 60}초`;
  return `${s}초`;
}

/**
 * @param {{ root: HTMLElement, onBack: (report) => void, connectHelper: (port: string, token: string) => Promise<object|null>, notice: (text: string, tone?: string) => void }} options
 */
export function mountFinishDesk({ root, onBack, connectHelper, notice = () => {} }) {
  const $ = (selector) => root.querySelector(selector);
  const desk = $(".desk"), icons = $("#finish-icons"), win = $("#win-finish");
  const kicker = $("#finish-kicker"), title = $("#finish-title"), lede = $("#finish-lede"), stats = $("#finish-stats");
  const folderList = $("#finish-folders"), left = $("#finish-left"), apply = $("#finish-apply");
  const back = $("#finish-back"), replay = $("#finish-replay"), clock = $("#finish-clock");
  let report = null, helper = null, applied = null, busy = false, runId = 0;

  /** 제목: 글자마다 통통 튀어 들어온다. [보통 글, 강조 글] */
  function setTitle([plain, accent]) {
    title.replaceChildren();
    title.setAttribute("aria-label", plain + accent);
    let i = 0;
    const letters = (text, parent) => {
      for (const ch of text) {
        const span = el("span", "finish-ch", ch);
        span.style.setProperty("--i", String(i++));
        span.setAttribute("aria-hidden", "true");
        parent.append(span);
      }
    };
    letters(plain, title);
    const em = el("em");
    letters(accent, em);
    title.append(em);
  }

  /** 「치운 파일」 숫자: 파일이 폴더에 들어갈 때마다 하나씩 오른다. */
  const counter = {
    node: null, value: 0,
    bind(node) { this.node = node; this.paint(); },
    set(value) { this.value = value; this.paint(); },
    bump() {
      this.value = Math.min(report.done, this.value + 1);
      this.paint();
      if (!this.node) return;
      this.node.classList.remove("is-tick"); void this.node.offsetWidth; this.node.classList.add("is-tick");
    },
    paint() { if (this.node) this.node.textContent = String(this.value); },
  };

  // 창: 제목줄로 끌고, 가장자리·모서리로 크기를 바꾼다. 놓으면 아이콘을 창 옆으로 다시 깐다.
  const relayout = () => { if (root.dataset.stage === "after" && lastItems) { layout(lastItems, { animate: false }); finishBadges(); } };
  const frameInset = { left: 30, top: 30, right: 30, bottom: 56 + 30 + 12 };
  enableDrag(win, $("#win-finish .win-bar"), { container: desk, inset: frameInset, onChange: relayout });
  enableResize(win, { container: desk, minW: 400, minH: 320, inset: frameInset, onChange: relayout });

  const tick = () => {
    const now = new Date();
    clock.textContent = `${now.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}\n${now.getMonth() + 1}. ${now.getDate()}.`;
  };
  setInterval(tick, 15000);

  // ── 바탕화면 아이콘: 폴더 먼저, 위에서 아래로 줄을 채우고 다음 줄(가져오기 화면과 같은 규칙) ──
  function grid(count) {
    const bounds = { width: desk.clientWidth, height: desk.clientHeight }; // 바탕화면 단위(zoom, desk-scale.js)
    const left0 = 44, top0 = 44;
    const right = bounds.width > 900 ? win.offsetLeft - 24 : bounds.width - 30;
    const rows = Math.max(1, Math.floor((bounds.height - 56 - 30 - 30 - top0) / CELL.h));
    const cols = Math.max(1, Math.floor((right - left0) / CELL.w));
    return { rows, capacity: rows * cols, at: (i) => ({ x: left0 + Math.floor(i / rows) * CELL.w, y: top0 + (i % rows) * CELL.h }), count };
  }

  function iconNode(item, pos, i) {
    const li = el("li", "desk-file finish-file");
    li.style.left = `${pos.x}px`;
    li.style.top = `${pos.y}px`;
    li.style.animationDelay = `${Math.min(1, Math.sqrt(i) * 0.07)}s`;
    const img = el("img");
    img.src = item.icon;
    img.alt = "";
    li.append(img, el("b"), el("span", null, item.name));
    if (item.kind === "folder") {
      li.dataset.kind = "folder";
      li.dataset.name = item.name;
      if (item.isNew) li.dataset.new = "true";
      li.append(el("em", "finish-badge", item.count ? `+${item.count}` : ""));
      if (!item.count) li.querySelector(".finish-badge").hidden = true;
    }
    li.title = item.to ? `${item.name} → ${item.to}` : item.name;
    return li;
  }

  let lastItems = null; // 지금 깔린 아이콘(창을 옮기거나 늘리면 다시 깐다)
  function layout(items, { animate = true } = {}) {
    lastItems = items;
    const g = grid(items.length);
    const shown = items.length > g.capacity ? items.slice(0, g.capacity - 1) : items;
    const nodes = shown.map((item, i) => [item, iconNode(item, g.at(i), i)]);
    if (shown.length < items.length) {
      const more = iconNode({ kind: "more", name: `외 ${items.length - shown.length}개`, icon: `${ICONS}document.webp` }, g.at(shown.length), shown.length);
      more.classList.add("more");
      more.querySelector("b").textContent = `+${items.length - shown.length}`;
      nodes.push([null, more]);
    }
    if (!animate) for (const [, node] of nodes) node.style.animation = "none";
    icons.replaceChildren(...nodes.map(([, node]) => node));
    return nodes;
  }

  /** 파일이 부딪힌 폴더는 조금씩 비뚤어진다(마지막에 자동 정렬로 반듯해진다). 폴더 이름 → { x, y, r } */
  const nudges = new Map();
  const clampN = (v, m) => Math.max(-m, Math.min(m, v));
  function nudge(node) {
    const n = nudges.get(node.dataset.name) ?? { x: 0, y: 0, r: 0 };
    n.x = clampN(n.x + (Math.random() - 0.5) * 9, 14);
    n.y = clampN(n.y + (Math.random() - 0.5) * 6, 9);
    n.r = clampN(n.r + (Math.random() - 0.5) * 9, 12);
    nudges.set(node.dataset.name, n);
    paintNudge(node, n);
  }
  const paintNudge = (node, n) => { node.style.translate = `${n.x.toFixed(1)}px ${n.y.toFixed(1)}px`; node.style.rotate = `${n.r.toFixed(1)}deg`; };

  /**
   * 마무리: 아이콘 자동 정렬(10-18 사용자 선택). 비뚤어진 폴더가 왼쪽 위부터 차례로 「탁」 격자에 맞춰 서고,
   * 다 치웠을 때는 다 선 뒤 바탕화면 아이콘이 한 번 숨 쉬듯 커졌다 돌아온다.
   */
  async function arrange(id) {
    const folderNodes = [...icons.querySelectorAll('[data-kind="folder"]')];
    for (const node of folderNodes) { const n = nudges.get(node.dataset.name); if (n) paintNudge(node, n); }
    await wait(420);
    if (id !== runId) return;
    let last = 0;
    folderNodes.forEach((node, i) => {
      const n = nudges.get(node.dataset.name);
      if (!n) return;
      const delay = i * 45;
      node.animate([
        { translate: `${n.x}px ${n.y}px`, rotate: `${n.r}deg` },
        { translate: "0px -3px", rotate: "0deg", offset: 0.6 },
        { translate: "0px 0px", rotate: "0deg" },
      ], { duration: 280, delay, easing: "cubic-bezier(.3, 1.3, .5, 1)", fill: "backwards" });
      setTimeout(() => { node.style.translate = ""; node.style.rotate = ""; }, delay);
      last = Math.max(last, delay + 280);
    });
    nudges.clear();
    if (report.variant !== "done") return;
    await wait(last + 160);
    if (id !== runId) return;
    for (const node of icons.querySelectorAll(".finish-file")) {
      node.querySelector("img")?.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 620, easing: "ease-in-out" });
    }
  }

  /** 폴더에 들어갈 때: 꿀꺽, 배지 +1, 살짝 비뚤어짐. */
  function gulp(target, count) {
    nudge(target);
    const badge = target.querySelector(".finish-badge");
    badge.hidden = false;
    badge.textContent = `+${count}`;
    badge.classList.remove("is-pop"); void badge.offsetWidth; badge.classList.add("is-pop");
    target.classList.remove("is-gulp"); void target.offsetWidth; target.classList.add("is-gulp");
  }

  /**
   * before: 정리 전(옮긴 파일도 제자리). 그다음 옮긴 파일이 포물선을 그리며 자기 폴더로 날아 들어가고(치운 파일 숫자가 하나씩 오른다),
   * 남은 것만 다시 깐다.
   */
  async function play() {
    const id = ++runId;
    nudges.clear();
    const { folders, files } = report.desktop;
    const folderItems = folders.map((folder) => ({ kind: "folder", name: folder.name, isNew: folder.isNew, icon: folderIcon(folder.name), count: 0 }));
    const fileItems = files.map((file) => ({ kind: "file", name: file.name, to: file.to ?? null, icon: fileIcon(file.name) }));
    const after = [...folderItems, ...fileItems.filter((item) => !item.to)];
    root.dataset.stage = "before";
    const moving = fileItems.filter((item) => item.to);
    if (!moving.length || reduced()) {
      layout(after);
      root.dataset.stage = "after";
      finishBadges();
      counter.set(report.done);
      return;
    }
    counter.set(report.variant === "plan" ? report.done : Math.max(0, report.done - moving.length));
    const nodes = layout([...folderItems, ...fileItems]);
    await wait(900 + Math.min(900, Math.sqrt(nodes.length) * 60));
    if (id !== runId) return;

    // 옮긴 파일 → 포물선으로 그 폴더 아이콘에 들어간다(멀수록 조금 더 높이, 장마다 살짝 다른 회전)
    const folderNode = new Map(nodes.filter(([item]) => item?.kind === "folder").map(([item, node]) => [item.name, node]));
    const counts = new Map();
    const flying = nodes.filter(([item]) => item?.to);
    const step = Math.min(0.06, 1.6 / Math.max(1, flying.length)); // 많으면 더 촘촘히(전체 1.6초 안)
    let lastLanding = 0;
    flying.forEach(([item, node], k) => {
      const target = folderNode.get(item.to);
      const delay = k * step * 1000;
      node.style.animation = "none";
      if (!target) { node.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.6)" }], { duration: 400, delay, fill: "forwards" }); return; }
      const dx = target.offsetLeft - node.offsetLeft, dy = target.offsetTop - node.offsetTop;
      const lift = 50 + Math.min(140, Math.hypot(dx, dy) * 0.22);
      const spin = (k % 2 ? 1 : -1) * (8 + (k % 5) * 4);
      const duration = 560 + Math.min(260, Math.hypot(dx, dy) * 0.25);
      node.style.zIndex = "4";
      node.animate([
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.08}px, ${-14}px) scale(1.08) rotate(${-spin * 0.3}deg)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(0.8) rotate(${spin}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.32) rotate(${spin * 1.5}deg)`, opacity: 0.2, offset: 1 },
      ], { duration, delay, easing: "cubic-bezier(.4, 0, .6, 1)", fill: "forwards" });
      lastLanding = Math.max(lastLanding, delay + duration);
      setTimeout(() => {
        if (id !== runId) return;
        counts.set(item.to, (counts.get(item.to) ?? 0) + 1);
        gulp(target, counts.get(item.to));
        counter.bump();
      }, delay + duration - 40);
    });
    await wait(lastLanding + 380);
    if (id !== runId) return;
    root.dataset.stage = "after";
    layout(after, { animate: false });
    for (const node of icons.querySelectorAll(".finish-file:not([data-kind])")) node.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
    finishBadges();
    counter.set(report.done);
    arrange(id);
  }

  function finishBadges() {
    for (const node of icons.querySelectorAll('[data-kind="folder"]')) {
      const folder = report.desktop.folders.find((f) => f.name === node.dataset.name);
      const badge = node.querySelector(".finish-badge");
      if (folder?.count) { badge.hidden = false; badge.textContent = `+${folder.count}`; }
    }
  }

  // ── 결과 창 ──
  function renderSummary() {
    const r = report;
    root.dataset.variant = r.variant;
    kicker.textContent = r.modeText;
    setTitle(r.variant === "done" ? ["다 치웠어요", "!"] : r.variant === "plan" ? ["저장한 ", "정리 계획"] : ["여기까지 ", "정리했어요"]);
    const folderCount = r.folders.length;
    lede.textContent = r.variant === "plan"
      ? `${r.planDate} 방에서 정리한 그대로, 파일 ${r.done}개를 폴더 ${folderCount}개로 옮겨요.`
      : r.done === 0
        ? "아직 옮긴 파일이 없어요. 방으로 돌아가 상자에 넣어 보세요."
        : `파일 ${r.total}개 중 ${r.done}개를 폴더 ${folderCount}개에 나눴어요.` + (r.variant === "done" ? " 바닥이 다 드러났어요." : " 나머지는 바탕화면에 그대로 둬요.");
    stats.replaceChildren(...[
      ["치운 파일", "done", r.variant === "plan" ? "" : `/ ${r.total}`],
      ["폴더", `${folderCount}`, r.newFolders ? `새 폴더 ${r.newFolders}` : ""],
      ...(r.variant === "plan" ? [] : [["걸린 시간", formatElapsed(r.elapsedMs), ""]]),
    ].map(([label, value, sub]) => {
      const div = el("div");
      const dd = el("dd");
      const num = el("span", "finish-num", value === "done" ? "0" : value);
      if (value === "done") counter.bind(num);
      dd.append(num);
      if (sub) dd.append(el("small", null, ` ${sub}`));
      div.append(el("dt", null, label), dd);
      return div;
    }));
    folderList.replaceChildren(...r.folders.map((folder) => {
      const li = el("li");
      const details = el("details");
      const summary = el("summary");
      const img = el("img");
      img.src = folderIcon(String(folder.label).split(" › ")[0]);
      img.alt = "";
      summary.append(img, el("span", null, folder.label), el("b", null, `${folder.names.length}개`));
      if (folder.isNew) summary.querySelector("span").append(el("i", null, "새 폴더"));
      details.append(summary, el("p", null, folder.names.join(", ")));
      li.append(details);
      return li;
    }));
    folderList.hidden = !r.folders.length;
    left.textContent = r.variant === "plan" || !r.remaining
      ? ""
      : r.variant === "done" ? "" : `남은 파일 ${r.remaining}개는 바탕화면에 그대로 있어요. 다음에 이어서 치워도 돼요.`;
    left.hidden = !left.textContent;
    back.textContent = r.variant === "plan" ? "닫기" : "방으로 돌아가기";
    back.hidden = false;
    replay.hidden = !r.desktop.files.some((file) => file.to);
  }

  // ── 적용(모드별) ──
  function renderApply(state = "idle", extra = {}) {
    apply.replaceChildren();
    const r = report;
    const box = el("div", "finish-apply-box");
    apply.append(box);
    apply.dataset.state = state;
    if (r.modeKind === "helper") {
      box.append(el("p", "finish-apply-ok", "✓ 상자에 넣을 때마다 이미 실제로 옮겨졌어요. 탐색기에서 확인해 보세요."));
      return;
    }
    if (r.modeKind === "memory") {
      box.append(el("p", null, "샘플이라 디스크와는 상관없어요. 내 바탕화면으로 해 보려면 처음 화면에서 내 파일을 끌어다 놓으세요."));
      return;
    }
    if (!r.plan?.moves.length) {
      box.append(el("p", null, "옮긴 게 없어서 바탕화면에 적용할 것도 없어요."));
      return;
    }
    const { auto, manual } = splitPlan(r.plan);
    if (state === "idle") {
      box.append(
        el("p", "finish-apply-head", "아직 디스크는 그대로예요"),
        el("p", null, `Desktop Helper로 방에서 정리한 그대로 파일 ${auto.length}개를 진짜 바탕화면에서 옮겨요. 덮어쓰지 않고, 되돌릴 수 있어요.`),
      );
      if (manual.length) box.append(el("p", "finish-apply-note", `폴더 안에서 꺼낸 파일 ${manual.length}개는 Helper가 못 옮겨요 — 직접 옮겨 주세요.`));
      const row = el("div", "finish-apply-row");
      const go = el("button", "win-go", "Helper로 적용");
      go.type = "button";
      go.disabled = !auto.length;
      go.addEventListener("click", () => (helper ? renderApply("ready") : renderApply("connect")));
      const save = el("button", "win-button", "계획 파일 저장");
      save.type = "button";
      save.addEventListener("click", downloadPlan);
      row.append(go, save);
      box.append(row, el("p", "finish-apply-note", "계획은 이 브라우저에도 기억해 둬요 — 나중에 Helper를 켜면 열리는 화면에서 바로 적용돼요."));
      return;
    }
    if (state === "connect") {
      box.append(el("p", "finish-apply-head", "Desktop Helper 연결"));
      const steps = el("ol", "howto");
      const a = el("a", null, "Desktop Helper");
      a.href = "https://github.com/min20011009/desktop-cleanup-prototype/releases";
      a.target = "_blank";
      a.rel = "noopener";
      const s1 = el("li"); s1.append(a, "를 받아 실행해요. 새 탭이 열리면 거기 Helper 창에서 이 계획을 적용할 수 있어요.");
      steps.append(s1, el("li", null, "이 화면에서 하려면 Helper 창에 나온 포트와 토큰을 넣고 연결하세요."));
      const form = el("form", "helper-form");
      form.autocomplete = "off";
      const port = el("input"); port.placeholder = "포트"; port.inputMode = "numeric"; port.setAttribute("aria-label", "Helper 포트");
      const token = el("input"); token.placeholder = "토큰"; token.setAttribute("aria-label", "Helper 토큰");
      const submit = el("button", "win-button", "연결"); submit.type = "submit";
      form.append(port, token, submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        busy = true; submit.disabled = true;
        try {
          helper = await connectHelper(port.value.trim(), token.value.trim());
        } finally {
          busy = false; submit.disabled = false;
        }
        if (helper) renderApply("ready");
      });
      const cancel = el("button", "win-link", "← 돌아가기"); cancel.type = "button";
      cancel.addEventListener("click", () => renderApply("idle"));
      box.append(steps, form, cancel);
      port.focus({ preventScroll: true });
      return;
    }
    if (state === "ready") {
      box.append(
        el("p", "finish-apply-head", `‘${helper.desktopName ?? "바탕화면"}’에 연결됨`),
        el("p", null, `파일 ${auto.length}개를 폴더로 옮겨요. 바탕화면에 없거나 크기가 달라진 파일, 같은 이름이 이미 있는 파일은 건너뛰어요.`),
      );
      const go = el("button", "win-go", `파일 ${auto.length}개 바탕화면에 적용`); go.type = "button";
      go.addEventListener("click", runApply);
      box.append(go);
      return;
    }
    if (state === "applying") {
      box.append(el("p", "finish-apply-head", "바탕화면에 적용하는 중…"), el("p", "finish-apply-progress", extra.text ?? ""));
      return;
    }
    if (state === "applied") {
      const a = applied;
      box.append(el("p", "finish-apply-ok", `✓ ${a.moved.length}개를 실제로 옮겼어요${a.created.length ? ` · 새 폴더 ${a.created.length}개 만듦` : ""}.`));
      const problems = [...a.failed.map((f) => `${f.name} — ${f.reason}`), ...a.manual.map((m) => `${m.name} — 직접 옮겨 주세요 (${pathLabel(m.from)} → ${pathLabel(m.to)})`)];
      if (problems.length) {
        const details = el("details", "finish-problems");
        details.append(el("summary", null, `옮기지 않은 것 ${problems.length}개`));
        const ul = el("ul");
        ul.append(...problems.map((text) => el("li", null, text)));
        details.append(ul);
        box.append(details);
      }
      if (a.batchIds.length) {
        const undo = el("button", "win-button", "방금 적용한 것 되돌리기"); undo.type = "button";
        undo.addEventListener("click", runUndo);
        box.append(undo, el("p", "finish-apply-note", "되돌리기는 이 화면을 닫기 전까지만 돼요. 새로 만든 폴더는 그대로 남아요(지우는 기능은 없어요)."));
      }
      return;
    }
    if (state === "undone") {
      box.append(el("p", "finish-apply-ok", `↶ ${extra.restored}개를 원래 자리로 돌려놨어요${extra.failed ? ` · ${extra.failed}개는 못 돌림` : ""}.`));
    }
  }

  function downloadPlan() {
    const blob = new Blob([JSON.stringify(report.plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = planFileName(report.plan);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    notice("정리 계획을 저장했어요. Helper를 켠 뒤 가져오기 화면의 Helper 창에서 불러오면 돼요.", "success");
  }

  async function runApply() {
    if (busy || !helper) return;
    busy = true;
    back.disabled = true;
    renderApply("applying", { text: "바탕화면 읽는 중" });
    try {
      applied = await applyPlan(report.plan, helper, {
        onProgress: ({ step, done, total, folder }) => {
          const text = step === "scan" ? "바탕화면 읽는 중" : step === "move" ? `${folder}(으)로 옮기는 중 · ${done}/${total}` : "마무리 중";
          apply.querySelector(".finish-apply-progress").textContent = text;
        },
      });
      if (applied.moved.length) {
        clearPendingPlan();
        setTitle(["바탕화면에 ", "적용했어요"]);
      }
      renderApply("applied");
      // 진짜 바탕화면으로 다시 그린다: 옮긴 파일이 폴더로 날아간다
      const movedNames = new Map(applied.moved.map((m) => [m.name.toLocaleLowerCase(), m.to[0]]));
      const before = { folders: helper.folders.filter((f) => !f.parentId), files: helper.files };
      report.desktop = {
        folders: before.folders.map((f) => ({ name: f.name, count: applied.moved.filter((m) => m.to[0] === f.name).length, isNew: applied.created.some((p) => p.length === 1 && p[0] === f.name) })),
        files: before.files.map((f) => ({ name: f.name, to: movedNames.get(f.name.toLocaleLowerCase()) ?? null })),
      };
      replay.hidden = false;
      play();
    } catch (error) {
      notice(`적용하지 못했어요: ${error?.message ?? error}`, "error");
      renderApply("ready");
    } finally {
      busy = false;
      back.disabled = false;
    }
  }

  async function runUndo() {
    if (busy || !applied) return;
    busy = true;
    try {
      const result = await undoApplied(applied, helper);
      applied = null;
      renderApply("undone", { restored: result.restored.length, failed: result.failed.length });
    } finally {
      busy = false;
    }
  }

  back.addEventListener("click", () => {
    if (busy) return;
    const leaving = report;
    close();
    onBack(leaving);
  });
  replay.addEventListener("click", () => play());

  function close() {
    runId++;

    root.hidden = true;
    root.classList.remove("is-arriving");
  }

  return {
    get open() {
      return !root.hidden;
    },
    /** report: app.js가 만든 결과. connected: 이미 연결된 Helper(가져오기 화면에서 계획을 열었을 때). */
    show(next, { connected = null } = {}) {
      report = next;
      helper = connected ?? helper;
      applied = null;
      if (report.plan && report.modeKind === "web") savePendingPlan(report.plan);
      tick();
      root.hidden = false;
      root.classList.remove("is-arriving"); void root.offsetWidth; root.classList.add("is-arriving");
      renderSummary();
      renderApply(report.variant === "plan" && helper ? "ready" : "idle");
      requestAnimationFrame(() => play());
      back.focus({ preventScroll: true });
    },
    close,
  };
}
