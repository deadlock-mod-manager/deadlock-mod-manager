import { useEffect, useState } from "react";

const isWindowFocused = (): boolean =>
  document.visibilityState === "visible" && document.hasFocus();

export const useWindowFocused = (): boolean => {
  const [focused, setFocused] = useState<boolean>(isWindowFocused);

  useEffect(() => {
    const update = () => setFocused(isWindowFocused());

    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return focused;
};
