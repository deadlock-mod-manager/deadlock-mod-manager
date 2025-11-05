import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

const cornerDecorationStyle: CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  zIndex: 1,
  opacity: 0.7,
};

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
          src='/src/plugins/themes/public/pre-defiend/bloodmoon/svg/corner_top_left.svg'
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
          src='/src/plugins/themes/public/pre-defiend/bloodmoon/svg/corner_top_right.svg'
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
          src='/src/plugins/themes/public/pre-defiend/bloodmoon/svg/corner_bottom_left.svg'
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
          src='/src/plugins/themes/public/pre-defiend/bloodmoon/svg/corner_bottom_right.svg'
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
