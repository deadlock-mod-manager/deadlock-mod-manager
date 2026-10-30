import { useEffect, useState } from "react";

/** The current time in milliseconds, ticking once a second while mounted. */
export const useNow = () => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};
