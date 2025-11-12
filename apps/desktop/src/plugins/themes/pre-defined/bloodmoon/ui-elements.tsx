import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { getPluginAssetUrl } from "@/lib/plugins";

const cornerDecorationStyle: CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  zIndex: 1,
  opacity: 0.7,
};

const cornerTopLeft = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/svg/corner_top_left.svg",
);
const cornerTopRight = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/svg/corner_top_right.svg",
);
const cornerBottomLeft = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/svg/corner_bottom_left.svg",
);
const cornerBottomRight = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/svg/corner_bottom_right.svg",
);

export const BloodmoonUI = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <>
      <div
        style={{
          ...cornerDecorationStyle,
          top: 0,
          left: 0,
          width: "200px",
          height: "200px",
        }}>
        <img
          src={cornerTopLeft}
          alt=''
          style={{
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 0 10px rgba(220, 38, 38, 0.6))",
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div
        style={{
          ...cornerDecorationStyle,
          top: 0,
          right: 0,
          width: "200px",
          height: "200px",
        }}>
        <img
          src={cornerTopRight}
          alt=''
          style={{
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 0 10px rgba(220, 38, 38, 0.6))",
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div
        style={{
          ...cornerDecorationStyle,
          bottom: 0,
          left: 0,
          width: "200px",
          height: "200px",
        }}>
        <img
          src={cornerBottomLeft}
          alt=''
          style={{
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 0 10px rgba(220, 38, 38, 0.6))",
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div
        style={{
          ...cornerDecorationStyle,
          bottom: 0,
          right: 0,
          width: "200px",
          height: "200px",
        }}>
        <img
          src={cornerBottomRight}
          alt=''
          style={{
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 0 10px rgba(220, 38, 38, 0.6))",
          }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    </>
  );
};
