/**
 * file-homes.js — 다락방에서 파일이 처음 나타나는 자리. (사용자 아이디어 10-10, Claude 구현 10-11)
 *
 *   벽 핀보드  이미지(사진), txt·md(메모지)
 *   책 더미    pdf, doc·docx, hwp·hwpx, rtf (사용자: pdf·docx·hwp, 같은 종류를 함께)
 *   바닥       나머지 전부 (pptx, xlsx 포함, 사용자 결정)
 *
 * 생김새·자리만 정한다. 어느 폴더로 갈지는 정하지 않는다(CLAUDE.md §11). 정원이 차면 바닥으로 간다.
 * 사용자가 집어서 내려놓으면 그때부터 바닥에 있는 파일이다.
 */
const PINBOARD = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif", "avif", "svg", "tif", "tiff", "txt", "md"]);
const BOOKS = new Set(["pdf", "doc", "docx", "hwp", "hwpx", "rtf"]);

/** @returns {"pinboard"|"books"|"floor"} */
export function fileHome(item) {
  const ext = (item?.extension ?? "").toLowerCase();
  if (PINBOARD.has(ext)) return "pinboard";
  if (BOOKS.has(ext)) return "books";
  return "floor";
}

export function isBookExtension(extension) {
  return BOOKS.has((extension ?? "").toLowerCase());
}

/**
 * 자리 안의 칸 번호를 오래 유지한다. 같은 파일은 다시 그릴 때마다 같은 칸에 있고,
 * 빠진 칸은 다음 파일이 채운다. (폴더 상자의 FolderShelfAssignments와 같은 생각)
 */
export class HomeSlots {
  #slots = new Map(); // home → Map(id → index)

  /** @param {Map<string, string[]>} idsByHome  지금 그 자리에 있어야 하는 파일 id, 원하는 순서대로 */
  assign(idsByHome) {
    const result = new Map();
    for (const [home, ids] of idsByHome) {
      const previous = this.#slots.get(home) ?? new Map();
      const next = new Map();
      const wanted = new Set(ids);
      for (const [id, index] of previous) if (wanted.has(id)) next.set(id, index);
      const taken = new Set(next.values());
      let free = 0;
      for (const id of ids) {
        if (next.has(id)) continue;
        while (taken.has(free)) free++;
        next.set(id, free);
        taken.add(free);
      }
      this.#slots.set(home, next);
      for (const [id, index] of next) result.set(id, { home, index });
    }
    for (const home of [...this.#slots.keys()]) if (!idsByHome.has(home)) this.#slots.delete(home);
    return result;
  }
}
