/** Keep the running clock out of DOM text layout; the timeline owns its accessible value. */
export function createViewerTimeReadout(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  let label = "";
  let width = 0;
  let height = 0;
  const draw = () => {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillText(label, 0, height / 2);
  };
  const configure = () => {
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const style = getComputedStyle(canvas);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fillStyle = style.color;
    context.textBaseline = "middle";
    draw();
  };
  const resize = new ResizeObserver(configure);
  resize.observe(canvas);
  const theme = new MutationObserver(configure);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  window.addEventListener("resize", configure);
  configure();
  return {
    write(value: string) {
      if (value === label) return;
      label = value;
      draw();
    },
    dispose() {
      resize.disconnect();
      theme.disconnect();
      window.removeEventListener("resize", configure);
    },
  };
}
