/**
 * Onboarding — 두 갈래. (§11, §12 UX 원칙)
 *
 *  웹에서 바로 체험하기   Ctrl+A 드롭. 읽기 전용. 설치 0, 확인창 0.
 *  내 Desktop과 연결하기 Desktop Helper. 자동 스캔, 실제 이동, 실제 되돌리기.
 *
 * Helper 설치는 진입 조건이 아니다. 기본은 웹이다.
 */
import { MAX_BOXES } from "../state/session-store.js";

export class Onboarding {
  #root;
  #status;
  #onStart;
  #createWebProvider;
  #createHelperProvider;
  #memoryProvider;
  #els;
  #webProvider = null;
  #helperProvider = null;
  #busy = false;
  #onRefresh;
  #beforeStart;
  #afterStart;

  /**
   * onRefresh(state): 화면(바탕화면 아이콘·트레이)이 따라 그릴 상태. beforeStart(provider): 방으로 떠나는 연출(Promise).
   * afterStart(): 시작이 끝난 뒤(실패해서 아직 이 화면이면 연출을 되돌린다). 셋 다 없어도 된다(테스트).
   */
  constructor({ root, status, onStart, createWebProvider, createHelperProvider, memoryProvider = null, capacity = 16, onRefresh = null, beforeStart = null, afterStart = null }) {
    this.#root = root;
    this.#status = status;
    this.#onStart = onStart;
    this.#onRefresh = onRefresh;
    this.#beforeStart = beforeStart;
    this.#afterStart = afterStart;
    this.#createWebProvider = createWebProvider;
    this.#createHelperProvider = createHelperProvider;
    this.#memoryProvider = memoryProvider;
    const $ = (selector) => root.querySelector(selector);
    this.#els = {
      webCard: $("#mode-web"),
      helperCard: $("#mode-helper"),
      webDrop: $('[data-drop="desktop"]'),
      webSummary: $("#web-summary"),
      startWeb: $("#start-web"),
      helperForm: $("#helper-form"),
      helperPort: $("#helper-port"),
      helperToken: $("#helper-token"),
      helperState: $("#helper-state"),
      startHelper: $("#start-helper"),
      memoryTools: $("#memory-tools"),
      loadSample: $("#load-sample"),
      supportState: $("#support-state"),
      capacityLabel: $("#capacity-label"),
    };
    this.#els.capacityLabel.textContent = capacity;
    this.#els.memoryTools.hidden = !memoryProvider;
    this.#bind();
    this.refresh();
  }

  #bind() {
    const { webDrop, startWeb, helperForm, startHelper, loadSample } = this.#els;

    webDrop.addEventListener("dragenter", (event) => {
      event.preventDefault();
      webDrop.classList.add("is-dragging");
    });
    webDrop.addEventListener("dragover", (event) => event.preventDefault());
    webDrop.addEventListener("dragleave", (event) => {
      if (!webDrop.contains(event.relatedTarget)) webDrop.classList.remove("is-dragging");
    });
    webDrop.addEventListener("drop", (event) => {
      event.preventDefault();
      webDrop.classList.remove("is-dragging");
      const items = event.dataTransfer?.items;
      if (!items || items.length === 0) {
        this.#status.notice("파일 시스템 핸들을 받을 수 있는 항목이 없습니다.", "error");
        return;
      }
      this.#guard(async () => {
        this.#webProvider ??= this.#createWebProvider();
        const result = await this.#webProvider.importDropped(items);
        this.#status.logImport(result, { source: "드롭" });
      }, "드롭한 항목을 읽지 못했습니다");
    });

    startWeb.addEventListener("click", () => {
      if (this.#webProvider) this.#start(this.#webProvider);
    });

    helperForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.connectHelper(this.#els.helperPort.value.trim(), this.#els.helperToken.value.trim());
    });

    startHelper.addEventListener("click", () => {
      if (this.#helperProvider) this.#start(this.#helperProvider);
    });

    loadSample.addEventListener("click", () => this.startSample());
  }

  /** 연결된 Helper(없으면 null). 저장한 정리 계획을 적용할 때 쓴다(10-18). */
  get helperProvider() {
    return this.#helperProvider;
  }

  /** 랜딩 CTA와 기존 체험 버튼이 같은 시작 경로를 쓴다. */
  async startSample() {
    if (!this.#memoryProvider) return false;
    return this.#guard(() => this.#start(this.#memoryProvider), "가상 파일을 열지 못했습니다");
  }

  /** 떠나는 연출 → 시작 → (아직 이 화면이면) 연출 되돌리기. */
  async #start(provider) {
    if (this.#beforeStart) await this.#beforeStart(provider);
    try {
      return await this.#onStart(provider);
    } finally {
      this.#afterStart?.();
    }
  }

  /** 파일은 사용자가 직접 드롭할 때만 읽는다. */
  focusWebImport() {
    this.#els.webDrop.focus({ preventScroll: true });
    this.#els.webDrop.scrollIntoView({ block: "center" });
  }

  /** URL의 ?helper=PORT&token=… 로도, 폼으로도 온다. */
  async connectHelper(port, token) {
    if (!port || !token) {
      this.#status.notice("포트와 토큰을 모두 입력하세요. Helper 창에 나옵니다.", "warn");
      return false;
    }
    this.#els.helperPort.value = port;
    this.#els.helperToken.value = token;
    let connected = false;
    await this.#guard(async () => {
      const provider = this.#createHelperProvider({ port, token });
      const info = await provider.connect();
      this.#helperProvider = provider;
      this.#status.logConnect(info);
      this.#els.helperState.textContent = `연결됨 · Desktop Helper v${info.version} · '${info.desktopName}'`;
      this.#els.helperState.dataset.tone = "success";
      connected = true;
    }, "Desktop Helper에 연결하지 못했습니다");
    if (!connected) {
      this.#helperProvider = null;
      this.#els.helperState.textContent = "연결 안 됨. Helper가 실행 중인지, 포트와 토큰이 맞는지 확인하세요.";
      this.#els.helperState.dataset.tone = "error";
    }
    this.refresh();
    return connected;
  }

  async #guard(task, failureTitle) {
    if (this.#busy) return false;
    this.#busy = true;
    this.refresh();
    try {
      await task();
      return true;
    } catch (error) {
      this.#status.logError(failureTitle, error?.message);
      return false;
    } finally {
      this.#busy = false;
      this.refresh();
    }
  }

  refresh() {
    this.#els.loadSample.disabled = this.#busy;
    const { webSummary, startWeb, startHelper, webCard, helperCard, helperForm } = this.#els;
    const web = this.#webProvider;
    const files = web?.files ?? [];
    const folders = web?.folders.filter((folder) => folder.parentId === null) ?? [];

    if (!web || (files.length === 0 && folders.length === 0)) {
      webSummary.textContent = "";
    } else {
      // 이름은 바탕화면 아이콘으로 보인다(import-desk.js). 여기는 개수와 20개 규칙만.
      webSummary.textContent =
        `파일 ${files.length}개 · 폴더 ${folders.length}개를 가져왔어요.` +
        (folders.length > MAX_BOXES ? ` 상자는 한 번에 ${MAX_BOXES}개까지라 폴더 ${folders.length - MAX_BOXES}개는 이번엔 빠져요.` : "") +
        (files.length === 0 ? " 옮길 파일이 없어요 — 파일도 같이 골라 놓아 주세요." : "");
    }
    startWeb.disabled = this.#busy || files.length === 0;
    startWeb.textContent = folders.length === 0 && files.length > 0 ? "방으로 가기 → (폴더 없음 · 방에서 새 상자를 만들어요)" : "방으로 가기 →";
    webCard.dataset.ready = files.length > 0;

    startHelper.disabled = this.#busy || !this.#helperProvider;
    helperCard.dataset.ready = Boolean(this.#helperProvider);
    for (const control of helperForm.querySelectorAll("input, button")) control.disabled = this.#busy;
    this.#onRefresh?.({ files, folders, helper: Boolean(this.#helperProvider), busy: this.#busy, maxBoxes: MAX_BOXES });
  }

  showUnsupported(message) {
    const { supportState, webDrop, startWeb } = this.#els;
    supportState.textContent = message;
    supportState.hidden = false;
    webDrop.classList.add("is-disabled");
    startWeb.disabled = true;
  }
}
