/**
 * confetti.js — 종이 조각 폭죽 (2026-10-18, 다 치웠을 때 결과 화면. 사용자: "이펙트가 심심").
 *
 * 캔버스 하나에 종이 조각 수백 장. 양쪽 아래 모서리에서 대포처럼 쏘아 올리고, 중력·공기 저항·팔랑임(앞뒤로 뒤집히며
 * 폭이 줄었다 늘었다)으로 떨어진다. 다 떨어지면 스스로 멈추고 캔버스를 비운다. 라이브러리 없음.
 */
const COLORS = ["#d9b768", "#8fb08a", "#e3a07a", "#254c43", "#c8d7e8", "#f3edd3", "#b9785a"];

export function createConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  let pieces = [], raf = 0, last = 0, dpr = 1;

  const fit = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  };

  function piece(x, y, angle, speed) {
    const big = Math.random() < 0.25;
    return {
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: big ? 10 + Math.random() * 6 : 6 + Math.random() * 5, h: big ? 14 + Math.random() * 8 : 9 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 9,
      flip: Math.random() * Math.PI * 2, flipSpeed: 6 + Math.random() * 8,
      sway: Math.random() * Math.PI * 2, swaySpeed: 1.5 + Math.random() * 2,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.18,
      life: 0,
    };
  }

  function step(now) {
    const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
    last = now;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const h = height / dpr;
    pieces = pieces.filter((p) => p.y < h + 40 && p.life < 9);
    for (const p of pieces) {
      p.life += dt;
      p.vy += 980 * dt * 0.62;              // 중력
      const drag = Math.pow(0.18, dt);       // 공기 저항(초당 82%가 깎인다)
      p.vx *= drag; p.vy = Math.min(p.vy * Math.pow(0.55, dt), 260 + p.w * 6); // 종이라 금방 종단 속도
      p.sway += p.swaySpeed * dt;
      p.x += (p.vx + Math.sin(p.sway) * 38) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.flip += p.flipSpeed * dt;
      const sx = Math.cos(p.flip); // 앞뒤로 뒤집히며 폭이 변한다
      ctx.save();
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      ctx.scale(sx * dpr, dpr);
      ctx.globalAlpha = Math.min(1, (9 - p.life) / 1.2);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (sx < 0) { ctx.fillStyle = "#0000001f"; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); } // 뒷면은 살짝 어둡게
      ctx.restore();
    }
    if (pieces.length) raf = requestAnimationFrame(step);
    else { raf = 0; ctx.clearRect(0, 0, width, height); }
  }

  const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(step); } };

  return {
    /** 양쪽 아래 모서리에서 위·안쪽으로 쏜다. */
    cannons({ count = 150 } = {}) {
      fit();
      const { width, height } = canvas.getBoundingClientRect();
      for (let side = 0; side < 2; side++) {
        const x = side ? width - 40 : 40, y = height - 90;
        for (let i = 0; i < count; i++) {
          const spread = (Math.random() - 0.5) * 0.55;
          const angle = side ? -Math.PI * 0.68 + spread : -Math.PI * 0.32 + spread;
          pieces.push(piece(x, y, angle, 900 + Math.random() * 900));
        }
      }
      run();
    },
    /** 위에서 흩뿌린다(대포 뒤에 이어서). */
    rain({ count = 90 } = {}) {
      fit();
      const { width } = canvas.getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        const p = piece(Math.random() * width, -20 - Math.random() * 260, Math.PI / 2, 40 + Math.random() * 80);
        pieces.push(p);
      }
      run();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      pieces = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
