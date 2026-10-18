/**
 * app.js — 조립만 한다.
 *
 * Provider(파일 시스템) ↔ 세션 스토어 ↔ 보드/온보딩/기록을 연결하고, 단축키와 pagehide를 건다.
 * 보드는 Provider가 무엇인지 모른다. capabilities로 라벨만 바뀐다.
 *
 * URL 파라미터:
 *   ?helper=PORT&token=…    Desktop Helper가 브라우저를 열 때 붙여 준다 → 자동 연결
 *   ?storage=memory         디스크를 건드리지 않는 샘플 (개발용)
 *   ?entry=sample|files     랜딩에서 샘플 바로 시작 / 내 파일 드롭 화면
 *   &capacity=16&refill=6   보드 정원 / 파동 임계 [임시]
 *   &seed=123               배치 시드
 *   &delay=0                (memory) 이동 지연 시뮬레이션 끄기
 *   &layout=grid            이전 격자 배치로 비교 (기본 3D는 겹침 없는 회전 배치)
 */
import { MemoryProvider } from "./providers/memory-provider.js";
import { SAMPLE_FOLDERS } from "./providers/sample-desktop.js";
import { NativeHelperProvider } from "./providers/native-helper-provider.js";
import { WebDropProvider } from "./providers/web-drop-provider.js";
import { MAX_BOXES, SessionStore } from "./state/session-store.js";
import { Board3D } from "./three/board-3d.js";
import { ATTIC_CARD, ATTIC_FLOOR_LAYOUT, ATTIC_HOME_CAPACITY, atticSlotArea } from "./three/attic-room.js";
import { fileHome } from "./three/file-homes.js";
import { playBoundsFor } from "./ui/board-layout.js";
import { Onboarding } from "./ui/onboarding.js";
import { mountImportDesk } from "./ui/import-desk.js";
import { mountRoomIntro } from "./ui/room-intro.js";
import { mountFinishDesk } from "./ui/finish-desk.js";
import { buildPlan, loadPendingPlan, parsePlan, pathLabel, planGroups, splitPlan } from "./state/cleanup-plan.js";
import { StatusPanel } from "./ui/status.js";
import { FolderInterior } from "./ui/folder-interior.js";
import { TUNING, UNIT } from "./three/tuning.js";

// 페이지 안 링크(처음으로·이용 안내)는 사이트 뿌리 기준으로 다시 건다(10-18 사용자: 미리보기 서버에서 「처음으로」가
// Not Found). "./"는 서버가 폴더 주소를 어떻게 푸느냐에 따라 엉뚱한 곳(…/app/index.html)으로 갈 수 있다.
// 이 스크립트(js/app.js)의 자리는 늘 맞으니 거기서 한 칸 위가 사이트 뿌리다.
const SITE_ROOT = new URL("../", import.meta.url);
for (const link of document.querySelectorAll('a[href^="./"]')) link.href = new URL(link.getAttribute("href"), SITE_ROOT).href;

const params = new URLSearchParams(location.search);
const memoryMode = params.get("storage") === "memory";
function intParam(name, fallback, min, max) {
  const value = Number.parseInt(params.get(name) ?? "", 10);
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

const $ = (selector) => document.querySelector(selector);
const elements = {
  modePill: $("#mode-pill"),
  onboarding: $("#onboarding"),
  stage: $("#stage"),
  boardRoot: $("#board-root"),
  summary: $("#stage-summary"),
  newFolderForm: $("#new-folder-form"),
  newFolderName: $("#new-folder-name"),
  placement: $("#placement"),
  renderQuality: $("#render-quality"),
  outlineThickness: $("#outline-thickness"),
  dithering: $("#dithering"),
  vertexWobble: $("#vertex-wobble"),
  undoButton: $("#undo-button"),
  planTitle: $("#plan-title"),
  plan: $("#plan"),
  panelToggle: $("#panel-toggle"),
  arrangeToggle: $("#arrange-toggle"),
  finishButton: $("#finish-button"),
  finish: $("#finish"),
  stageSide: $(".stage-side"),
  progressHud: $("#progress-hud"),
  progressDone: $("#progress-done"),
  progressTotal: $("#progress-total"),
  progressFill: $("#progress-fill"),
};

const store = new SessionStore({
  // 24장의 앞면이 모두 보이도록 펼치고 작은 무작위 회전만 준다. [임시]
  capacity: intParam("capacity", 24, 1, 64),
  // -1 = 자동 보충 없음. 책상을 다 치우면 바닥이 드러나고, 다음 무더기는 더미를 눌러 꺼낸다. [임시]
  refillBelow: intParam("refill", -1, -1, 64),
  bounds: playBoundsFor("bottom"),
  // 다락방(10-11): 사진·메모는 핀보드, 문서는 책 더미에서 시작한다. 정원이 차면 바닥.
  layout: params.get("layout") === "grid" ? {} : {
    mode: "floor", card: ATTIC_CARD, floor: ATTIC_FLOOR_LAYOUT, slotArea: atticSlotArea(UNIT), home: fileHome, homeCapacity: ATTIC_HOME_CAPACITY,
  },
  seed: params.has("seed") ? intParam("seed", 0, 0, 2 ** 31) : undefined,
});

const status = new StatusPanel({ notices: [$("#onboarding-notice"), $("#notice")], log: $("#log") });

// 콘솔에서 상태를 들여다보기 위한 손잡이. 읽기용이다. (3D 쪽은 window.__board, window.__tuning)
if (typeof window !== "undefined") {
  window.__app = {
    store,
    get provider() {
      return provider;
    },
    get board() {
      return board;
    },
    get desk() {
      return desk;
    },
    moveTo: (fileIds, folderId) => moveTo(fileIds, folderId), // 자동 점검용(손 대신 상자에 넣기)
  };
}

/** @type {import("./providers/file-system-provider.js").FileSystemProvider|null} */
let provider = null;
let board = null;
let labels = { verb: "옮김", mode: "체험" };
/** 이번 정리의 시작 시각(방에 들어간 순간)과 방에서 만든 폴더. 결과 화면이 쓴다. */
const session = { startedAt: 0, createdFolders: new Set(), autoFinished: false };

// ───────────────────────── Provider 작업은 한 번에 하나씩 ─────────────────────────

let chain = Promise.resolve();
let pending = 0;

function run(task) {
  pending += 1;
  updateBar();
  const next = chain.then(task, task);
  chain = next
    .catch(() => {})
    .finally(() => {
      pending -= 1;
      updateBar();
    });
  return next;
}

// ───────────────────────── 제스처 → 파일 작업 ─────────────────────────

async function moveTo(fileIds, folderId) {
  const folder = store.folder(folderId);
  if (!folder || !provider) return;
  const { ids } = store.beginBatch(fileIds, folderId);
  if (ids.length === 0) return;
  store.leaveToRoot(); // 칸에 넣었으면 줄을 배송지 목록으로 되돌린다 (스프링 폴더처럼 닫힌다) [임시]

  const folderName = store.folderLabel(folderId);
  await run(async () => {
    try {
      const result = await provider.moveBatch(ids, folderId, {
        onItem: (id, stage) => store.setItemStage(id, stage),
      });
      store.applyMoveResult(result);
      status.logMove(result, { folderName, verb: labels.verb });
    } catch (error) {
      store.applyMoveResult({
        batchId: "",
        folderId,
        moved: [],
        failed: ids.map((id) => ({
          fileId: id,
          fileName: store.entry(id)?.item.name ?? id,
          code: error?.code ?? "MOVE_FAILED",
          message: error?.message ?? "알 수 없는 오류",
        })),
      });
      status.logError("옮기는 중 오류", error?.message);
    }
  });
}

async function undoLastBatch() {
  if (board?.arranging) { board.undoBoxPlacement(); return; }
  const batch = store.lastBatch;
  if (!batch || pending > 0 || !provider) return;
  await run(async () => {
    try {
      const result = await provider.undoBatch(batch.batchId);
      store.applyUndoResult(result);
      status.logUndo(result, { folderName: store.folderLabel(batch.folderId), verb: labels.verb });
    } catch (error) {
      status.logError("되돌리기 실패", error?.message);
    }
  });
}

async function createFolder(name) {
  if (!provider?.capabilities.canCreateFolder) return;
  // 상자가 꽉 차면 만들지 않는다. Helper는 디스크에 진짜 폴더를 만드는데 상자가 안 생기면 안 된다.
  if (!store.canAddBox) {
    status.notice(`상자는 한 번에 ${MAX_BOXES}개까지예요. 새 폴더는 정리를 마치고 다음에 만드세요.`, "warn");
    return;
  }
  const parentId = store.level;
  await run(async () => {
    try {
      const folder = await provider.createFolder(parentId, name);
      store.addFolders([folder]);
      session.createdFolders.add(folder.id);
      status.logFolderCreated(folder, { real: provider.capabilities.realFiles });
    } catch (error) {
      status.logError("폴더를 만들지 못했습니다", error?.message);
    }
  });
}

// ───────────────────────── 배송지 열기 ─────────────────────────

const opening = new Set();
const interior = new FolderInterior({
  onActive: (active) => board?.setSuspended?.(active),
  onTarget: (folderId) => store.enterFolder(folderId),
  thumbnail: (id) => provider.readThumbnail(id),
  load: (folderId) => run(async () => {
    const contents = await provider.listContents(folderId);
    store.addFolders(contents.folders);
    store.addContainedFiles(contents.files, folderId);
    return { ...contents, folder: store.folder(folderId) };
  }),
  takeOut: (ids, folderId) => run(async () => {
    const result = await provider.takeOut(ids, folderId);
    store.applyTakeOutResult(result);
    if (result.failed.length) throw new Error(result.failed.map((item) => item.message).join(" "));
    status.notice(`${result.moved.length}개를 꺼냈습니다. 다른 상자에 넣거나 오른쪽 버튼으로 내려놓으세요.`, "info");
  }),
});

async function openFolder(folderId) {
  const folder = store.folder(folderId);
  if (!folder || opening.has(folderId) || !provider) return;
  if (typeof provider.listContents === "function") {
    if (pending > 0 || store.selection.length || interior.active) return;
    await interior.open(folderId);
    return;
  }
  if (folder.hasChildren === false) {
    status.notice(`'${store.folderLabel(folderId)}' 안에는 칸(하위 폴더)이 없습니다. 여기에 바로 넣으세요.`, "info");
    return;
  }
  opening.add(folderId);
  try {
    const children = await provider.listSubfolders(folderId);
    store.addFolders([{ ...folder, hasChildren: children.length > 0 }, ...children]);
    if (children.length === 0) {
      status.notice(`'${store.folderLabel(folderId)}' 안에는 칸(하위 폴더)이 없습니다. 여기에 바로 넣으세요.`, "info");
      return;
    }
    store.enterFolder(folderId);
  } catch (error) {
    status.logError("배송지를 열지 못했습니다", error?.message);
  } finally {
    opening.delete(folderId);
  }
}

// ───────────────────────── 화면 ─────────────────────────

// "책상을 치웠습니다" 알림을 한 파동에 한 번만 띄우기 위한 기억
let clearedNoticeShown = false;
let completedNoticeShown = false;

function updateBar() {
  if (elements.stage.hidden) return;
  const placed = store.placedCount;
  const { done, total } = store.progress;

  elements.progressDone.textContent = done;
  elements.progressTotal.textContent = `/ ${total}`;
  elements.progressFill.style.width = total > 0 ? `${(done / total) * 100}%` : "0%";
  elements.progressHud.dataset.complete = String(total > 0 && done === total);

  elements.summary.textContent =
    `바닥 ${store.unprocessedCount} · 더미 ${store.queuedCount} · 선택 ${store.selection.length}` +
    (pending > 0 ? " · 작업 중" : "");

  // 바닥이 드러난 순간을 놓치지 않게 알린다
  const cleared = store.unprocessedCount === 0 && store.queuedCount > 0 && pending === 0;
  if (cleared && !clearedNoticeShown) {
    clearedNoticeShown = true;
    status.notice(`바닥을 치웠습니다. 남은 ${store.queuedCount}개는 더미를 누를 때 꺼냅니다.`, "success");
  } else if (!cleared) {
    clearedNoticeShown = false;
  }
  const complete = total > 0 && done === total;
  if (complete && !completedNoticeShown) {
    completedNoticeShown = true;
    status.notice(`${total}개를 전부 치웠습니다.`, "success");
    // 다 치웠으면 잠깐 뒤 결과 화면(10-18). 마지막 카드가 상자에 들어가는 걸 보고 나서. 한 번만.
    if (!session.autoFinished) {
      session.autoFinished = true;
      setTimeout(() => {
        const now = store.progress;
        if (pending === 0 && now.total > 0 && now.done === now.total && !finishDesk.open && !interior.active) openFinish();
      }, 1600);
    }
  } else if (!complete) {
    completedNoticeShown = false;
  }
  elements.finishButton.dataset.done = String(complete);
  elements.finishButton.textContent = complete ? "다 치웠어요 · 결과 보기" : "정리 끝내기";
  const last = store.lastBatch;
  const arranging = board?.arranging;
  elements.arrangeToggle.hidden = !board?.setArranging;
  elements.arrangeToggle.textContent = arranging ? "상자 배치 모드 · Tab" : "파일 정리 모드 · Tab";
  elements.arrangeToggle.setAttribute("aria-pressed", String(!!arranging));
  elements.placement.disabled = !!arranging;
  elements.undoButton.disabled = pending > 0 || (arranging ? !board.canUndoArrangement : !last);
  elements.undoButton.querySelector(".undo-label").textContent = arranging ? "상자 배치 되돌리기" : last
    ? `마지막 더미 되돌리기 (${last.fileIds.length}개)`
    : "마지막 더미 되돌리기";
  renderPlan();
}

function renderPlan() {
  const rows = store.summary;
  elements.planTitle.textContent = provider?.capabilities.realFiles ? "정리 결과 · 탐색기에 반영됨" : "정리 계획 · 체험 (디스크는 그대로)";
  elements.plan.replaceChildren(
    ...(rows.length
      ? rows.map((row) => {
          const item = document.createElement("li");
          const head = document.createElement("strong");
          head.textContent = `${row.folder} · ${row.names.length}개`;
          const names = document.createElement("small");
          names.textContent = row.names.join(", ");
          item.append(head, names);
          return item;
        })
      : [Object.assign(document.createElement("li"), { className: "plan-empty", textContent: "아직 옮긴 파일이 없습니다." })]),
  );
}

async function startWith(nextProvider) {
  provider = nextProvider;
  const { realFiles, kind, canScan, canCreateFolder } = provider.capabilities;
  labels = realFiles ? { verb: "옮김", mode: "실제" } : { verb: "옮김 (체험)", mode: "체험" };
  elements.modePill.dataset.mode = kind;
  elements.modePill.textContent =
    kind === "helper" ? `실제 Desktop 연결 · ${provider.desktopName}` : kind === "memory" ? "샘플 · 디스크 안 건드림" : "웹 체험 · 디스크 안 건드림";
  $("#room-mode").textContent = elements.modePill.textContent;

  if (canScan) {
    try {
      const result = await provider.scan();
      status.logImport(result, { source: provider.desktopName });
    } catch (error) {
      status.logError("바탕화면을 읽지 못했습니다", error?.message);
      return;
    }
  }

  store.setFolders(provider.folders);
  const skipped = store.overflowFolders;
  if (skipped.length) {
    const names = skipped.slice(0, 3).map((folder) => `'${folder.name}'`).join(", ");
    status.notice(`상자는 한 번에 ${MAX_BOXES}개까지예요. 폴더 ${MAX_BOXES + skipped.length}개 중 ${MAX_BOXES}개만 가져왔어요 — 빠진 폴더: ${names}${skipped.length > 3 ? ` 외 ${skipped.length - 3}개` : ""}. 파일은 전부 왔어요.`, "warn");
  }
  elements.onboarding.hidden = true;
  elements.stage.hidden = false;
  // 정리 시작 화면(10-18): 방이 차려지는 동안 로딩, 다 되면 조작 안내. ?intro=0이면 건너뛴다(자동 점검용).
  const showIntro = params.get("intro") !== "0";
  if (showIntro) roomIntro.show({ modeText: elements.modePill.textContent, fileCount: provider.files.length });
  elements.newFolderForm.hidden = !canCreateFolder;
  // 게임 화면은 뷰포트를 채운다. 온보딩(나중에는 랜딩 페이지)은 평소 레이아웃 그대로다.
  document.body.classList.add("is-playing");

  elements.outlineThickness.value = TUNING.outline.thickness;
  elements.dithering.value = TUNING.dithering.preset;
  elements.vertexWobble.value = TUNING.vertexWobble.preset;
  $("#outline-thickness-value").value = `${TUNING.outline.thickness} px`;
  board = new Board3D({
    root: elements.boardRoot,
    store,
    labels,
    onDropToFolder: moveTo,
    onPullWave: () => store.supply({ force: true }),
    onOpenFolder: openFolder,
    onLeaveFolder: () => store.leaveFolder(),
    loadThumbnail: (item) => provider.readThumbnail(item.id),
  });
  session.startedAt = performance.now();
  session.createdFolders.clear();
  session.autoFinished = false;
  if (showIntro) {
    board.setSuspended(true); // 안내가 떠 있는 동안은 걷기·집기를 막는다. 「방에 들어가기」가 푼다
    roomIntro.track(board);
  }
  if (board.renderQuality) updateRenderQuality(board.renderQuality);
  if (board.placement) elements.placement.value = board.placement;
  store.addFiles(provider.files); // 보드가 붙은 뒤에 넣어야 쏟아지는 연출이 보인다
  updateBar();
  status.notice(
    realFiles
      ? "카드를 보고 클릭해 담고, 폴더를 보고 클릭하면 그 순간 실제로 옮겨집니다. Ctrl+Z로 되돌립니다."
      : "체험 모드입니다. 카드를 보고 클릭해 담고 폴더를 보고 클릭하세요. 디스크는 바뀌지 않고 정리 계획으로 남습니다.",
    "info",
  );
}

const roomIntro = mountRoomIntro({ root: $("#room-intro"), onEnter: () => { session.startedAt = performance.now(); board?.enter(); } });

// 가져오기 화면 = 노트북 바탕화면(2026-10-18). 보이는 것만 맡고 파일은 Onboarding이 읽는다.
const desk = mountImportDesk({ root: elements.onboarding, startSample: () => onboarding.startSample() });
const onboarding = new Onboarding({
  root: elements.onboarding,
  status,
  // 정리 계획 안내는 모듈이 다 읽힌 뒤에(처음 refresh는 Onboarding을 만드는 도중에 온다)
  onRefresh: (state) => { desk.refresh(state); queueMicrotask(() => refreshPlanOffer(state)); },
  beforeStart: () => desk.leave(),
  afterStart: () => desk.restore(),
  capacity: store.capacity,
  onStart: startWith,
  createWebProvider: () => new WebDropProvider(),
  createHelperProvider: ({ port, token }) => new NativeHelperProvider({ port, token }),
  memoryProvider: new MemoryProvider({ delay: params.get("delay") !== "0",
    folders: Array.from({ length: intParam("folders", 4, 1, 200) }, (_, index) =>
      SAMPLE_FOLDERS[index] ?? { name: `보관함 ${String(index + 1).padStart(2, "0")}` }),
  }),
});

store.subscribe(updateBar);

elements.newFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.newFolderName.value;
  if (!name.trim()) return;
  createFolder(name);
  elements.newFolderName.value = "";
});
elements.placement.addEventListener("change", (event) => board?.setPlacement(event.target.value));
function updateRenderQuality({ mode, active, profile, effects: on, scale = 1 }) {
  const effects = profile ? profile.effects : on ?? active !== "low";
  elements.renderQuality.value = mode;
  const label = active === "low" ? "가볍게 · 외곽선 생략" : active === "high" ? "선명하게" : "기본";
  $("#render-quality-state").value = scale < 1 ? `${label} · 해상도 ${Math.round(scale * 100)}%` : label;
  elements.outlineThickness.disabled = !effects;
}
elements.renderQuality.addEventListener("change", (event) => board?.setRenderQuality?.(event.target.value));
elements.boardRoot.addEventListener("renderqualitychange", (event) => updateRenderQuality(event.detail));
elements.outlineThickness.addEventListener("input", (event) => {
  TUNING.outline.thickness = Number(event.target.value);
  board?.refreshRenderStyle?.();
  $("#outline-thickness-value").value = `${event.target.value} px`;
});
elements.dithering.addEventListener("change", (event) => {
  TUNING.dithering.preset = event.target.value;
});
elements.vertexWobble.addEventListener("change", (event) => {
  TUNING.vertexWobble.preset = event.target.value;
});

elements.undoButton.addEventListener("click", undoLastBatch);

function toggleSidePanel(force) {
  const open = force ?? elements.stageSide.dataset.open !== "true";
  elements.stageSide.dataset.open = String(open);
  elements.panelToggle.setAttribute("aria-pressed", String(open));
  elements.panelToggle.setAttribute("aria-label", open ? "설정 및 기록 닫기" : "설정 및 기록 열기");
  if (open && document.pointerLockElement) document.exitPointerLock();
}
elements.panelToggle.addEventListener("click", () => toggleSidePanel());
elements.boardRoot.addEventListener("arrangementchange", updateBar);
function toggleArrangement() {
  if (pending > 0 || interior.active || !board?.setArranging) return;
  toggleSidePanel(false);
  board.setArranging(!board.arranging);
}
elements.arrangeToggle.addEventListener("click", toggleArrangement);

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isEditing =
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if (isEditing || elements.stage.hidden || interior.active) return;
  if (roomIntro.active) { if (event.key === "Tab") event.preventDefault(); return; } // 정리 시작 화면에서는 Enter만
  if (finishDesk.open) return; // 결과 화면은 방 조작을 받지 않는다
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === "Tab") {
    event.preventDefault();
    if (!event.repeat) toggleArrangement();
    return;
  }
  if (board?.arranging) {
    if (event.key === "Escape") { event.preventDefault(); board.cancelBoxPlacement(); }
    if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); board.undoBoxPlacement(); }
    // 배치 중 파일 선택, 파일 이동, 폴더 탐색 단축키는 전달하지 않는다.
    return;
  }

  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastBatch();
    return;
  }
  if (modifier && event.key.toLowerCase() === "a") {
    event.preventDefault();
    store.selectAll();
    return;
  }
  if (event.key === "Escape") {
    // 1인칭에서 Esc는 브라우저가 마우스를 풀어 주는 키다. 들고 있던 카드까지 내려놓지 않는다.
    if (board?.locked) return;
    if (store.level !== null) store.leaveFolder();
    else store.clearSelection();
    return;
  }
  if (event.key === "Backspace" && store.level !== null) {
    event.preventDefault();
    store.leaveFolder();
    return;
  }
  // 숫자 키(N번 상자에 넣기)는 2026-10-13 사용자 결정으로 뺐다. 상자는 보고 클릭해서 넣는다.
});

window.addEventListener("pagehide", () => {
  // Helper에 작별 인사. 실패해도 Helper는 idle 타이머로 스스로 꺼진다.
  provider?.disconnect?.();
});

async function initialize() {
  if (!memoryMode && !WebDropProvider.isSupported()) {
    onboarding.showUnsupported(
      window.isSecureContext
        ? "웹 체험은 최신 데스크톱 Chrome 또는 Edge에서 됩니다. Desktop Helper 연결은 그대로 쓸 수 있습니다."
        : "HTTPS 또는 localhost에서 열어야 합니다. file:// 로는 동작하지 않습니다.",
    );
  }
  const helperPort = params.get("helper");
  const helperToken = params.get("token");
  if (helperPort && helperToken) {
    // 주소창에 토큰이 남지 않게 지운다. 세션 동안은 메모리에만 있다.
    const clean = new URL(location.href);
    clean.searchParams.delete("helper");
    clean.searchParams.delete("token");
    history.replaceState(null, "", clean);
    await onboarding.connectHelper(helperPort, helperToken);
    return;
  }
  // 불완전한 Helper 주소도 파일/샘플 진입으로 바꾸지 않는다.
  if (params.has("helper") || params.has("token")) return;
  if (params.get("entry") === "sample") await onboarding.startSample();
  else if (params.get("entry") === "files") onboarding.focusWebImport();
}

initialize();

// ───────────────────────── 정리 끝내기 · 결과 화면 (2026-10-18) ─────────────────────────
// 다 치울 필요는 없다. "이 정도면 됐다"에서 끝내면 그 상태가 결과다. 체험 모드는 결과 화면에서 Helper로 적용하거나 계획을 저장한다.

/** 지금 방의 상태 → 결과 화면이 보여 줄 것 */
function buildFinishReport() {
  const kind = provider?.capabilities.kind ?? "memory";
  const { done, total } = store.progress;
  const rootOf = (folderId) => {
    const folder = store.folder(folderId);
    return folder?.path?.[0] ?? folder?.name ?? null;
  };
  const isNewFolder = (folder) => Boolean(folder?.virtual) || session.createdFolders.has(folder?.id);
  const tracked = store.files.filter((entry) => entry.tracked !== false);
  const groups = new Map();
  for (const entry of tracked) {
    if (entry.status !== "placed") continue;
    const label = store.folderLabel(entry.folderId);
    if (!groups.has(label)) groups.set(label, { label, names: [], isNew: isNewFolder(store.folder(entry.folderId)) });
    groups.get(label).names.push(entry.item.name);
  }
  const roots = (provider?.folders ?? []).filter((folder) => !folder.parentId);
  const counts = new Map();
  for (const entry of tracked) if (entry.status === "placed") counts.set(rootOf(entry.folderId), (counts.get(rootOf(entry.folderId)) ?? 0) + 1);
  return {
    variant: total > 0 && done === total ? "done" : "partial",
    modeKind: kind,
    modeText: elements.modePill.textContent,
    done,
    total,
    remaining: tracked.filter((entry) => entry.status !== "placed").length,
    elapsedMs: session.startedAt ? performance.now() - session.startedAt : 0,
    newFolders: [...roots, ...(provider?.folders ?? [])].filter((folder, i, all) => all.indexOf(folder) === i && isNewFolder(folder)).length,
    folders: [...groups.values()],
    desktop: {
      folders: roots.map((folder) => ({ name: folder.name, count: counts.get(folder.name) ?? 0, isNew: isNewFolder(folder) })),
      files: tracked.map((entry) => ({ name: entry.item.name, to: entry.status === "placed" ? rootOf(entry.folderId) : null })),
    },
    plan: kind === "web" && provider.moves ? buildPlan({ moves: provider.moves, desktopName: provider.desktopName }) : null,
  };
}

function openFinish() {
  if (!board || finishDesk.open || pending > 0) return;
  if (interior.active) return;
  if (board.arranging) toggleArrangement();
  toggleSidePanel(false);
  board.setSuspended(true);
  finishDesk.show(buildFinishReport());
  setTimeout(() => { if (finishDesk.open) board?.setPaused(true); }, 1000); // 막이 다 덮은 뒤
}

async function connectHelperForFinish(port, token) {
  if (!port || !token) {
    status.notice("포트와 토큰을 모두 넣어 주세요. Helper 창에 나옵니다.", "warn");
    return null;
  }
  try {
    const helper = new NativeHelperProvider({ port, token });
    const info = await helper.connect();
    status.logConnect(info);
    return helper;
  } catch (error) {
    status.logError("Desktop Helper에 연결하지 못했습니다", error?.message);
    return null;
  }
}

const finishDesk = mountFinishDesk({
  root: elements.finish,
  connectHelper: connectHelperForFinish,
  notice: (text, tone) => status.notice(text, tone),
  onBack: (report) => {
    if (report.variant === "plan") return; // 가져오기 화면에서 연 계획: 그 화면으로 돌아간다
    board?.setPaused(false);
    board?.setSuspended(false); // 「게임으로 돌아가기」 알약이 뜬다
  },
});
elements.finishButton.addEventListener("click", () => openFinish());
if (typeof window !== "undefined") window.__app.finish = { open: openFinish, report: buildFinishReport, show: (report) => finishDesk.show(report) }; // 자동 점검용

// ── 가져오기 화면의 Helper 창: 저장해 둔 정리 계획을 연결된 Helper로 적용 ──
const planOffer = {
  box: $("#helper-plan"), text: $("#helper-plan-text"), apply: $("#helper-plan-apply"), file: $("#helper-plan-file"),
  loaded: null,
};
function refreshPlanOffer(state) {
  const plan = planOffer.loaded ?? loadPendingPlan();
  const connected = state.helper && onboarding?.helperProvider;
  planOffer.box.hidden = !connected;
  planOffer.apply.hidden = !plan;
  if (!connected) return;
  if (plan) {
    const { auto } = splitPlan(plan);
    const when = new Date(plan.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    planOffer.text.textContent = `${planOffer.loaded ? "불러온" : "저장해 둔"} 정리 계획이 있어요 · ${when} · 파일 ${auto.length}개를 폴더 ${planGroups(plan).length}개로.`;
  } else {
    planOffer.text.textContent = "체험 모드에서 저장한 정리 계획이 있으면 불러와 한 번에 적용할 수 있어요.";
  }
}
planOffer.file.addEventListener("change", async () => {
  const file = planOffer.file.files?.[0];
  planOffer.file.value = "";
  if (!file) return;
  try {
    planOffer.loaded = parsePlan(await file.text());
    status.notice(`정리 계획을 불러왔어요 · 옮길 파일 ${planOffer.loaded.moves.length}개`, "success");
  } catch (error) {
    status.notice(error.message, "error");
  }
  onboarding.refresh();
});
planOffer.apply.addEventListener("click", async () => {
  const helper = onboarding.helperProvider;
  const plan = planOffer.loaded ?? loadPendingPlan();
  if (!helper || !plan) return;
  planOffer.apply.disabled = true;
  try {
    await helper.scan();
    const { auto } = splitPlan(plan);
    const target = new Map(auto.map((move) => [move.name.toLocaleLowerCase(), move.to[0]]));
    const when = new Date(plan.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    finishDesk.show({
      variant: "plan",
      modeKind: "web",
      modeText: `Desktop Helper 연결됨 · ${helper.desktopName}`,
      planDate: when,
      done: auto.length,
      total: plan.moves.length,
      remaining: 0,
      elapsedMs: 0,
      newFolders: 0,
      folders: planGroups(plan).map((group) => ({ label: pathLabel(group.to), names: group.names, isNew: false })),
      desktop: {
        folders: helper.folders.filter((folder) => !folder.parentId).map((folder) => ({ name: folder.name, count: 0, isNew: false })),
        files: helper.files.map((file) => ({ name: file.name, to: null, plannedTo: target.get(file.name.toLocaleLowerCase()) ?? null })),
      },
      plan,
    }, { connected: helper });
  } catch (error) {
    status.logError("바탕화면을 읽지 못했습니다", error?.message);
  } finally {
    planOffer.apply.disabled = false;
  }
});
