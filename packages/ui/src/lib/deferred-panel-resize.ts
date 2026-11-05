import type { ImperativePanelGroupHandle } from "react-resizable-panels";

/** Keep expensive preview layouts stable while the pointer moves a resize guide. */
export function attachDeferredPanelResize(api: ImperativePanelGroupHandle) {
  const group = document.querySelector<HTMLElement>(
    `[data-panel-group][data-panel-group-id="${CSS.escape(api.getId())}"]`,
  );
  if (!group) return;
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  let finish: ((commit: boolean) => void) | null = null;

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || finish) return;
    let handle =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-panel-resize-handle-id]")
        : null;
    if (!handle || handle.parentElement !== group) {
      // Match the library's expanded grab area outside the one-pixel divider.
      const margin = event.pointerType === "touch" ? 15 : 5;
      handle =
        Array.from(group.children).find((node): node is HTMLElement => {
          if (
            !(node instanceof HTMLElement) ||
            !node.hasAttribute("data-panel-resize-handle-id")
          )
            return false;
          const rect = node.getBoundingClientRect();
          return (
            event.clientX >= rect.left - margin &&
            event.clientX <= rect.right + margin &&
            event.clientY >= rect.top - margin &&
            event.clientY <= rect.bottom + margin
          );
        }) ?? null;
    }
    if (
      !handle ||
      handle.getAttribute("data-panel-resize-handle-enabled") === "false"
    )
      return;
    const layout = api.getLayout();
    // Multi-panel groups continue using the library's redistribution rules.
    if (layout.length !== 2) return;
    const vertical = group.dataset.panelGroupDirection === "vertical";
    const rtl = !vertical && getComputedStyle(group).direction === "rtl";
    const bounds = group.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    const extent = vertical ? bounds.height : bounds.width;
    if (extent <= 0) return;
    const origin = vertical ? event.clientY : event.clientX;
    const minimum = Number(handle.getAttribute("aria-valuemin") ?? 0);
    const maximum = Number(handle.getAttribute("aria-valuemax") ?? 100);
    const guide = document.createElement("div");
    guide.className = "pointer-events-none fixed z-50 bg-primary";
    guide.setAttribute("aria-hidden", "true");
    guide.dataset.slot = "panel-resize-guide";
    Object.assign(guide.style, {
      left: `${handleBounds.left}px`,
      top: `${handleBounds.top}px`,
      width: `${vertical ? handleBounds.width : 2}px`,
      height: `${vertical ? 2 : handleBounds.height}px`,
    });
    document.body.append(guide);
    const dragController = new AbortController();
    const dragOptions = { capture: true, signal: dragController.signal };
    let next = layout[0];
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    const update = (move: PointerEvent) => {
      const distance = (vertical ? move.clientY : move.clientX) - origin;
      next = Math.min(
        maximum,
        Math.max(
          minimum,
          layout[0] + (distance / extent) * 100 * (rtl ? -1 : 1),
        ),
      );
      const offset = ((next - layout[0]) / 100) * extent * (rtl ? -1 : 1);
      guide.style.transform = vertical
        ? `translateY(${offset}px)`
        : `translateX(${offset}px)`;
    };
    finish = (commit) => {
      finish = null;
      dragController.abort();
      guide.remove();
      document.body.style.cursor = previousCursor;
      if (commit && next !== layout[0]) api.setLayout([next, 100 - next]);
    };
    const move = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return;
      move.preventDefault();
      move.stopImmediatePropagation();
      update(move);
    };
    const up = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return;
      up.stopImmediatePropagation();
      update(up);
      finish?.(true);
    };
    const cancel = () => finish?.(false);
    window.addEventListener("pointermove", move, {
      ...dragOptions,
      passive: false,
    });
    window.addEventListener("pointerup", up, dragOptions);
    window.addEventListener("pointercancel", cancel, dragOptions);
    window.addEventListener(
      "blur",
      (blur) => {
        if (blur.target === window) cancel();
      },
      dragOptions,
    );
    window.addEventListener("resize", cancel, dragOptions);
    window.addEventListener("contextmenu", cancel, dragOptions);
    window.addEventListener(
      "keydown",
      (key) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopImmediatePropagation();
        cancel();
      },
      dragOptions,
    );
    event.preventDefault();
    event.stopImmediatePropagation();
    handle.focus({ preventScroll: true });
  };
  window.addEventListener("pointerdown", down, options);
  return () => {
    finish?.(false);
    controller.abort();
  };
}
