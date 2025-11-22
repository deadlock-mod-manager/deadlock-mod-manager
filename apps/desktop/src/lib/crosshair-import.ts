import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";

export interface ParseResult {
  success: boolean;
  config?: Partial<CrosshairConfig>;
  error?: string;
}

/**
 * Parses a citadel crosshair format string into a CrosshairConfig
 * Format: "key1 value1; key2 value2; ..."
 */
export function parseCitadelCrosshairFormat(input: string): ParseResult {
  try {
    const config: Partial<CrosshairConfig> = {
      color: { ...DEFAULT_CROSSHAIR_CONFIG.color },
    };

    const pairs = input
      .trim()
      .split(/\s*;\s*/)
      .filter(Boolean);

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      const spaceIndex = trimmed.indexOf(" ");
      if (spaceIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, spaceIndex).trim();
      const value = trimmed.substring(spaceIndex + 1).trim();

      switch (key) {
        case "citadel_crosshair_color_r": {
          const r = Number.parseInt(value, 10);
          if (!Number.isNaN(r) && r >= 0 && r <= 255) {
            config.color = config.color || {
              ...DEFAULT_CROSSHAIR_CONFIG.color,
            };
            config.color.r = r;
          }
          break;
        }
        case "citadel_crosshair_color_g": {
          const g = Number.parseInt(value, 10);
          if (!Number.isNaN(g) && g >= 0 && g <= 255) {
            config.color = config.color || {
              ...DEFAULT_CROSSHAIR_CONFIG.color,
            };
            config.color.g = g;
          }
          break;
        }
        case "citadel_crosshair_color_b": {
          const b = Number.parseInt(value, 10);
          if (!Number.isNaN(b) && b >= 0 && b <= 255) {
            config.color = config.color || {
              ...DEFAULT_CROSSHAIR_CONFIG.color,
            };
            config.color.b = b;
          }
          break;
        }
        case "citadel_crosshair_pip_border": {
          config.pipBorder = value.toLowerCase() === "true";
          break;
        }
        case "citadel_crosshair_pip_gap_static": {
          config.pipGapStatic = value.toLowerCase() === "true";
          break;
        }
        case "citadel_crosshair_pip_opacity": {
          const opacity = Number.parseFloat(value);
          if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 1) {
            config.pipOpacity = opacity;
          }
          break;
        }
        case "citadel_crosshair_pip_width": {
          const width = Number.parseFloat(value);
          if (!Number.isNaN(width) && width >= 0 && width <= 100) {
            config.width = width;
          }
          break;
        }
        case "citadel_crosshair_pip_height": {
          const height = Number.parseFloat(value);
          if (!Number.isNaN(height) && height >= 0 && height <= 100) {
            config.height = height;
          }
          break;
        }
        case "citadel_crosshair_pip_gap": {
          const gap = Number.parseFloat(value);
          if (!Number.isNaN(gap) && gap >= -20 && gap <= 50) {
            config.gap = gap;
          }
          break;
        }
        case "citadel_crosshair_dot_opacity": {
          const opacity = Number.parseFloat(value);
          if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 1) {
            config.dotOpacity = opacity;
          }
          break;
        }
        case "citadel_crosshair_dot_outline_opacity": {
          const opacity = Number.parseFloat(value);
          if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 1) {
            config.dotOutlineOpacity = opacity;
          }
          break;
        }
      }
    }

    return { success: true, config };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to parse crosshair format",
    };
  }
}

/**
 * Merges imported config with default config to create a complete CrosshairConfig
 */
export function mergeCrosshairConfig(
  imported: Partial<CrosshairConfig>,
): CrosshairConfig {
  return {
    ...DEFAULT_CROSSHAIR_CONFIG,
    ...imported,
    color: {
      ...DEFAULT_CROSSHAIR_CONFIG.color,
      ...imported.color,
    },
  };
}
