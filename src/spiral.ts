// The work showcase: project covers ride a turning spiral. Tiles are plain
// links styled in CSS; this module only positions them.
const STEP = 0.7; // radians between neighbouring tiles
const REACH = 5.5; // tiles further than this from the front are hidden
const LENS = 1400; // viewing distance used to project the spiral

export interface SpiralControls {
  /** Fractional positions turn the spiral partway between two projects. */
  setTarget(position: number, immediate?: boolean): void;
  destroy(): void;
}

export function initSpiral(
  stage: HTMLElement,
  isStill: () => boolean,
  onPick: (index: number) => void,
): SpiralControls | null {
  const found = stage.querySelector<HTMLElement>(".spiral-rig");
  const tiles = [...stage.querySelectorAll<HTMLAnchorElement>("[data-spiral-tile]")];
  if (!found || !tiles.length) return null;
  const rig = found;
  const covers = tiles.map((tile) => tile.querySelector<HTMLElement>("img"));
  const last = tiles.length - 1;
  let target = 0;
  let position = 0;
  let frame = 0;
  let radius = 300;
  let rise = 60;
  let lookX = 0;
  let lookY = 0;
  let aimX = 0;
  let aimY = 0;

  function layout() {
    tiles.forEach((tile, i) => {
      const offset = i - position;
      const distance = Math.abs(offset);
      if (distance > REACH) {
        tile.style.visibility = "hidden";
        return;
      }
      const angle = offset * STEP;
      const depth = (Math.cos(angle) + 1) / 2; // 1 at the front, 0 at the back
      // Each tile is projected by hand and stacked by depth, so posters
      // overlap like cards instead of slicing through one another.
      const near = LENS / (LENS + (1 - Math.cos(angle)) * radius);
      const scale = near * (1 + 0.16 * Math.max(0, 1 - distance));
      tile.style.visibility = "visible";
      tile.style.zIndex = String(Math.round(near * 1000));
      tile.style.opacity = String(Math.min(1, (REACH - distance) / 1.5));
      // Covers dim as they recede; their labels drop away rather than fade.
      const dim = depth > 0.995 ? "none" : `brightness(${(0.5 + 0.5 * depth).toFixed(3)})`;
      (covers[i] ?? tile).style.filter = dim;
      tile.classList.toggle("is-far", distance > 1.5);
      tile.style.transform = `translate(${(Math.sin(angle) * radius * near).toFixed(1)}px, ${(offset * rise * near).toFixed(1)}px) scale(${scale.toFixed(3)}) perspective(${LENS}px) rotateY(${(Math.sin(angle) * 38).toFixed(2)}deg)`;
      tile.classList.toggle("is-front", distance < 0.5);
    });
    rig.style.transform = `rotateZ(-6deg) rotateX(${(6 - lookY * 8).toFixed(2)}deg) rotateY(${(lookX * 10).toFixed(2)}deg)`;
  }
  function tick() {
    frame = 0;
    position += (target - position) * 0.14;
    lookX += (aimX - lookX) * 0.08;
    lookY += (aimY - lookY) * 0.08;
    const settled = Math.abs(target - position) < 0.001 && Math.abs(aimX - lookX) < 0.002 && Math.abs(aimY - lookY) < 0.002;
    if (settled) position = target;
    layout();
    if (!settled) frame = requestAnimationFrame(tick);
  }
  function setTarget(next: number, immediate = false) {
    target = Math.max(0, Math.min(last, next));
    if (immediate || isStill()) {
      position = target;
      lookX = aimX;
      lookY = aimY;
      layout();
    } else if (!frame) frame = requestAnimationFrame(tick);
  }

  const sizes = new ResizeObserver(() => {
    const width = tiles[0].offsetWidth;
    radius = width * 1.15;
    rise = width * 0.2;
    layout();
  });
  sizes.observe(stage);

  // Drag to turn; a click on a tile that is not in front brings it forward.
  let dragging = false;
  let dragged = false;
  let startX = 0;
  let startY = 0;
  let startTarget = 0;
  function down(event: PointerEvent) {
    if (event.button) return;
    dragging = true;
    dragged = false;
    startX = event.clientX;
    startY = event.clientY;
    startTarget = target;
  }
  function move(event: PointerEvent) {
    const box = stage.getBoundingClientRect();
    aimX = (event.clientX - box.left) / box.width - 0.5;
    aimY = (event.clientY - box.top) / box.height - 0.5;
    if (dragging) {
      const dx = event.clientX - startX;
      if (!dragged && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(event.clientY - startY)) {
        dragged = true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add("is-dragging");
      }
      if (dragged) {
        setTarget(startTarget - dx / (radius * 0.75));
        return;
      }
    }
    if (!frame && !isStill()) frame = requestAnimationFrame(tick);
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (dragged) onPick(Math.round(target));
  }
  function leave() {
    aimX = 0;
    aimY = 0;
    if (!frame && !isStill()) frame = requestAnimationFrame(tick);
  }
  function click(event: MouseEvent) {
    const tile = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-spiral-tile]") : null;
    const index = Number(tile?.dataset.spiralTile);
    // The front tile's own link opens the project; anything else only turns.
    if (!dragged && (!tile || index === Math.round(target))) return;
    event.preventDefault();
    event.stopPropagation();
    if (!dragged && tile) onPick(index);
    dragged = false;
  }
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("pointerleave", leave);
  stage.addEventListener("click", click, true);
  stage.addEventListener("dragstart", (event) => event.preventDefault());
  layout();

  return {
    // A drag in progress wins over scroll-driven turns.
    setTarget: (next, immediate) => {
      if (!(dragging && dragged)) setTarget(next, immediate);
    },
    destroy() {
      cancelAnimationFrame(frame);
      sizes.disconnect();
    },
  };
}
