/**
 * file-system-service.js — 끌어다 놓은 파일을 읽는 부분(File System Access API, 읽기 전용).
 * WebDropProvider(js/providers/web-drop-provider.js)만 쓴다.
 *
 * 웹에서 파일을 직접 옮기지 않는다: 파일마다 권한 창이 떠서(18개 → 18번) 쓸 수 없다.
 * 실제 이동은 Desktop Helper가 한다(CLAUDE.md §8-7).
 */

export async function resolveDroppedHandles(items) {
  const candidates = Array.from(items ?? []).filter(
    (item) => item.kind === "file" && typeof item.getAsFileSystemHandle === "function",
  );
  const results = await Promise.allSettled(
    candidates.map((item) => item.getAsFileSystemHandle()),
  );

  return {
    handles: results
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value),
    failedCount: results.filter(
      (result) => result.status === "rejected" || !result.value,
    ).length,
  };
}

export async function describeFileHandle(handle) {
  const file = await handle.getFile();
  return {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    file,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}
