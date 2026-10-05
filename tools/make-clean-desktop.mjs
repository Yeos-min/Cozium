import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] || path.join(here, "../assets/landing/parts/desktop-v2"));
await fs.mkdir(path.join(output, "icons"), { recursive: true });

const vector = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">\n${content}\n</svg>\n`;
const softShadow = (id, dy = 2.2, opacity = 0.12) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="1.1" dy="${dy}" stdDeviation="1.5" flood-color="#584B32" flood-opacity="${opacity}"/></filter>`;

const paperGrain = (id) => `<pattern id="${id}" width="31" height="29" patternUnits="userSpaceOnUse"><g fill="#705734" opacity=".2"><circle cx="3.2" cy="5.6" r=".25"/><circle cx="15.7" cy="11.2" r=".32"/><circle cx="28.1" cy="3.7" r=".23"/><circle cx="7.8" cy="23.6" r=".28"/><circle cx="24.5" cy="26.3" r=".3"/></g><g stroke="#735D3D" stroke-width=".23" stroke-opacity=".15" stroke-linecap="round"><path d="M8.4 3.1l1.6 .5M20 18.2l2.1 -.3M1.2 17.5l1.5 .1M15.4 27.5l1.1 -.8"/></g></pattern>`;

function folder(name, colors) {
  const [top, light, base, edge] = colors;
  return `<defs>
${softShadow(`${name}-shadow`)}
${paperGrain(`${name}-grain`)}
<linearGradient id="${name}-back" x1="11" y1="17" x2="56" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="${top}"/><stop offset="1" stop-color="${base}"/></linearGradient>
<linearGradient id="${name}-front" x1="34" y1="26" x2="34" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="${light}"/><stop offset="1" stop-color="${base}"/></linearGradient>
</defs>
<g filter="url(#${name}-shadow)">
<path d="M10.5 20.5C10.6 17.7 12.5 15.4 15.5 15.5L26.4 15.3C28.18 15.3 29.73 16.1 30.9 17.49L34.5 21.75L52.5 21.6C55.26 21.7 57.7 23.99 57.5 26.75L57.3 51.5C57.3 54.26 55.26 56.7 52.5 56.5L15.5 56.3C12.74 56.3 10.3 54.26 10.5 51.5V20.5Z" fill="url(#${name}-back)" stroke="${edge}" stroke-opacity=".76" stroke-width=".9"/>
<path d="M15 23.5H52.5" stroke="${light}" stroke-opacity=".6" stroke-width=".8"/>
<rect x="14.5" y="25" width="38.5" height="25.5" rx="2" fill="#F5EDD8" fill-opacity=".87"/>
<path d="M10.5 31C10.5 28.8 12.3 27.1 14.5 27L53.5 27.2C55.71 27.2 57.5 28.79 57.5 31L57.3 51.5C57.4 54.3 55.26 56.6 52.5 56.5L15.5 56.3C12.74 56.3 10.3 54.26 10.5 51.5V31Z" fill="url(#${name}-front)" stroke="${edge}" stroke-opacity=".8" stroke-width=".9"/>
<path d="M10.5 31C10.5 28.8 12.3 27.1 14.5 27L53.5 27.2C55.71 27.2 57.5 28.79 57.5 31L57.3 51.5C57.4 54.3 55.26 56.6 52.5 56.5L15.5 56.3C12.74 56.3 10.3 54.26 10.5 51.5V31Z" fill="url(#${name}-grain)" opacity=".35"/>
<path d="M14.5 28H53.5" stroke="#FFFDF5" stroke-opacity=".58" stroke-linecap="round"/>
<path d="M16.5 54.5H51.5" stroke="${edge}" stroke-opacity=".11" stroke-linecap="round"/>
</g>`;
}

function paper(name, inside) {
  return `<defs>
${softShadow(`${name}-shadow`, 2.1, 0.1)}
${paperGrain(`${name}-grain`)}
<linearGradient id="${name}-paper" x1="20" y1="11" x2="51" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFDF3"/><stop offset="1" stop-color="#F1E7CE"/></linearGradient>
<linearGradient id="${name}-fold" x1="40" y1="12" x2="51" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#EEE5CE"/><stop offset="1" stop-color="#DCCBAA"/></linearGradient>
</defs>
<g filter="url(#${name}-shadow)">
<path d="M20 11.5L39.5 11.3L52 24L51.8 53C51.8 55.76 49.76 58.2 47 58L20 57.8C17.24 57.8 15.2 55.76 15 53V16.5C15 13.74 17.24 11.5 20 11.5Z" fill="url(#${name}-paper)" stroke="#766D59" stroke-opacity=".8" stroke-width=".85"/>
<path d="M39.5 11.5V20C39.5 22.21 41.29 24 43.5 24H52" fill="url(#${name}-fold)" stroke="#877A60" stroke-opacity=".64" stroke-width=".75"/>
<path d="M20 11.5L39.5 11.3L52 24L51.8 53C51.8 55.76 49.76 58.2 47 58L20 57.8C17.24 57.8 15.2 55.76 15 53V16.5C15 13.74 17.24 11.5 20 11.5Z" fill="url(#${name}-grain)" opacity=".35"/>
<path d="M19.5 13H38" stroke="#FFFFFF" stroke-opacity=".95" stroke-linecap="round"/>
${inside}
</g>`;
}

const assets = new Map();
const add = (id, file, width, height, content) => assets.set(id, { id, file, width, height, content });

add("background", "wallpaper.svg", 1672, 941, `<defs><linearGradient id="background-tone" x1="80" y1="0" x2="1560" y2="1050" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF8E6"/><stop offset=".52" stop-color="#F5EBD5"/><stop offset="1" stop-color="#ECDDCA"/></linearGradient>${paperGrain("background-grain")}</defs><rect width="1672" height="941" fill="url(#background-tone)"/><rect width="1672" height="941" fill="url(#background-grain)" opacity=".22"/>`);

add("folder-sage", "icons/folder-sage.svg", 68, 68, folder("folder-sage", ["#657D68", "#91A083", "#6D856E", "#3F5141"]));
add("folder-sand", "icons/folder-sand.svg", 68, 68, folder("folder-sand", ["#B29263", "#DFBA81", "#C49D65", "#776047"]));
add("document", "icons/document.svg", 68, 68, paper("document", `<path d="M24 32l19.8 -.2M24 38l16.8 .1M24 44l20 -.1M24 50l11 .1" stroke="#727F65" stroke-width="1.8" stroke-linecap="round"/>`));
add("photo", "icons/photo.svg", 68, 68, `<defs>
${softShadow("photo-shadow", 2.2, .11)}
<linearGradient id="photo-paper" x1="13" y1="15" x2="55" y2="55" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFDF3"/><stop offset="1" stop-color="#EFE4CB"/></linearGradient>
<linearGradient id="photo-sky" x1="34" y1="21" x2="34" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="#ACC9C4"/><stop offset="1" stop-color="#DBE0C9"/></linearGradient>
</defs>
<g filter="url(#photo-shadow)"><rect x="10.5" y="15.5" width="47" height="39" rx="5" fill="url(#photo-paper)" stroke="#766D58" stroke-opacity=".76" stroke-width=".8"/><rect x="15" y="20" width="38" height="26.5" rx="2" fill="url(#photo-sky)"/><circle cx="44" cy="26.5" r="3.5" fill="#E9B96F"/><path d="M15 41L26.5 30.5L40 46.5H17C15.9 46.5 15 45.6 15 44.5V41Z" fill="#7C9473"/><path d="M27.5 46.5L41.5 35.5L53 43V44.5C53 45.6 52.1 46.5 51 46.5H27.5Z" fill="#496E5A"/><path d="M15.5 17H52" stroke="#FFFFFF" stroke-opacity=".82" stroke-linecap="round"/></g>`);
add("video", "icons/video.svg", 68, 68, paper("video", `<rect x="22" y="30" width="24" height="19" rx="4" fill="#78937A"/><path d="M31 35.5C31 34.72 31.85 34.23 32.53 34.62L39.5 38.62C40.17 39.01 40.17 39.99 39.5 40.38L32.53 44.38C31.85 44.77 31 44.28 31 43.5V35.5Z" fill="#F7EDD6"/>`));
add("audio", "icons/audio.svg", 68, 68, paper("audio", `<path d="M33 44V32L43 29V41" stroke="#51735A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="29.7" cy="45" rx="4.4" ry="3.3" fill="#51735A"/><ellipse cx="39.7" cy="42" rx="4.4" ry="3.3" fill="#51735A"/>`));
add("archive", "icons/archive.svg", 68, 68, paper("archive", `<rect x="29" y="12" width="5.5" height="27" rx="1" fill="#CFB17F"/><path d="M30 15H32.2M31.8 19H34M30 23H32.2M31.8 27H34M30 31H32.2" stroke="#735C41" stroke-width="1.4"/><rect x="27.5" y="38" width="8.5" height="10" rx="2.2" fill="#AE8751" stroke="#725B42" stroke-opacity=".55" stroke-width=".75"/><rect x="30" y="41" width="3.5" height="4" rx="1" fill="#FBF0D7"/>`));

add("taskbar", "taskbar.svg", 1634, 56, `<defs>
<linearGradient id="taskbar-glass" x1="817" y1="0" x2="817" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF8E5" stop-opacity=".74"/><stop offset="1" stop-color="#F7EDD6" stop-opacity=".95"/></linearGradient>
<linearGradient id="taskbar-app" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse"><stop stop-color="#FBF1DD"/><stop offset="1" stop-color="#E8DCC2"/></linearGradient>
</defs>
<rect x=".5" y=".5" width="1633" height="55" rx="14.5" fill="url(#taskbar-glass)" stroke="#FFFFFF" stroke-opacity=".83"/>
<path d="M17 55H1617" stroke="#BAAC8D" stroke-opacity=".3"/>
<g transform="translate(714 11)">
<rect width="34" height="34" rx="9" fill="url(#taskbar-app)" stroke="#BDB093" stroke-opacity=".7"/><path d="M17 25V15" stroke="#779270" stroke-width="1.8" stroke-linecap="round"/><path d="M16.8 19C10.7 19.2 8.8 15.7 8.7 11.6C13.8 11.3 17.1 13.8 16.8 19Z" fill="#A7B995"/><path d="M17.4 17.2C17.1 11.6 20.3 8.8 25.1 8.8C25.3 13.6 22.9 17 17.4 17.2Z" fill="#7F9E77"/>
</g>
<g transform="translate(758 11)"><rect width="34" height="34" rx="9" fill="url(#taskbar-app)" stroke="#BDB093" stroke-opacity=".7"/><path d="M8 12.5C8 11.4 8.9 10.5 10 10.5H15L17.5 13H24C25.1 13 26 13.9 26 15V23C26 24.1 25.1 25 24 25H10C8.9 25 8 24.1 8 23V12.5Z" fill="#8E9D7B" stroke="#536B50" stroke-width=".8"/><path d="M9.2 15H24.8" stroke="#EAF0DE" stroke-width=".8"/></g>
<g transform="translate(802 11)"><rect width="34" height="34" rx="9" fill="url(#taskbar-app)" stroke="#BDB093" stroke-opacity=".7"/><rect x="8" y="9" width="18" height="16" rx="2.5" fill="#ADCCC4" stroke="#697E68" stroke-width=".8"/><circle cx="21.5" cy="13.5" r="2" fill="#E1B56E"/><path d="M8.5 21L14 15.5L22 24.5H10.5C9.4 24.5 8.5 23.6 8.5 22.5V21Z" fill="#73936F"/><path d="M17.5 24.5L23 19.5L25.5 22V22.5C25.5 23.6 24.6 24.5 23.5 24.5H17.5Z" fill="#4D725A"/></g>
<g transform="translate(846 11)"><rect width="34" height="34" rx="9" fill="url(#taskbar-app)" stroke="#BDB093" stroke-opacity=".7"/><rect x="10" y="8" width="14" height="19" rx="2.5" fill="#FFF5DF" stroke="#897B62" stroke-width=".9"/><path d="M13.5 14H20.5M13.5 18H20.5M13.5 22H18.5" stroke="#7D8B68" stroke-width="1.3" stroke-linecap="round"/></g>
<g transform="translate(890 11)"><rect width="34" height="34" rx="9" fill="url(#taskbar-app)" stroke="#BDB093" stroke-opacity=".7"/><rect x="8.5" y="9.5" width="17" height="15" rx="3" fill="#B0BE98" stroke="#6C805A" stroke-width=".8"/><path d="M13.2 24.5V27M20.8 24.5V27M12 27H22" stroke="#6C805A" stroke-width=".9" stroke-linecap="round"/><circle cx="17" cy="17" r="3.5" stroke="#566F4F" stroke-width="1.4"/><path d="M17 13.5V20.5M13.5 17H20.5" stroke="#566F4F" stroke-width=".9"/></g>
<g stroke="#746D58" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"><path d="M1533 24C1537 20 1543 20 1547 24M1536 27C1538.5 24.5 1541.5 24.5 1544 27M1539 30C1539.7 29.3 1540.3 29.3 1541 30"/><path d="M1560 24H1563L1567 20.5V35.5L1563 32H1560V24Z"/><path d="M1570 24.5C1572 26.5 1572 29.5 1570 31.5"/><rect x="1586" y="23" width="19" height="10" rx="2"/><path d="M1605 26H1607V30H1605"/></g><rect x="1589" y="26" width="11" height="4" rx=".8" fill="#85926F"/>`);

add("frame", "monitor-frame.svg", 1672, 941, `<defs><linearGradient id="frame-metal" x1="836" y1="0" x2="836" y2="941" gradientUnits="userSpaceOnUse"><stop stop-color="#44574B"/><stop offset=".3" stop-color="#31443B"/><stop offset="1" stop-color="#263B31"/></linearGradient></defs><rect x="7" y="7" width="1658" height="927" rx="18" stroke="url(#frame-metal)" stroke-width="14"/><rect x="14.5" y="14.5" width="1643" height="912" rx="10.5" stroke="#708371" stroke-opacity=".48"/><path d="M23 3.5H1649" stroke="#778577" stroke-opacity=".3" stroke-linecap="round"/><circle cx="836" cy="934" r="1.5" fill="#A2B098" fill-opacity=".8"/>`);
function collectionBox(frontOnly = false) {
  const ink = "#61513E";
  const light = "#D8B58B";
  const kraft = "#C49C70";
  const shade = "#A07C54";
  const front = `<g stroke="${ink}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">
<path d="M39.2 91.3L180.2 93.1L180.5 153.4L41 151.2Z" fill="${kraft}"/>
<path d="M180.2 93.1L204.1 59.2L205.8 121.4L180.5 153.4Z" fill="${shade}"/>
<path d="M39.2 91.3L180.2 93.1L171.2 116L30.4 112.2Z" fill="${light}"/>
</g>
<text x="106.2" y="139.5" fill="#365446" font-family="Georgia,serif" font-size="13.4" font-weight="700" font-style="italic" text-anchor="middle" transform="rotate(.6 106.2 138)">Cozium</text>`;
  return `${frontOnly ? "" : `<path d="M41 151.2L180.5 153.4L205.8 121.4L210 125.6L184.1 158L44.6 156Z" fill="#61513E" opacity=".1"/>
<g stroke="${ink}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">
<path d="M63 58L63.3 26.3L191.8 28.1L204.1 59.2Z" fill="${light}"/>
<path d="M63 58L204.1 59.2L180.2 93.1L39.2 91.3Z" fill="${kraft}"/>
<path d="M63 58L204.1 59.2L188.8 72.7L66.2 71.5Z" fill="${shade}" stroke="none"/>
<path d="M63 58L39.2 91.3L55.6 86L66.2 71.5Z" fill="${kraft}" stroke="none"/>
<path d="M204.1 59.2L180.2 93.1L171.6 87.5L188.8 72.7Z" fill="${shade}" stroke="none"/>
<path d="M66.2 71.5L188.8 72.7L171.6 87.5L55.6 86Z" fill="${kraft}" stroke-width=".65"/>
<path d="M63 58L39.2 91.3L9.4 77.9L30.2 46.1Z" fill="${light}"/>
<path d="M204.1 59.2L180.2 93.1L220.1 101.3L235.1 67.3Z" fill="${light}"/>
</g>`}
${front}`;
}

add("cozium-box", "cozium-box.svg", 240, 180, collectionBox());
add("cozium-box-front", "cozium-box-front.svg", 240, 180, collectionBox(true));

const kinds = [
  ["folder-sage", "photo", "document", "folder-sand", "video", "document", "archive", "photo", "folder-sage", "audio"],
  ["document", "folder-sage", "photo", "archive", "document", "folder-sand", "audio", "document", "video", "photo"],
  ["photo", "document", "folder-sand", "video", "archive", "photo", "folder-sage", "document", "audio", "document"],
  ["folder-sand", "audio", "document", "photo", "folder-sage", "archive", "document", "video", "photo", "folder-sage"],
  ["document", "photo", "video", "folder-sage", "document", "audio", "folder-sand", "photo", "archive", "document"],
  ["archive", "folder-sand", "photo", "document", "audio", "folder-sage", "video", "document", "photo", "folder-sand"],
  ["audio", "document", "folder-sage", "photo", "archive", "document", "photo", "folder-sand", "document", "video"],
  ["folder-sage", "video", "document", "audio", "photo", "folder-sand", "archive", "document", "folder-sage", "photo"],
];

const layers = [
  { id: "background", file: "wallpaper.svg", z: 0, offset: [0, 0], transparent: false, size: [1672, 941] },
  { id: "taskbar", file: "taskbar.svg", z: 2, offset: [19, 850], transparent: true, size: [1634, 56] },
  { id: "frame", file: "monitor-frame.svg", z: 3, offset: [0, 0], transparent: true, size: [1672, 941] },
];
const items = kinds.flatMap((row, rowIndex) => row.map((icon, columnIndex) => {
  const x = 54 + columnIndex * 94;
  const y = 45 + rowIndex * 100;
  return {
    id: `file-r${String(rowIndex + 1).padStart(2, "0")}-c${String(columnIndex + 1).padStart(2, "0")}`,
    file: assets.get(icon).file,
    row: rowIndex + 1,
    column: columnIndex + 1,
    label: "",
    kind: icon.startsWith("folder-") ? "folder" : icon,
    z: 1,
    offset: [x, y],
    size: [68, 68],
    sourceRect: [x, y, 68, 68],
    transparent: true,
  };
}));
const manifest = {
  version: 2,
  canvas: { width: 1672, height: 941 },
  source: "./desktop-composition.svg",
  grid: { columns: 10, rows: 8, count: 80 },
  layers,
  items,
  collectionBox: { file: "cozium-box.svg", front: "cozium-box-front.svg", size: [240, 180], opening: [66, 64, 112, 21], interior: [[66.2, 71.5], [188.8, 72.7], [171.6, 87.5], [55.6, 86]] },
  notes: "풍경 없는 따뜻한 아이보리 종이 바탕, 이름 없는 SVG 파일 아이콘 80개. 같은 종류의 SVG를 재사용하며 개별 id·offset을 유지한다. 오른쪽 42%와 아이콘 아래 공간은 이후 정리 장면용 여백이다.",
};

for (const asset of assets.values()) {
  await fs.writeFile(path.join(output, asset.file), vector(asset.width, asset.height, asset.content));
}
await fs.rm(path.join(output, "cursor-arrow.svg"), { force: true });
await fs.writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const sourceOrder = [...layers, ...items].sort((a, b) => a.z - b.z);
const compositionFiles = new Set(sourceOrder.map(part => part.file));
const symbols = [...assets.values()].filter(asset => compositionFiles.has(asset.file)).map(asset => `<symbol id="asset-${asset.id}" viewBox="0 0 ${asset.width} ${asset.height}" fill="none">${asset.content}</symbol>`).join("\n");
const uses = sourceOrder.map(part => {
  const asset = [...assets.values()].find(candidate => candidate.file === part.file);
  return `<use href="#asset-${asset.id}" x="${part.offset[0]}" y="${part.offset[1]}" width="${asset.width}" height="${asset.height}"/>`;
}).join("\n");
await fs.writeFile(path.join(output, "desktop-composition.svg"), vector(1672, 941, `<defs>\n${symbols}\n</defs>\n${uses}`));

await fs.writeFile(path.join(output, "README.md"), `# Cozium 샘플 바탕화면 파츠

현재 랜딩은 이 폴더의 바탕·아이콘·작업 표시줄·테두리를 사용합니다. SVG 상자 두 개는 이전 디자인 초안이며 현재 정리 상자는 별도 PNG 에셋을 사용합니다.

랜딩의 따뜻한 종이·크래프트·포레스트 그린 톤을 잇는 바탕화면 초안입니다. 정리 상자는 단순화한 초안 2입니다. 풍경 그림을 사용하지 않는 아이보리 종이 바탕화면입니다. 파일명과 그림으로 만든 마우스 포인터는 표시하지 않습니다. 초기 화면에는 text 노드가 없으며, 별도 정리 상자에만 Cozium 이름을 표시합니다. 아이콘은 조금 불규칙한 따뜻한 잉크 외곽선, 깊은 녹색·샌드색, 밝은 상단과 낮은 그림자를 공유합니다. 정리 상자는 넓은 이삿짐 박스 비율, 네 덮개와 세 가지 크래프트 색면을 사용했습니다. 상자에는 반복 질감·광택·하이라이트·블러 그림자를 사용하지 않고, 전면에 작은 녹색 Cozium 스탬프를 바로 인쇄합니다.

## 화면과 배치

- 기준 화면: **1672 × 941**.
- 아이콘: **68 × 68 SVG 캔버스** 안에 약 47 × 47의 실제 그림. 아이콘 주위 투명 여백에 작은 그림자를 포함합니다.
- 10열 × 8행, 총 80개의 독립적인 manifest 항목. 첫 위치 **[54, 45]**, 가로 간격 **94**, 세로 간격 **100**.
- 가장 오른쪽 아이콘 끝 x=968, 가장 아래쪽 끝 y=813. 오른쪽 약 42%를 비워 둡니다.
- 아이콘 label은 빈 문자열입니다. kind와 id는 향후 파일 이동 및 분류에 사용할 수 있습니다.

## SVG 파일

| 파일 | 고유 크기 | 역할 |
| --- | --- | --- |
| wallpaper.svg | 1672 × 941 | 불투명한 바탕 |
| icons/folder-sage.svg | 68 × 68 | 세이지 폴더 |
| icons/folder-sand.svg | 68 × 68 | 샌드 폴더 |
| icons/document.svg | 68 × 68 | 문서 |
| icons/photo.svg | 68 × 68 | 사진 파일의 작은 형식 표시 |
| icons/video.svg | 68 × 68 | 영상 |
| icons/audio.svg | 68 × 68 | 음악 |
| icons/archive.svg | 68 × 68 | 압축 파일 |
| taskbar.svg | 1634 × 56 | 텍스트 없는 반투명 작업 표시줄 |
| monitor-frame.svg | 1672 × 941 | 안쪽이 투명한 얇은 모니터 테두리 |
| cozium-box.svg | 240 × 180 | 인터랙션으로 나중에 등장하는 열린 정리 상자 |
| cozium-box-front.svg | 240 × 180 | 파일이 들어갈 때 위에 그리는 앞면과 가까운 덮개 |
| desktop-composition.svg | 1672 × 941 | 각 파츠를 inline symbol/use로 합친 미리보기 |

## 사용 순서

manifest.json의 z 순서로 wallpaper → 80 icons → taskbar → monitor frame을 렌더합니다. 각 파츠는 offset에 있는 원본 좌표로 놓으며, SVG의 width/height를 기준으로 그림을 그립니다. 별도 파츠의 내부 글리프나 크기를 다시 맞출 필요는 없습니다. 여러 아이콘이 같은 SVG 파일을 사용하지만 id는 80개 모두 서로 달라 독립적인 움직임이 가능합니다.

cozium-box.svg와 cozium-box-front.svg는 초기 레이어에 포함되지 않습니다. 열린 입구는 [66, 64, 112, 21]의 내부 직사각형을 드롭 판정에 사용할 수 있습니다. 이 값과 원본 240 × 180 크기는 manifest.collectionBox에 있습니다. interior의 네 꼭짓점은 바닥면 [[66.2,71.5],[188.8,72.7],[171.6,87.5],[55.6,86]]입니다. 별도 상자를 그릴 때 동일한 배율로 입구 좌표를 변환합니다. 파일이 들어가는 동안에는 상자 → 파일 → front 순서로 같은 위치와 배율에 그려 가까운 덮개 뒤로 파일이 들어가게 합니다. 정적 합성 보기에는 상자나 마우스 포인터를 포함하지 않습니다.

desktop-composition.svg는 외부 파일이나 URL을 참조하지 않습니다. 이 파일은 원본 보기 및 정적인 디자인 확인용이며, 실제 동작에서는 manifest와 개별 SVG를 사용합니다.

코드로 만든 에셋입니다. 프로젝트 루트의 tools/make-clean-desktop.mjs가 생성기이며 외부 폰트가 필요하지 않습니다. 프로젝트 루트에서 node tools/make-clean-desktop.mjs를 실행하면 assets/landing/parts/desktop-v2에 생성합니다. 첫 번째 인수로 다른 출력 경로를 지정할 수 있습니다.
`);

console.log(JSON.stringify({ output, svgFiles: assets.size + 1, layers: layers.length, items: items.length, logicalAssets: layers.length + items.length, uniqueInitialImages: compositionFiles.size, decorativeCursorRemoved: true, collectionBox: manifest.collectionBox, maxIconRight: Math.max(...items.map(item => item.offset[0] + item.size[0])), maxIconBottom: Math.max(...items.map(item => item.offset[1] + item.size[1])) }, null, 2));
