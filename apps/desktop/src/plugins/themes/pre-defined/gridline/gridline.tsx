import { ThemeBackdrop } from "../../components/theme-backdrop";

const GRID_SIZE = "64px";
const GRID_LINE = "rgba(255, 255, 255, 0.07)";

// Layers top to bottom: accent glow along the top edge, a vignette that fades the
// grid out towards the edges, then the hairline grid on black.
const BACKDROP_STYLE = {
  background: `
    radial-gradient(ellipse 50% 45% at 85% 0%, rgba(255, 30, 86, 0.16) 0%, transparent 70%),
    radial-gradient(ellipse 50% 45% at 50% 0%, rgba(142, 78, 198, 0.17) 0%, transparent 70%),
    radial-gradient(ellipse 55% 60% at 8% 0%, rgba(0, 150, 255, 0.22) 0%, transparent 70%),
    radial-gradient(ellipse 130% 110% at 50% 0%, transparent 45%, hsl(var(--background)) 100%),
    linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px) 0 0 / ${GRID_SIZE} ${GRID_SIZE},
    linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px) 0 0 / ${GRID_SIZE} ${GRID_SIZE},
    hsl(var(--background))
  `,
};

export default function GridlineTheme() {
  return (
    <ThemeBackdrop rootClass='gridline-theme-active' style={BACKDROP_STYLE} />
  );
}
