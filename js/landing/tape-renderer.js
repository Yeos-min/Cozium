export const OVERHEAD = { width: 1672, height: 941 };
export const TAPE = { left: 355, top: 377, width: 957, height: 145 };
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };

export function getOverheadMatrix(width, height) {
  const scale = Math.max(width / OVERHEAD.width, height / OVERHEAD.height);
  return { scale, x: (width - OVERHEAD.width * scale) / 2, y: (height - OVERHEAD.height * scale) / 2 };
}

export function getTapePose(progress, hover = 0, heldTip = null) {
  const length = Math.max(TAPE.width * clamp(progress), 40 * clamp(hover));
  const slope = 1 - smooth(40, 170, length);
  const radius = clamp(length * .12, 2.8, 28), turn = 2.6;
  const frontAt = (v) => Math.max(0, length - v * slope);
  function curl(s) {
    const angle = Math.min(turn, s / radius), tail = Math.max(0, s - turn * radius);
    return { x: -radius * Math.sin(angle) - Math.cos(turn) * tail, y: -radius * (1 - Math.cos(angle)) - Math.sin(turn) * tail, angle };
  }
  const natural = curl(length);
  const naturalTip = { x: TAPE.left + length + natural.x, y: TAPE.top + natural.y };
  const tip = heldTip && progress > 0 ? heldTip : naturalTip;
  const delta = { x: tip.x - naturalTip.x, y: tip.y - naturalTip.y };
  const direction = { x: tip.x - TAPE.left - length, y: tip.y - TAPE.top };
  const directionLength = Math.max(1, Math.hypot(direction.x, direction.y));
  const cross = { x: clamp(-direction.y / directionLength, -.85, .85), y: clamp(direction.x / directionLength, .35, 1) };
  function point(u, v) {
    const rowLength = frontAt(v), sourceU = Math.min(u, rowLength), s = rowLength - sourceU;
    const bent = curl(s), t = rowLength > 0 ? s / rowLength : 0;
    const twist = smooth(.05, .85, t) * smooth(18, 110, length), follow = t * t;
    return { x: TAPE.left + rowLength + bent.x + delta.x * follow + v * cross.x * twist, y: TAPE.top + v + bent.y + delta.y * follow + v * (cross.y - 1) * twist, u: sourceU, v, angle: bent.angle };
  }
  return { length, frontAt, point, tip, radius };
}

function tapeOutline(ctx) {
  const { left: x, top: y, width: w, height: h } = TAPE;
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 4); ctx.lineTo(x + w - 10, y + 4); ctx.lineTo(x + w - 4, y + 8);
  ctx.lineTo(x + w - 7, y + 46); ctx.lineTo(x + w, y + 63); ctx.lineTo(x + w - 6, y + 78);
  ctx.lineTo(x + w - 3, y + h - 9); ctx.lineTo(x + w - 12, y + h - 5); ctx.lineTo(x + 10, y + h - 5);
  ctx.lineTo(x + 3, y + h - 1); ctx.lineTo(x + 5, y + 100); ctx.lineTo(x + 10, y + 88);
  ctx.lineTo(x + 3, y + 68); ctx.lineTo(x + 8, y + 54); ctx.lineTo(x + 5, y + 19); ctx.closePath();
}

export function createTapeMaterials(closed) {
  function surface() {
    const canvas = document.createElement("canvas");
    canvas.width = TAPE.width; canvas.height = TAPE.height;
    const ctx = canvas.getContext("2d");
    ctx.translate(-TAPE.left, -TAPE.top); tapeOutline(ctx); ctx.clip();
    return { canvas, ctx };
  }
  const front = surface(), back = surface();
  front.ctx.drawImage(closed, 0, 0);
  back.ctx.fillStyle = "#f2e5c7"; back.ctx.fillRect(TAPE.left, TAPE.top, TAPE.width, TAPE.height);
  back.ctx.globalAlpha = .38;
  for (let x = 0; x < TAPE.width; x += 160) back.ctx.drawImage(closed, TAPE.left + 30, TAPE.top + 16, 160, 100, TAPE.left + x, TAPE.top, 160, TAPE.height);
  function shades(source) {
    return Array.from({ length: 9 }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = TAPE.width; canvas.height = TAPE.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(94,65,26,${index / 8 * .18})`;
      ctx.fillRect(0, 0, TAPE.width, TAPE.height);
      return canvas;
    });
  }
  return { front: shades(front.canvas), back: shades(back.canvas) };
}

function drawUntapedBox(ctx, clean) {
  ctx.save(); ctx.beginPath();
  ctx.moveTo(374, 196); ctx.lineTo(1295, 196); ctx.quadraticCurveTo(1304, 196, 1306, 207);
  ctx.lineTo(1309, 690); ctx.lineTo(1273, 722); ctx.lineTo(395, 722); ctx.lineTo(359, 694);
  ctx.lineTo(367, 207); ctx.quadraticCurveTo(367, 196, 374, 196); ctx.closePath(); ctx.clip();
  ctx.drawImage(clean, 0, 0, OVERHEAD.width, OVERHEAD.height); ctx.restore();
}

function triangle(ctx, material, a, b, c) {
  const du1 = b.u - a.u, du2 = c.u - a.u, dv1 = b.v - a.v, dv2 = c.v - a.v;
  const det = du1 * dv2 - du2 * dv1;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(det) < .001 || Math.abs(area) < .01) return;
  const aa = ((b.x - a.x) * dv2 - (c.x - a.x) * dv1) / det, bb = ((b.y - a.y) * dv2 - (c.y - a.y) * dv1) / det;
  const cc = (du1 * (c.x - a.x) - du2 * (b.x - a.x)) / det, dd = (du1 * (c.y - a.y) - du2 * (b.y - a.y)) / det;
  const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  const padded = [a, b, c].map((point) => {
    const dx = point.x - center.x, dy = point.y - center.y, distance = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + dx / distance * .9, y: point.y + dy / distance * .9 };
  });
  ctx.save(); ctx.beginPath(); ctx.moveTo(padded[0].x, padded[0].y); ctx.lineTo(padded[1].x, padded[1].y); ctx.lineTo(padded[2].x, padded[2].y); ctx.closePath(); ctx.clip();
  ctx.transform(aa, bb, cc, dd, a.x - aa * a.u - cc * a.v, a.y - bb * a.u - dd * a.v);
  ctx.drawImage(material, 0, 0); ctx.restore();
}

function drawCurl(ctx, materials, pose, escape) {
  if (pose.length < .1 || escape >= 1) return;
  const columns = 32, rows = 14, grid = [];
  for (let row = 0; row <= rows; row++) {
    grid[row] = [];
    for (let column = 0; column <= columns; column++) grid[row][column] = pose.point(pose.length * column / columns, TAPE.height * row / rows);
  }
  ctx.save(); ctx.globalAlpha = 1 - escape; ctx.translate(escape * 120, -escape * 180);
  // Contact shadow follows the actual diagonal detachment boundary.
  ctx.beginPath();
  for (let row = 0; row <= rows; row++) {
    if (pose.frontAt(TAPE.height * row / rows) <= .1) break;
    const p = grid[row][columns]; if (row === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = "#6d4d2333"; ctx.lineWidth = 4; ctx.shadowColor = "#6d4d2333"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3; ctx.stroke(); ctx.shadowColor = "transparent";
  // Draw the attached edge first; the returned paper then covers its own curl.
  for (let column = columns - 1; column >= 0; column--) {
    for (let row = rows - 1; row >= 0; row--) {
      const a = grid[row][column], b = grid[row][column + 1], c = grid[row + 1][column], d = grid[row + 1][column + 1];
      const angle = (a.angle + b.angle + c.angle + d.angle) / 4;
      const material = (angle > Math.PI / 2 ? materials.back : materials.front)[Math.round(Math.sin(angle) * 8)];
      triangle(ctx, material, a, b, c); triangle(ctx, material, b, d, c);
    }
  }
  ctx.beginPath();
  for (let column = columns; column >= 0; column--) { const p = grid[0][column]; if (column === columns) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
  for (let row = 1; row <= rows; row++) { const p = grid[row][0]; ctx.lineTo(p.x, p.y); }
  for (let column = 1; column <= columns; column++) { const p = grid[rows][column]; ctx.lineTo(p.x, p.y); }
  ctx.strokeStyle = "#95754944"; ctx.lineWidth = .75; ctx.stroke(); ctx.restore();
}

export function drawTapeScene(ctx, images, state) {
  const { pose, escape = 0 } = state;
  ctx.drawImage(state.base || images.closed, 0, 0, OVERHEAD.width, OVERHEAD.height);
  if (!state.base) drawUntapedBox(ctx, images.clean);
  if (state.progress < 1) {
    ctx.save(); tapeOutline(ctx); ctx.clip(); ctx.beginPath(); ctx.moveTo(TAPE.left + pose.frontAt(0), TAPE.top);
    for (let row = 1; row <= 14; row++) { const v = TAPE.height * row / 14; ctx.lineTo(TAPE.left + pose.frontAt(v), TAPE.top + v); }
    ctx.lineTo(TAPE.left + TAPE.width, TAPE.top + TAPE.height); ctx.lineTo(TAPE.left + TAPE.width, TAPE.top); ctx.closePath(); ctx.clip();
    ctx.drawImage(images.closed, 0, 0, OVERHEAD.width, OVERHEAD.height); ctx.restore();
  }
  drawCurl(ctx, images.materials, pose, escape);
}
