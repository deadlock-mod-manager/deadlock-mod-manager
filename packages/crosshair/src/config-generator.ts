import type { CrosshairConfig } from "./types";
import { DEFAULT_CROSSHAIR_CONFIG } from "./types";

export function generateConfigString(config: CrosshairConfig): string {
  const {
    color,
    pipBorder,
    pipGapStatic,
    pipOpacity,
    width,
    height,
    gap,
    dotOpacity,
    dotOutlineOpacity,
  } = config;

  return `citadel_crosshair_color_r ${color.r}; citadel_crosshair_color_g ${color.g}; citadel_crosshair_color_b ${color.b}; citadel_crosshair_pip_border ${pipBorder}; citadel_crosshair_pip_gap_static ${pipGapStatic}; citadel_crosshair_pip_opacity ${pipOpacity}; citadel_crosshair_pip_width ${width}; citadel_crosshair_pip_height ${height}; citadel_crosshair_pip_gap ${gap}; citadel_crosshair_dot_opacity ${dotOpacity}; citadel_crosshair_dot_outline_opacity ${dotOutlineOpacity}`;
}

export function parseConfigString(str: string): CrosshairConfig | null {
  try {
    const config = { ...DEFAULT_CROSSHAIR_CONFIG };
    const commands = str.split(";").map((s) => s.trim());

    for (const command of commands) {
      const [key, value] = command.split(/\s+/);

      switch (key) {
        case "citadel_crosshair_color_r":
          config.color.r = Number.parseInt(value, 10);
          break;
        case "citadel_crosshair_color_g":
          config.color.g = Number.parseInt(value, 10);
          break;
        case "citadel_crosshair_color_b":
          config.color.b = Number.parseInt(value, 10);
          break;
        case "citadel_crosshair_pip_border":
          config.pipBorder = value === "true";
          break;
        case "citadel_crosshair_pip_gap_static":
          config.pipGapStatic = value === "true";
          break;
        case "citadel_crosshair_pip_opacity":
          config.pipOpacity = Number.parseFloat(value);
          break;
        case "citadel_crosshair_pip_width":
          config.width = Number.parseFloat(value);
          break;
        case "citadel_crosshair_pip_height":
          config.height = Number.parseFloat(value);
          break;
        case "citadel_crosshair_pip_gap":
          config.gap = Number.parseFloat(value);
          break;
        case "citadel_crosshair_dot_opacity":
          config.dotOpacity = Number.parseFloat(value);
          break;
        case "citadel_crosshair_dot_outline_opacity":
          config.dotOutlineOpacity = Number.parseFloat(value);
          break;
      }
    }

    return config;
  } catch {
    return null;
  }
}
