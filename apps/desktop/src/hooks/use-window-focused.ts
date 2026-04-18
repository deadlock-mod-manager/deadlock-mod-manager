import { useEffect, useState } from "react";

const getInitialFocused = (): boolean => {
  if (typeof document === "undefined") return true;
  const visible = document.visibilityState === "visible";
  const focused =
    typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return visible && focused;
};

export const useWindowFocused = (): boolean => {
  const [focused, setFocused] = useState<boolean>(getInitialFocused);

  useEffect(() => {
    const update = () => setFocused(getInitialFocused());

    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);

    update();

    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return focused;
};
