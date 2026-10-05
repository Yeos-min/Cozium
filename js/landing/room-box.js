export const BOX_CONFIG = {
  file: "closed-box-room-v3.png",
  sourceRect: { x: 691, y: 540, w: 322, h: 183 },
  sourceContact: [249, 181],
  foot: { x: 940, y: 721 },
  width: 322,
  height: 183,
  footprint: [[694, 673], [940, 721], [1010, 663], [764, 615]],
  top: [[694, 590], [940, 626], [1010, 570], [764, 540]],
  light: [.9, .29],
};

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function convexHull(points) {
  const sorted = points.map((point) => [...point]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [], upper = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of sorted.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function centroid(points) {
  return points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
}

export function getBoxShadowModel(pose = {}) {
  const offsetY = pose.offsetY ?? 0;
  const groundFoot = [pose.x ?? BOX_CONFIG.foot.x, (pose.y ?? BOX_CONFIG.foot.y + offsetY) - offsetY];
  const scaleX = (pose.width ?? BOX_CONFIG.width) / BOX_CONFIG.width * (pose.scaleX ?? 1);
  const scaleY = (pose.height ?? BOX_CONFIG.height) / BOX_CONFIG.height * (pose.scaleY ?? 1);
  const rotation = pose.rotation ?? 0, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const lift = Math.max(0, -offsetY);
  const transform = (point) => {
    const x = (point[0] - BOX_CONFIG.foot.x) * scaleX;
    const y = (point[1] - BOX_CONFIG.foot.y) * scaleY;
    return [groundFoot[0] + x * cos - y * sin, groundFoot[1] + x * sin + y * cos];
  };
  const footprint = BOX_CONFIG.footprint.map(transform);
  const top = BOX_CONFIG.top.map(transform);
  const baseProjection = footprint.map((point) => [point[0] + lift * BOX_CONFIG.light[0], point[1] + lift * BOX_CONFIG.light[1]]);
  const topProjection = top.map((point, index) => {
    const height = Math.max(0, footprint[index][1] - point[1]) + lift;
    return [point[0] + height * BOX_CONFIG.light[0], footprint[index][1] + height * BOX_CONFIG.light[1]];
  });
  return {
    visible: pose.visible !== false,
    lift,
    groundFoot,
    footprint,
    baseProjection,
    topProjection,
    polygon: convexHull(baseProjection.concat(topProjection)),
    contactEdges: footprint.slice(0, 3),
    contactOpacity: clamp(1 - lift / 12),
    gradientStart: centroid(baseProjection),
    gradientEnd: centroid(topProjection),
  };
}

function polygonPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  points.slice(1).forEach((point) => ctx.lineTo(...point));
  ctx.closePath();
}

// Coordinates are room pixels; the caller supplies the same camera as the background.
export function drawBoxShadow(ctx, pose = {}) {
  const model = getBoxShadowModel(pose);
  if (!model.visible) return model;
  ctx.save();
  const gradient = ctx.createLinearGradient(...model.gradientStart, ...model.gradientEnd);
  gradient.addColorStop(0, "rgba(101,83,64,.20)");
  gradient.addColorStop(1, "rgba(101,83,64,.16)");
  ctx.filter = `blur(${(.9 + Math.min(model.lift / 50, 2.1)).toFixed(2)}px)`;
  ctx.fillStyle = gradient;
  polygonPath(ctx, model.polygon); ctx.fill();
  if (model.contactOpacity > 0) {
    ctx.filter = "blur(.6px)";
    ctx.fillStyle = `rgba(79,65,48,${.13 * model.contactOpacity})`;
    polygonPath(ctx, model.footprint); ctx.fill();
    ctx.strokeStyle = `rgba(79,65,48,${.30 * model.contactOpacity})`;
    ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(...model.contactEdges[0]);
    model.contactEdges.slice(1).forEach((point) => ctx.lineTo(...point));
    ctx.stroke();
  }
  ctx.restore();
  return model;
}

export function drawRoomBox(ctx, image, pose = {}) {
  const model = drawBoxShadow(ctx, pose);
  if (!model.visible) return model;
  const width = pose.width ?? BOX_CONFIG.width, height = pose.height ?? BOX_CONFIG.height;
  const crop = BOX_CONFIG.sourceRect;
  ctx.save();
  ctx.translate(pose.x ?? BOX_CONFIG.foot.x, pose.y ?? BOX_CONFIG.foot.y);
  ctx.rotate(pose.rotation ?? 0);
  ctx.scale(pose.scaleX ?? 1, pose.scaleY ?? 1);
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h,
    -BOX_CONFIG.sourceContact[0] * width / crop.w, -BOX_CONFIG.sourceContact[1] * height / crop.h, width, height);
  ctx.restore();
  return model;
}
