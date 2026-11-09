/**
 * 상자 안 보기. 읽어 온 파일도 정리는 세션 안에서만 수행한다.
 * 11-07 사용자 「이런 것도 바꿔야겠네」: 정리방 UI와 같은 연필 + 크림 종이(css/folder-interior.css, js/ui/pencil.js),
 * 파일은 바탕화면과 같은 아이콘 그림(layout.js deskIconFor), 말투는 「~해요」.
 */
import { DESK_ICONS, deskIconFor } from "./layout.js";
import { pencilize } from "./pencil.js";

export class FolderInterior {
  #dialog;
  #grid;
  #selected = new Set();
  #folder;
  #busy = false;
  #urls = [];
  #revision = 0;
  #options;

  constructor(options) {
    this.#options = options;
    this.#dialog = document.createElement("dialog");
    this.#dialog.className = "folder-interior";
    this.#dialog.setAttribute("aria-label", "폴더 내부 보기");
    this.#dialog.dataset.pen = "sheet";
    this.#dialog.innerHTML = `<header><div><small>상자 안 · 정리 체험 · 디스크는 그대로</small><h2></h2></div>
      <button type="button" data-close data-pen="paper"><span class="close-label">방으로 돌아가기</span><kbd>Esc</kbd></button></header>
      <nav><button type="button" data-back>← 위 폴더로</button><button type="button" data-target data-pen="paper">이 폴더를 목적지로 펼치기</button><span>클릭으로 고르기 · <kbd>Shift</kbd> + 클릭으로 여러 개</span></nav>
      <div class="interior-tray" aria-label="폴더 내용"></div>
      <footer><span role="status"></span><button type="button" data-clear data-pen="paper">고른 것 풀기</button></footer>`;
    document.body.append(this.#dialog);
    pencilize(this.#dialog);
    this.#grid = this.#get(".interior-tray");
    this.#get("[data-back]").onclick = () => this.open(this.#folder.parentId);
    this.#get("[data-close]").onclick = () => this.close();
    this.#get("[data-target]").onclick = async () => {
      if (this.#busy) return;
      const folderId = this.#folder.id;
      await this.close();
      if (!this.active) this.#options.onTarget(folderId);
    };
    this.#get("[data-clear]").onclick = () => { if (!this.#busy) { this.#selected.clear(); this.#update(); } };
    this.#dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.close(); });
  }

  #get(selector) { return this.#dialog.querySelector(selector); }
  get active() { return this.#dialog.open; }

  async open(folderId) {
    if (this.#busy || !folderId) return;
    this.#busy = true;
    this.#selected.clear();
    this.#options.onActive(true);
    if (!this.active) this.#dialog.showModal();
    this.#grid.replaceChildren();
    this.#get('[role="status"]').textContent = "상자 안을 여는 중…";
    this.#get("[data-close]").disabled = this.#get("[data-back]").disabled = true;
    this.#get("[data-target]").disabled = true;
    const revision = ++this.#revision;
    this.#releaseImages();
    try {
      const { folder, folders, files } = await this.#options.load(folderId);
      this.#folder = folder;
      this.#get("[data-target]").disabled = false;
      this.#get("h2").textContent = folder.path.join(" / ");
      this.#get("[data-back]").disabled = !folder.parentId;
      for (const child of folders) {
        const button = this.#tile(child.name, `${DESK_ICONS}folder-sand.webp`, "interior-folder");
        button.onclick = () => this.open(child.id);
        this.#grid.append(button);
      }
      for (const file of files) {
        const button = this.#tile(file.name, deskIconFor(file.extension), "interior-file");
        button.dataset.fileId = file.id;
        button.setAttribute("aria-pressed", "false");
        button.onclick = (event) => {
          if (this.#busy) return;
          if (!event.shiftKey) this.#selected.clear();
          if (event.shiftKey && this.#selected.has(file.id)) this.#selected.delete(file.id);
          else this.#selected.add(file.id);
          this.#update();
        };
        this.#grid.append(button);
        this.#thumbnail(file, button, revision);
      }
      if (!files.length && !folders.length) {
        const empty = document.createElement("p");
        empty.className = "interior-empty";
        empty.textContent = "이 폴더는 아직 비어 있어요.";
        this.#grid.append(empty);
      }
      this.#update();
    } catch (error) {
      this.#get('[role="status"]').textContent = `열지 못했어요: ${error.message}`;
    } finally {
      this.#busy = false;
      this.#get("[data-close]").disabled = false;
    }
  }

  #tile(name, icon, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    const face = document.createElement("span");
    face.className = "interior-face";
    const image = document.createElement("img");
    image.src = icon;
    image.alt = "";
    face.append(image);
    const label = document.createElement("strong");
    label.textContent = name;
    button.title = name;
    button.append(face, label);
    return button;
  }

  async #thumbnail(file, button, revision) {
    try {
      const blob = await this.#options.thumbnail(file.id);
      if (!blob || revision !== this.#revision || !this.active) return;
      const url = URL.createObjectURL(blob);
      this.#urls.push(url);
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      const face = button.querySelector(".interior-face");
      face.classList.add("is-photo"); // 사진은 아이콘 대신 실제 그림(종이 테두리 사진처럼)
      face.replaceChildren(image);
    } catch { /* 미리보기 없이도 이름으로 선택 가능 */ }
  }

  #update() {
    for (const button of this.#grid.querySelectorAll("[data-file-id]")) {
      button.setAttribute("aria-pressed", String(this.#selected.has(button.dataset.fileId)));
    }
    const count = this.#selected.size;
    this.#get('[role="status"]').textContent = count ? `${count}개 골랐어요 · 방으로 돌아가면 손에 들려요.` : "꺼낼 파일을 고르거나, 안의 폴더를 눌러 들어가 봐요.";
    this.#get(".close-label").textContent = count ? `${count}개 들고 돌아가기` : "방으로 돌아가기";
    this.#get("[data-close]").dataset.holding = String(count > 0);
    this.#get("[data-clear]").hidden = !count;
  }

  async close() {
    if (this.#busy) return;
    this.#busy = true;
    this.#get("[data-close]").disabled = true;
    try {
      if (this.#selected.size) await this.#options.takeOut([...this.#selected], this.#folder.id);
      this.#dialog.close();
      this.#revision++;
      this.#releaseImages();
      this.#options.onActive(false);
    } catch (error) {
      this.#get('[role="status"]').textContent = `꺼내지 못했어요: ${error.message}`;
    } finally {
      this.#busy = false;
      this.#get("[data-close]").disabled = false;
    }
  }

  #releaseImages() {
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls = [];
  }
}
