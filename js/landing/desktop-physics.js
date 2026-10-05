export const DESKTOP_GRAVITY = 2100;
export const MAGNET_RADIUS = 250;
export const MAGNET_LIMIT = 28;
const STEP = 1 / 120;
const TAU = Math.PI * 2;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const validPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);

function seed(id) {
  let value = 2166136261;
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967295;
}

function segmentDistance(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

// A fixed-step, source-coordinate simulation. The transparent sprite padding is
// excluded from contacts; drawing and pointer mapping remain the scene's job.
export function createDesktopPhysics(items, options = {}) {
  if (!Array.isArray(items)) throw new Error("Desktop physics items must be an array.");
  const width = Math.max(68, finite(options.width, 1672));
  const height = Math.max(68, finite(options.height, 941));
  const floor = clamp(finite(options.floor, 820), 68, height);
  const pileWidth = clamp(finite(options.pileWidth, 1100), 68, width);
  const magnetRadius = Math.max(0, finite(options.magnetRadius, MAGNET_RADIUS));
  const maxCluster = Math.max(1, Math.floor(finite(options.maxCluster, MAGNET_LIMIT)));
  const ids = new Set();
  const bodies = items.map((item, index) => {
    if (typeof item?.id !== "string" || !item.id || ids.has(item.id)) throw new Error("Desktop physics item IDs must be present and unique.");
    ids.add(item.id);
    const w = clamp(finite(item.width, 68), 1, width), h = clamp(finite(item.height, 68), 1, floor);
    const x = clamp(finite(item.x, 0), 0, width - w), y = clamp(finite(item.y, 0), 0, floor - h);
    return { id: item.id, index, width: w, height: h, radius: Math.min(w, h) * .35, origin: { x, y }, x, y, vx: 0, vy: 0, rotation: 0, spin: 0, scale: 1, held: false, deposited: false, landed: false, grounded: false, random: seed(item.id), delay: 0 };
  });
  let phase = "grid", accumulator = 0, elapsed = 0, stillFor = 0, boxCount = 0, grab = null;
  let initialFallStarted = false, initialFallComplete = false, landedCount = 0;

  function snapshot() {
    return {
      phase, boxCount, initialFallComplete, landedCount, moving: phase === "falling" || phase === "held",
      grabbedIds: grab ? grab.members.map(({ body }) => body.id) : [],
      items: bodies.map(({ id, x, y, width: w, height: h, rotation, scale, held, deposited, landed }) => ({ id, x, y, width: w, height: h, rotation, scale, held, deposited, landed })),
    };
  }

  function wake() { elapsed = 0; stillFor = 0; accumulator = 0; phase = "falling"; }

  function fall() {
    if (phase !== "grid") return false;
    wake();
    initialFallStarted = true;
    for (const body of bodies) {
      body.vx = (body.random - .5) * 190;
      body.vy = -35 * body.random;
      body.spin = (seed(`${body.id}:spin`) - .5) * 2.4;
      body.delay = seed(`${body.id}:delay`) * .16;
    }
    return true;
  }

  function ground(body) {
    body.grounded = true;
    if (!initialFallStarted || body.landed) return;
    body.landed = true;
    landedCount++;
    if (landedCount === bodies.length) initialFallComplete = true;
  }

  function bounds(body) {
    if (body.x < 0 || body.x > width - body.width) {
      body.x = clamp(body.x, 0, width - body.width);
      body.vx *= -.16;
    }
    if (body.y < 0) { body.y = 0; body.vy = Math.max(0, body.vy); }
    if (body.y > floor - body.height) {
      body.y = floor - body.height;
      body.vy = body.vy > 110 ? -body.vy * .19 : 0;
      body.vx *= .88;
      body.spin *= .86;
    }
    if (body.y >= floor - body.height - .001) ground(body);
  }

  function contacts(active, iterations = 5) {
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        for (let j = i + 1; j < active.length; j++) {
          const b = active[j];
          const dx = b.x + b.width / 2 - a.x - a.width / 2;
          const dy = b.y + b.height / 2 - a.y - a.height / 2;
          const minimum = a.radius + b.radius;
          const squared = dx * dx + dy * dy;
          if (squared >= minimum * minimum) continue;
          // Support travels up a pile only from a contact rooted on the floor.
          // "landed" is a historical latch; a bouncing landed file in mid-air
          // cannot confer that status on another file in a later substep.
          if (a.grounded && dy <= .001) ground(b);
          if (b.grounded && dy >= -.001) ground(a);
          const distance = Math.sqrt(squared);
          const nx = distance > .001 ? dx / distance : Math.cos((a.random + b.random) * TAU);
          const ny = distance > .001 ? dy / distance : Math.sin((a.random + b.random) * TAU);
          const correction = (minimum - distance) / 2;
          a.x -= nx * correction; a.y -= ny * correction;
          b.x += nx * correction; b.y += ny * correction;
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative < 0) {
            const impulse = -relative * .53;
            a.vx -= nx * impulse; a.vy -= ny * impulse;
            b.vx += nx * impulse; b.vy += ny * impulse;
            a.vx *= .985; b.vx *= .985;
          }
          a.spin *= .97; b.spin *= .97;
        }
      }
      active.forEach(bounds);
    }
  }

  function settle(active) {
    contacts(active, 30);
    active.forEach((body) => { body.vx = 0; body.vy = 0; body.spin = 0; body.delay = 0; });
    phase = boxCount === bodies.length ? "complete" : "settled";
    accumulator = 0;
  }

  function appendFollower(body) {
    const index = grab.members.length;
    body.held = true; body.vx = 0; body.vy = 0; body.delay = 0;
    const angle = index * 2.399963229728653;
    const radius = index === 0 ? 0 : 17 * Math.sqrt(index);
    grab.members.push({ body, offsetX: grab.gripX + Math.cos(angle) * radius, offsetY: grab.gripY + Math.sin(angle) * radius, rotation: index === 0 ? 0 : (body.random - .5) * .4 });
  }

  function recruit(start, end) {
    if (!grab || grab.members.length >= maxCluster) return;
    const anchor = grab.members[0].body;
    const centerOffset = { x: grab.gripX + anchor.width / 2, y: grab.gripY + anchor.height / 2 };
    const anchorStart = { x: start.x + centerOffset.x, y: start.y + centerOffset.y };
    const anchorEnd = { x: end.x + centerOffset.x, y: end.y + centerOffset.y };
    const neighbors = bodies.filter((body) => !body.held && !body.deposited).map((body) => {
      const point = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
      return { body, distance: Math.min(segmentDistance(point, start, end), segmentDistance(point, anchorStart, anchorEnd)) };
    }).filter(({ distance }) => distance <= magnetRadius).sort((a, b) => a.distance - b.distance || a.body.index - b.body.index).slice(0, maxCluster - grab.members.length);
    // New files get the next slot. Existing followers and the selected anchor
    // retain their offsets, so crossing a second pile never reshuffles the grip.
    neighbors.forEach(({ body }) => appendFollower(body));
  }

  function integrate() {
    elapsed += STEP;
    const active = bodies.filter((body) => !body.deposited && !body.held);
    active.forEach((body) => { body.grounded = false; });
    let energy = 0;
    for (const body of active) {
      if (elapsed < body.delay) continue;
      body.vy += DESKTOP_GRAVITY * STEP;
      // Keep the initial rain within the original left-hand file area. Once a
      // user releases a file elsewhere, it may land at that position naturally.
      if (body.delay > 0 && body.x > pileWidth - body.width) body.vx -= (body.x - pileWidth + body.width) * 24 * STEP;
      body.vx *= .998;
      body.x += body.vx * STEP;
      body.y += body.vy * STEP;
      body.rotation = clamp(body.rotation + body.spin * STEP, -.44, .44);
      bounds(body);
    }
    contacts(active);
    for (const body of active) energy = Math.max(energy, Math.abs(body.vx), Math.abs(body.vy));
    if (grab) {
      recruit(grab.point, grab.point);
      for (const { body, offsetX, offsetY, rotation } of grab.members) {
        const targetX = grab.point.x + offsetX, targetY = grab.point.y + offsetY;
        body.vx += ((targetX - body.x) * 180 - body.vx * 24) * STEP;
        body.vy += ((targetY - body.y) * 180 - body.vy * 24) * STEP;
        body.x = clamp(body.x + body.vx * STEP, 0, width - body.width);
        body.y = clamp(body.y + body.vy * STEP, 0, floor - body.height);
        body.rotation += (rotation - body.rotation) * .1;
        body.scale += (.96 - body.scale) * .1;
      }
    } else {
      stillFor = elapsed > .9 && energy < 34 ? stillFor + STEP : 0;
      if (stillFor > .4 || elapsed > 2.8) settle(active);
    }
  }

  function step(dtSeconds) {
    if (phase !== "falling" && phase !== "held") return snapshot();
    accumulator += clamp(finite(dtSeconds, 0), 0, .25);
    while (accumulator + 1e-10 >= STEP && (phase === "falling" || phase === "held")) {
      accumulator -= STEP;
      integrate();
    }
    return snapshot();
  }

  function beginGrab(id, point) {
    if (grab || phase === "grid" || phase === "complete" || !validPoint(point)) return false;
    const chosen = bodies.find((body) => body.id === id && !body.deposited);
    if (!chosen) return false;
    grab = { point: { ...point }, gripX: chosen.x - point.x, gripY: chosen.y - point.y, members: [] };
    appendFollower(chosen);
    recruit(point, point);
    elapsed = 0; accumulator = 0; phase = "held";
    return true;
  }

  function moveGrab(point) {
    if (!grab || !validPoint(point)) return false;
    const previous = grab.point;
    grab.point = { ...point };
    recruit(previous, point);
    return true;
  }

  function releaseGrab(dropRect) {
    if (!grab) return [];
    const { point, members } = grab;
    const deposited = validPoint(dropRect) && Number.isFinite(dropRect.width) && Number.isFinite(dropRect.height) && dropRect.width > 0 && dropRect.height > 0 && point.x >= dropRect.x && point.x <= dropRect.x + dropRect.width && point.y >= dropRect.y && point.y <= dropRect.y + dropRect.height;
    const accepted = [];
    for (const { body } of members) {
      body.held = false; body.scale = 1;
      body.vx = clamp(body.vx, -700, 700); body.vy = clamp(body.vy, -700, 700);
      if (deposited) { body.deposited = true; body.scale = 0; body.vx = 0; body.vy = 0; accepted.push(body.id); }
    }
    boxCount += accepted.length;
    grab = null;
    wake();
    if (boxCount === bodies.length) phase = "complete";
    return accepted;
  }

  function cancelGrab() { releaseGrab(null); return snapshot(); }

  function reset() {
    for (const body of bodies) Object.assign(body, body.origin, { vx: 0, vy: 0, rotation: 0, spin: 0, scale: 1, held: false, deposited: false, landed: false, grounded: false, delay: 0 });
    phase = "grid"; accumulator = 0; elapsed = 0; stillFor = 0; boxCount = 0; grab = null;
    initialFallStarted = false; initialFallComplete = false; landedCount = 0;
    return snapshot();
  }

  return { fall, step, beginGrab, moveGrab, releaseGrab, cancelGrab, reset, snapshot };
}
