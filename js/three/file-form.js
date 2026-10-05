/** 파일의 생김새. 저장·분류 규칙과 무관하며 3D 물체와 쌓기 계산이 함께 쓴다. */
import { TUNING } from "./tuning.js";

const PHOTO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export function fileForm(extension) {
  const ext = (extension ?? "").toLowerCase();
  if (PHOTO_EXTENSIONS.has(ext)) return "photo";
  if (ext === "txt") return "note";
  return "card";
}

export function formStyle(extension) {
  const kind = fileForm(extension);
  return { kind, ...TUNING.card.forms[kind] };
}

/** 기존 배치 슬롯 안에서 사진·메모의 비례를 맞춘다. 중심과 배치 간격은 유지한다. */
export function fileFootprint(extension, { width, height }) {
  const aspect = formStyle(extension).aspect;
  if (!aspect) return { width, height };
  const fittedWidth = Math.min(width, height * aspect);
  return { width: fittedWidth, height: fittedWidth / aspect };
}
