import { useEffect } from "react";

export default function RemlockTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("remlock-theme-active");
    return () => root.classList.remove("remlock-theme-active");
  }, []);

  return null;
}
