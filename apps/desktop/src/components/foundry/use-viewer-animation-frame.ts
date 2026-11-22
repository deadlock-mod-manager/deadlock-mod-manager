import { useEffect, useRef } from "react";

export const useAnimationFrame = (callback: () => void) => {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      latest.current();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, []);
};
