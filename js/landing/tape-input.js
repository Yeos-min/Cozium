const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function getDragPeel(initial, dx, dy, tapeWidth) {
  const start = clamp(initial);
  const distance = Math.hypot(Math.max(0, finite(dx)), Math.max(0, finite(dy)));
  // Scale pull resistance with the tape while limiting excessive travel.
  const pullDistance = Math.max(1, Math.min(finite(tapeWidth) * 1.3, 1360));
  return clamp(start + distance / pullDistance);
}

export function attachTapeDrag(handle, { getTapeWidth, onChange = () => {}, onComplete = () => {} }) {
  let progress = 0, active = null, complete = false, destroyed = false;

  function notify() {
    onChange({ progress, dragging: !!active, pointer: active ? { ...active.pointer } : null, startPointer: active ? { ...active.start } : null, complete });
  }

  function releaseCapture(pointerId) {
    try {
      if (!handle.hasPointerCapture || handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    } catch {
      // A cancelled browser gesture may already have released capture.
    }
  }

  function point(event) {
    return { x: finite(event.clientX), y: finite(event.clientY) };
  }

  function update(event) {
    active.pointer = point(event);
    const next = getDragPeel(active.initial, active.pointer.x - active.start.x, active.start.y - active.pointer.y, active.width);
    progress = Math.max(progress, next);
  }

  function finish() {
    if (complete || destroyed) return;
    progress = 1;
    complete = true;
    notify();
    onComplete();
  }

  function pointerDown(event) {
    if (destroyed || complete || active || event.isPrimary === false || event.button !== 0 || !Number.isFinite(event.pointerId)) return;
    const start = point(event);
    active = { id: event.pointerId, initial: progress, start, pointer: start, width: getTapeWidth() };
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      active = null;
    }
    notify();
  }

  function pointerMove(event) {
    if (destroyed || !active || active.id !== event.pointerId) return;
    event.preventDefault();
    update(event);
    notify();
  }

  function pointerUp(event) {
    if (destroyed || !active || active.id !== event.pointerId) return;
    event.preventDefault();
    update(event);
    const id = active.id;
    active = null;
    // Clear active first: releasing capture can synchronously emit lostpointercapture.
    releaseCapture(id);
    if (progress >= .85) finish();
    else notify();
  }

  function cancel(event) {
    if (destroyed || !active || active.id !== event.pointerId) return;
    const { id, initial } = active;
    active = null;
    progress = initial;
    releaseCapture(id);
    notify();
  }

  function keyDown(event) {
    if (destroyed || complete || active || event.repeat || !["Enter", " ", "Spacebar"].includes(event.key)) return;
    event.preventDefault();
    finish();
  }

  const listeners = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: cancel, lostpointercapture: cancel, keydown: keyDown };
  for (const [type, listener] of Object.entries(listeners)) handle.addEventListener(type, listener);
  notify();

  return {
    get progress() { return progress; },
    get dragging() { return !!active; },
    reset() {
      if (destroyed) return;
      const id = active?.id;
      active = null;
      progress = 0;
      complete = false;
      if (id !== undefined) releaseCapture(id);
      notify();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const id = active?.id;
      active = null;
      for (const [type, listener] of Object.entries(listeners)) handle.removeEventListener(type, listener);
      if (id !== undefined) releaseCapture(id);
    },
  };
}
