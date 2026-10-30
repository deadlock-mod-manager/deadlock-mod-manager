import { useEffect } from "react";
import { ThemeBackdrop } from "../../components/theme-backdrop";
import { DEFAULT_CODING_ACCENT, getCodingAccentVariables } from "./accent";

const CELL = "28px";
const MAJOR_CELL = "112px";
const MINOR_LINE = "rgba(148, 163, 184, 0.035)";
const MAJOR_LINE = "rgba(148, 163, 184, 0.07)";

// Layers top to bottom: accent and cyan glows in opposite corners, a vignette that
// fades the grid out towards the edges, then a graph-paper grid on slate with a
// brighter line every fourth cell.
const BACKDROP_STYLE = {
  background: `
    radial-gradient(ellipse 45% 40% at 92% 0%, hsl(var(--coding-accent, 158 64% 52%) / 0.13) 0%, transparent 70%),
    radial-gradient(ellipse 50% 45% at 0% 100%, rgba(56, 189, 248, 0.1) 0%, transparent 70%),
    radial-gradient(ellipse 130% 110% at 50% 0%, transparent 50%, hsl(var(--background)) 100%),
    linear-gradient(to right, ${MAJOR_LINE} 1px, transparent 1px) 0 0 / ${MAJOR_CELL} ${MAJOR_CELL},
    linear-gradient(to bottom, ${MAJOR_LINE} 1px, transparent 1px) 0 0 / ${MAJOR_CELL} ${MAJOR_CELL},
    linear-gradient(to right, ${MINOR_LINE} 1px, transparent 1px) 0 0 / ${CELL} ${CELL},
    linear-gradient(to bottom, ${MINOR_LINE} 1px, transparent 1px) 0 0 / ${CELL} ${CELL},
    hsl(var(--background))
  `,
};

export default function CodingTheme({
  accentColor = DEFAULT_CODING_ACCENT,
}: {
  accentColor?: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const vars = getCodingAccentVariables(accentColor);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key);
    };
  }, [accentColor]);

  return (
    <ThemeBackdrop rootClass='coding-theme-active' style={BACKDROP_STYLE} />
  );
}
