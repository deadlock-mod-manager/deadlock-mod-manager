import type { CrosshairConfig, HerosWithCrosshairOverrides } from "./types";

export const encodeConfigToURL = (config: CrosshairConfig): string => {
  const values = [
    config.gap,
    config.width,
    config.height,
    config.pipOpacity,
    config.pipBorder ? "true" : "false",
    config.pipGapStatic ? "true" : "false",
    config.dotOpacity,
    config.dotOutlineOpacity,
    config.color.r,
    config.color.g,
    config.color.b,
    encodeURIComponent(config.hero),
  ];

  return values.join(";");
};

export const decodeURLToConfig = (urlParams: {
  get: (key: string) => string | null;
}): CrosshairConfig | null => {
  try {
    const editParam = urlParams.get("edit");
    if (!editParam) {
      return null;
    }

    const values = editParam.split(";");
    if (values.length < 12) {
      return null;
    }

    const config: CrosshairConfig = {
      gap: Number.parseFloat(values[0]),
      width: Number.parseFloat(values[1]),
      height: Number.parseFloat(values[2]),
      pipOpacity: Number.parseFloat(values[3]),
      pipBorder: values[4] === "true",
      pipGapStatic: values[5] === "true",
      dotOpacity: Number.parseFloat(values[6]),
      dotOutlineOpacity: Number.parseFloat(values[7]),
      color: {
        r: Number.parseInt(values[8], 10),
        g: Number.parseInt(values[9], 10),
        b: Number.parseInt(values[10], 10),
      },
      hero: decodeURIComponent(values[11]) as HerosWithCrosshairOverrides,
    };

    return config;
  } catch {
    return null;
  }
};

export const encodeConfigToBase64 = (config: CrosshairConfig): string => {
  const json = JSON.stringify(config);
  return window.btoa(json);
};

export const decodeBase64ToConfig = (
  base64: string,
): CrosshairConfig | null => {
  try {
    const json = window.atob(base64);
    const config = JSON.parse(json) as CrosshairConfig;
    return config;
  } catch {
    return null;
  }
};
