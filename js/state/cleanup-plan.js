/**
 * cleanup-plan.js — 정리 계획 (2026-10-18, 사용자: "다 정리 안 해도 이 정도면 됐다 할 때 끝내고, 그 상태로 바탕화면에 적용").
 *
 * 체험 모드(드롭)는 읽기 전용이라 방에서 한 정리는 가상이다. 끝낼 때 그 결과를 "계획"으로 남기고,
 * Desktop Helper가 연결되면 그 계획대로 실제로 옮긴다. 옮기는 건 늘 Helper의 이동 규칙 그대로다(§5-1):
 * 덮어쓰기 없음, 같은 볼륨만, 항목별 결과, 되돌리기는 rename 역방향.
 *
 * 계획에는 경로가 없다. 이름과 크기, 폴더 이름의 줄(["과제", "3D"])만 있다. 웹은 절대경로를 모른다(§5-2).
 * Helper는 바탕화면 바로 위의 파일만 볼 수 있어서(폴더 안 파일 목록이 없다), 폴더 안에서 꺼냈거나 폴더끼리 옮긴 파일은
 * 적용하지 않고 "직접 옮길 것"으로 돌려준다.
 */

export const PLAN_KIND = "cozium-cleanup-plan";
export const PLAN_VERSION = 1;
export const PLAN_STORAGE_KEY = "cozium.cleanup-plan";

const lower = (name) => String(name).toLocaleLowerCase("en-US"); // Windows 이름은 대소문자를 가리지 않는다
const pathKey = (path) => path.map(lower).join("\u0000");
export const pathLabel = (path) => (path.length ? path.join(" › ") : "바탕화면"); // 방 상자 이름표와 같은 표기

/** provider.moves(가상 이동)로 계획을 만든다. 옮긴 게 없으면 moves가 빈 계획. */
export function buildPlan({ moves, desktopName = "바탕화면", now = new Date() }) {
  return {
    kind: PLAN_KIND,
    version: PLAN_VERSION,
    createdAt: now.toISOString(),
    desktopName,
    moves: moves.map(({ name, size = 0, lastModified = 0, from = [], to = [] }) => ({ name, size, lastModified, from: [...from], to: [...to] })),
  };
}

/** 저장한 계획(JSON 글자 또는 객체)을 읽는다. 모양이 틀리면 한국어 메시지로 던진다. */
export function parsePlan(input) {
  let plan = input;
  if (typeof input === "string") {
    try {
      plan = JSON.parse(input);
    } catch {
      throw new Error("정리 계획 파일을 읽지 못했어요. Cozium에서 저장한 .json 파일인지 확인해 주세요.");
    }
  }
  if (!plan || plan.kind !== PLAN_KIND) throw new Error("Cozium 정리 계획 파일이 아니에요.");
  if (plan.version !== PLAN_VERSION) throw new Error(`이 정리 계획은 다른 버전(${plan.version})이에요.`);
  if (!Array.isArray(plan.moves)) throw new Error("정리 계획에 옮길 목록이 없어요.");
  const isPath = (path) => Array.isArray(path) && path.every((segment) => typeof segment === "string" && segment.length > 0 && segment.length < 256);
  const moves = plan.moves.filter((move) => move && typeof move.name === "string" && move.name && isPath(move.from) && isPath(move.to));
  if (moves.length !== plan.moves.length) throw new Error("정리 계획 일부가 깨져 있어요.");
  return { ...plan, moves };
}

/** 폴더별로 묶은 요약: [{ to, label, names }] */
export function planGroups(plan) {
  const groups = new Map();
  for (const move of plan.moves) {
    const key = pathKey(move.to);
    if (!groups.has(key)) groups.set(key, { to: move.to, label: pathLabel(move.to), names: [] });
    groups.get(key).names.push(move.name);
  }
  return [...groups.values()];
}

/** Helper가 옮길 수 있는 것: 바탕화면 바로 위 → 폴더. 나머지는 사용자가 직접. */
export function splitPlan(plan) {
  const auto = [], manual = [];
  for (const move of plan.moves) (move.from.length === 0 && move.to.length > 0 ? auto : manual).push(move);
  return { auto, manual };
}

/**
 * 계획을 Helper로 실제 적용한다.
 * helper: NativeHelperProvider와 같은 모양 — scan(), files, folders, listSubfolders(id), createFolder(parentId, name), moveBatch(ids, folderId)
 * @returns {Promise<{ moved: Array<{name, to}>, failed: Array<{name, to, reason}>, manual: Array<{name, from, to}>, created: string[][], batchIds: string[] }>}
 */
export async function applyPlan(plan, helper, { onProgress = () => {} } = {}) {
  const { auto, manual } = splitPlan(plan);
  const report = { moved: [], failed: [], manual: manual.map(({ name, from, to }) => ({ name, from, to })), created: [], batchIds: [] };
  if (!auto.length) return report;

  onProgress({ step: "scan" });
  await helper.scan();
  const byName = new Map(), byLower = new Map();
  for (const file of helper.files) {
    byName.set(file.name, file);
    if (!byLower.has(lower(file.name))) byLower.set(lower(file.name), file);
  }

  // 폴더 경로 → Helper 폴더 id. 없으면 한 단계씩 만든다(새 폴더는 계획 때 사용자가 방에서 만든 것).
  const resolved = new Map();
  const listed = new Set();
  const childNamed = (parentId, name) => helper.folders.find((folder) => (folder.parentId ?? null) === parentId && lower(folder.name) === lower(name));
  async function folderFor(path) {
    let parentId = null;
    for (let i = 0; i < path.length; i++) {
      const key = pathKey(path.slice(0, i + 1));
      if (resolved.has(key)) { parentId = resolved.get(key); continue; }
      let folder = childNamed(parentId, path[i]);
      if (!folder && parentId !== null && !listed.has(parentId)) {
        listed.add(parentId);
        await helper.listSubfolders(parentId);
        folder = childNamed(parentId, path[i]);
      }
      if (!folder) {
        folder = await helper.createFolder(parentId, path[i]);
        report.created.push(path.slice(0, i + 1));
      }
      resolved.set(key, folder.id);
      parentId = folder.id;
    }
    return parentId;
  }

  const groups = new Map(); // folderId → { to, ids, names }
  const taken = new Set();
  for (const move of auto) {
    const file = byName.get(move.name) ?? byLower.get(lower(move.name));
    const fail = (reason) => report.failed.push({ name: move.name, to: move.to, reason });
    if (!file || taken.has(file.id)) { fail("바탕화면에 없어요 (이미 옮겼거나 이름이 바뀜)"); continue; }
    if (move.size > 0 && file.size !== move.size) { fail("크기가 달라져서 다른 파일로 보고 건너뜀"); continue; }
    let folderId;
    try {
      folderId = await folderFor(move.to);
    } catch (error) {
      fail(`'${pathLabel(move.to)}' 폴더를 준비하지 못함: ${error?.message ?? error}`);
      continue;
    }
    taken.add(file.id);
    if (!groups.has(folderId)) groups.set(folderId, { to: move.to, ids: [], names: new Map() });
    groups.get(folderId).ids.push(file.id);
    groups.get(folderId).names.set(file.id, move.name);
  }

  let done = 0;
  for (const [folderId, group] of groups) {
    onProgress({ step: "move", done, total: taken.size, folder: pathLabel(group.to) });
    let result;
    try {
      result = await helper.moveBatch(group.ids, folderId);
    } catch (error) {
      for (const id of group.ids) report.failed.push({ name: group.names.get(id), to: group.to, reason: error?.message ?? "옮기지 못함" });
      continue;
    }
    if (result.batchId && result.moved.length) report.batchIds.push(result.batchId);
    for (const move of result.moved) report.moved.push({ name: group.names.get(move.fileId) ?? move.fileName, to: group.to });
    for (const failure of result.failed) report.failed.push({ name: group.names.get(failure.fileId) ?? failure.fileName, to: group.to, reason: failure.message });
    done += group.ids.length;
  }
  onProgress({ step: "done", done, total: taken.size });
  return report;
}

/** 방금 적용한 것을 되돌린다(rename 역방향). 새로 만든 폴더는 지우지 않는다 — 삭제 기능은 없다(§9). */
export async function undoApplied(report, helper) {
  const restored = [], failed = [];
  for (const batchId of [...report.batchIds].reverse()) {
    try {
      const result = await helper.undoBatch(batchId);
      restored.push(...result.restored);
      failed.push(...result.failed);
    } catch (error) {
      failed.push({ fileName: "", message: error?.message ?? "되돌리지 못함" });
    }
  }
  return { restored, failed };
}

// ── 브라우저 보관(같은 컴퓨터·같은 브라우저에서만). 실패해도 조용히 넘어간다. ──
export function savePendingPlan(plan, storage = globalThis.localStorage) {
  try { storage?.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan)); return true; } catch { return false; }
}
export function loadPendingPlan(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(PLAN_STORAGE_KEY);
    return text ? parsePlan(text) : null;
  } catch {
    return null;
  }
}
export function clearPendingPlan(storage = globalThis.localStorage) {
  try { storage?.removeItem(PLAN_STORAGE_KEY); } catch { /* 없다 */ }
}

/** 내려받기 파일 이름: cozium-정리계획-20261018-1152.json */
export function planFileName(plan) {
  const d = new Date(plan.createdAt);
  const pad = (n) => String(n).padStart(2, "0");
  return `cozium-정리계획-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}
