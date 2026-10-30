/**
 * Shared pieces for the Stats charts. SVG ids come from `useId` at the call
 * site because they are document-global.
 */

export const VerticalFade = ({
  id,
  color,
  from = 0.28,
}: {
  id: string;
  color: string;
  from?: number;
}) => (
  <linearGradient id={id} x1='0' x2='0' y1='0' y2='1'>
    <stop offset='0%' stopColor={color} stopOpacity={from} />
    <stop offset='100%' stopColor={color} stopOpacity={0} />
  </linearGradient>
);

export const WIN_COLOR = "var(--viz-win)";
export const LOSS_COLOR = "var(--viz-loss)";
export const DANGER_COLOR = "var(--viz-danger)";
export const CAUTION_COLOR = "var(--viz-caution)";
export const WARN_COLOR = "var(--viz-warn)";
export const PENDING_COLOR = "var(--viz-pending)";
export const INFO_COLOR = "var(--viz-info)";
export const MUTED_COLOR = "var(--viz-muted)";

/** A win rate's colour: even or better reads as winning. */
export const winrateColor = (winrate: number) =>
  winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR;

/** A colour at reduced strength; works with any CSS colour, unlike Tailwind's `/opacity`. */
export const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/**
 * A chart caption on a small card-coloured pill, so it stays readable where it
 * crosses the data. Pass it as a recharts `label`; recharts injects `viewBox`
 * (the reference line's box, or the reference dot's bounding box).
 */
export const PillLabel = ({
  text,
  color = "hsl(var(--muted-foreground))",
  placement = "line",
  viewBox,
}: {
  text: string;
  color?: string;
  /** `line` sits above a line's left end; the others sit beside a dot. */
  placement?: "line" | "above" | "below" | "left";
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}) => {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null;
  const width = text.length * 6.4 + 14;
  const centerX = viewBox.x + (viewBox.width ?? 0) / 2;
  const centerY = viewBox.y + (viewBox.height ?? 0) / 2;
  const [left, top] =
    placement === "above"
      ? [centerX - width / 2, viewBox.y - 24]
      : placement === "below"
        ? [centerX - width / 2, viewBox.y + (viewBox.height ?? 0) + 6]
        : placement === "left"
          ? [viewBox.x - width - 8, centerY - 9]
          : [viewBox.x + 8, viewBox.y - 22];
  const accented = placement !== "line";
  return (
    <g transform={`translate(${left}, ${top})`}>
      <rect
        fill='hsl(var(--card))'
        height={18}
        rx={5}
        stroke={accented ? tint(color, 40) : "hsl(var(--border))"}
        width={width}
      />
      <text
        className='font-mono'
        dominantBaseline='central'
        fill={color}
        fontSize={10.5}
        fontWeight={accented ? 600 : 400}
        x={7}
        y={9}>
        {text}
      </text>
    </g>
  );
};

/** A one-line takeaway under a chart, inset on the page colour like the design. */
export const NOTE_CLASS =
  "flex items-center gap-2 rounded-lg bg-background px-3 py-2.5 font-medium text-foreground/85 text-xs";

/** A hero portrait framed as a tile: the art sits on the page colour behind a hairline. */
export const HERO_TILE_CLASS =
  "rounded-lg border border-foreground/10 bg-background";
