const clamp = (value) => {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : Math.min(1, Math.max(0, number));
};
const smooth = (value) => value * value * (3 - 2 * value);
export const OPEN_SPEED = 1.5;

export const FLAPS = {
  upper: {
    hinge: [[369, 199], [1301, 199]],
    closed: [[369, 430], [1301, 430]],
    open: [[369, 58], [1306, 58]],
    delay: 0, duration: 920 / OPEN_SPEED, liftHeight: 55,
  },
  lower: {
    hinge: [[359, 690], [1308, 690]],
    closed: [[359, 430], [1308, 430]],
    open: [[343, 837], [1325, 837]],
    delay: 90 / OPEN_SPEED, duration: 920 / OPEN_SPEED, liftHeight: 70,
  },
  left: {
    hinge: [[364, 211], [355, 693]],
    closed: [[835, 211], [835, 693]],
    open: [[208, 209], [190, 680]],
    delay: 780 / OPEN_SPEED, duration: 880 / OPEN_SPEED, liftHeight: 60,
  },
  right: {
    hinge: [[1307, 214], [1315, 688]],
    closed: [[835, 214], [835, 688]],
    open: [[1465, 208], [1484, 690]],
    delay: 850 / OPEN_SPEED, duration: 880 / OPEN_SPEED, liftHeight: 60,
  },
};

export const OPEN_DURATION = Math.max(...Object.values(FLAPS).map(({ delay, duration }) => delay + duration));

function signedArea(quad) {
  return quad.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = quad[(index + 1) % quad.length];
    return sum + x * nextY - nextX * y;
  }, 0) / 2;
}

export function getFlapPose(name, progress) {
  const flap = FLAPS[name];
  if (!flap) throw new RangeError(`Unknown flap: ${name}`);
  const value = clamp(progress);
  const angle = Math.PI * value;
  const lift = value === 0 || value === 1 ? 0 : -flap.liftHeight * Math.sin(angle);
  const blend = (1 - Math.cos(angle)) / 2;
  const free = flap.closed.map((point, index) => {
    if (value === 0) return [...point];
    if (value === 1) return [...flap.open[index]];
    return [
      point[0] + (flap.open[index][0] - point[0]) * blend,
      point[1] + (flap.open[index][1] - point[1]) * blend + lift,
    ];
  });
  const quad = [[...flap.hinge[0]], [...flap.hinge[1]], free[1], free[0]];
  const area = signedArea(quad);
  const closedArea = signedArea([flap.hinge[0], flap.hinge[1], flap.closed[1], flap.closed[0]]);
  return { name, progress: value, quad, back: area * closedArea < 0, edgeExposure: smooth(value), angle, lift, area };
}

export function getFlapStates(elapsedMs, reduced = false) {
  const rawElapsed = Number(elapsedMs);
  const elapsed = reduced ? OPEN_DURATION : Math.max(0, Number.isNaN(rawElapsed) ? 0 : rawElapsed);
  const flaps = Object.fromEntries(Object.entries(FLAPS).map(([name, flap]) => [
    name, getFlapPose(name, (elapsed - flap.delay) / flap.duration),
  ]));
  const done = elapsed >= OPEN_DURATION;
  const phase = done ? "open" : elapsed >= FLAPS.left.delay ? "side-flaps" : "top-bottom";
  return { flaps, done, phase };
}
