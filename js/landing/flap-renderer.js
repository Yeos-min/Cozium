import { FLAPS } from "./flap-geometry.js";

const FRAME = { width: 1672, height: 941 };
const BODY = [[364, 199], [1307, 199], [1316, 693], [355, 693]];
const lerp = (a, b, value) => a + (b - a) * value;

function quadPoint(quad, u, v) {
  const top = [lerp(quad[0][0], quad[1][0], u), lerp(quad[0][1], quad[1][1], u)];
  const bottom = [lerp(quad[3][0], quad[2][0], u), lerp(quad[3][1], quad[2][1], u)];
  return [lerp(top[0], bottom[0], v), lerp(top[1], bottom[1], v)];
}

function path(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function triangle(ctx, image, source, target) {
  const [a, b, c] = source, [p, q, r] = target;
  const du1 = b[0] - a[0], du2 = c[0] - a[0], dv1 = b[1] - a[1], dv2 = c[1] - a[1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < .0001) return;
  const aa = ((q[0] - p[0]) * dv2 - (r[0] - p[0]) * dv1) / det;
  const bb = ((q[1] - p[1]) * dv2 - (r[1] - p[1]) * dv1) / det;
  const cc = (du1 * (r[0] - p[0]) - du2 * (q[0] - p[0])) / det;
  const dd = (du1 * (r[1] - p[1]) - du2 * (q[1] - p[1])) / det;
  const center = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3];
  const padded = target.map(([x, y]) => {
    const dx = x - center[0], dy = y - center[1], length = Math.max(1, Math.hypot(dx, dy));
    return [x + dx / length * .65, y + dy / length * .65];
  });
  ctx.save(); path(ctx, padded); ctx.clip();
  ctx.transform(aa, bb, cc, dd, p[0] - aa * a[0] - cc * a[1], p[1] - bb * a[0] - dd * a[1]);
  ctx.drawImage(image, 0, 0); ctx.restore();
}

export function mapQuad(ctx, image, source, target, columns = 8, rows = 3) {
  ctx.save(); path(ctx, target); ctx.clip();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const uv = [[column / columns, row / rows], [(column + 1) / columns, row / rows], [(column + 1) / columns, (row + 1) / rows], [column / columns, (row + 1) / rows]];
      const from = uv.map(([u, v]) => quadPoint(source, u, v));
      const to = uv.map(([u, v]) => quadPoint(target, u, v));
      triangle(ctx, image, [from[0], from[1], from[2]], [to[0], to[1], to[2]]);
      triangle(ctx, image, [from[0], from[2], from[3]], [to[0], to[2], to[3]]);
    }
  }
  ctx.restore();
}

function flapQuad(flap, free) { return [flap.hinge[0], flap.hinge[1], free[1], free[0]]; }

export function createFlapMaterials(images) {
  return Object.fromEntries(Object.entries(FLAPS).map(([name, flap]) => {
    const width = Math.round(Math.hypot(flap.hinge[1][0] - flap.hinge[0][0], flap.hinge[1][1] - flap.hinge[0][1]));
    const height = Math.round(Math.hypot(flap.closed[0][0] - flap.hinge[0][0], flap.closed[0][1] - flap.hinge[0][1]));
    const faces = {};
    for (const face of ["front", "back"]) {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const source = face === "back" ? images.open : name === "left" || name === "right" ? images.inner : images.clean;
      mapQuad(canvas.getContext("2d"), source, flapQuad(flap, face === "back" ? flap.open : flap.closed), [[0, 0], [width, 0], [width, height], [0, height]]);
      faces[face] = canvas;
    }
    return [name, faces];
  }));
}

function drawBody(ctx, body) {
  // The generated cutout was enlarged. Register its opaque body back to the approved rim.
  const source = [[300, 166], [1373, 166], [1393, 742], [277, 742]];
  mapQuad(ctx, body, source, BODY, 10, 5);
}

function drawBodyShadow(ctx) {
  ctx.save();
  path(ctx, [[364, 199], [1307, 199], [1428, 316], [1445, 815], [529, 826], [355, 693]]);
  ctx.filter = "blur(9px)";
  ctx.fillStyle = "#7155362b"; ctx.fill();
  ctx.restore();
}

function drawFlapShadow(ctx, pose) {
  if (pose.progress === 0) return;
  const lift = Math.abs(pose.lift);
  const offset = [7 + lift * .65, 10 + lift * .55];
  ctx.save(); path(ctx, pose.quad.map(([x, y]) => [x + offset[0], y + offset[1]]));
  ctx.filter = `blur(${3 + lift / 9}px)`;
  ctx.fillStyle = "#62452526"; ctx.fill(); ctx.restore();
}

function drawEdge(ctx, pose) {
  if (pose.edgeExposure <= 0) return;
  const a = pose.quad[2], b = pose.quad[3], ha = pose.quad[0], hb = pose.quad[1];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.max(1, Math.hypot(dx, dy));
  let nx = -dy / length, ny = dx / length;
  const away = [(a[0] + b[0] - ha[0] - hb[0]) / 2, (a[1] + b[1] - ha[1] - hb[1]) / 2];
  if (nx * away[0] + ny * away[1] < 0) { nx = -nx; ny = -ny; }
  const thickness = 3.4 * pose.edgeExposure;
  const shift = [nx * thickness, ny * thickness];
  ctx.save();
  path(ctx, [a, b, [b[0] + shift[0], b[1] + shift[1]], [a[0] + shift[0], a[1] + shift[1]]]);
  ctx.fillStyle = "#c09861"; ctx.fill(); ctx.clip();
  ctx.beginPath();
  const count = Math.ceil(length / 7);
  for (let index = 0; index <= count; index++) {
    const t = index / count, wave = (.5 + Math.sin(index * 2.4) * .28) * thickness;
    const x = lerp(a[0], b[0], t) + nx * wave, y = lerp(a[1], b[1], t) + ny * wave;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#604524b3"; ctx.lineWidth = .85; ctx.stroke(); ctx.restore();
}

function drawFlap(ctx, material, pose) {
  drawFlapShadow(ctx, pose);
  if (Math.abs(pose.area) > 2) {
    const face = material[pose.back ? "back" : "front"];
    mapQuad(ctx, face, [[0, 0], [face.width, 0], [face.width, face.height], [0, face.height]], pose.quad);
    ctx.save(); path(ctx, pose.quad);
    ctx.strokeStyle = "#64472d99"; ctx.lineWidth = .85; ctx.stroke(); ctx.restore();
  }
  drawEdge(ctx, pose);
}

export function drawOpeningScene(ctx, images, states) {
  ctx.drawImage(images.floor, 0, 0, FRAME.width, FRAME.height);
  drawBodyShadow(ctx);
  drawBody(ctx, images.body);
  const sideProgress = (states.flaps.left.progress + states.flaps.right.progress) / 2;
  ctx.save(); path(ctx, BODY); ctx.clip();
  ctx.fillStyle = `rgba(67,42,23,${.12 * (1 - sideProgress)})`;
  ctx.fillRect(355, 199, 961, 494); ctx.restore();
  const lower = states.flaps.lower.progress;
  if (lower < .28) {
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - lower / .28);
    path(ctx, [[359, 690], [1308, 690], [1277, 721], [391, 721]]); ctx.clip();
    ctx.drawImage(images.clean, 355, 690, 963, 34, 355, 690, 963, 34); ctx.restore();
  }
  for (const name of ["left", "right", "upper", "lower"]) drawFlap(ctx, images.flapMaterials[name], states.flaps[name]);
}
