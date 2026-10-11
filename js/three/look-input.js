/** 1인칭 시선 입력. 포인터락은 한 프레임에, 커서 드래그는 시간 기준으로 소화한다. */
export class LookInput {
  #yaw = 0;
  #pitch = 0;
  #immediate = false;

  add(dx, dy, { sensitivity, immediate = false } = {}) {
    const nextImmediate = immediate === true;
    if (nextImmediate !== this.#immediate) this.clear();
    this.#immediate = nextImmediate;
    if (!Number.isFinite(sensitivity)) return;

    // 잘못된 축/너무 큰 이벤트가 이미 쌓인 정상 입력까지 오염시키지 않는다.
    if (Number.isFinite(dx)) {
      const yaw = this.#yaw - dx * sensitivity;
      if (Number.isFinite(yaw)) this.#yaw = yaw;
    }
    if (Number.isFinite(dy)) {
      const pitch = this.#pitch - dy * sensitivity;
      if (Number.isFinite(pitch)) this.#pitch = pitch;
    }
  }

  consume(dt, { smoothing = 0.38 } = {}) {
    if (this.#immediate) {
      const step = { yaw: this.#yaw, pitch: this.#pitch };
      this.clear();
      return step;
    }
    if (!Number.isFinite(dt) || dt <= 0) return { yaw: 0, pitch: 0 };

    const take = Math.min(1, Math.max(0.05, Number.isFinite(smoothing) ? smoothing : 0.38));
    // 60fps의 기존 감각을 유지하고 프레임 속도가 달라도 같은 시간에 같은 양을 소화한다.
    const alpha = 1 - (1 - take) ** (dt * 60);
    const step = { yaw: this.#yaw * alpha, pitch: this.#pitch * alpha };
    this.#yaw -= step.yaw;
    this.#pitch -= step.pitch;
    return step;
  }

  clear() {
    this.#yaw = 0;
    this.#pitch = 0;
    this.#immediate = false;
  }
}
