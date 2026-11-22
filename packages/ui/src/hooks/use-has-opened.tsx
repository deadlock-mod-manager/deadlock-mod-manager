import { useState } from "react";

export const useHasOpened = (open: boolean) => {
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) {
    setHasOpened(true);
  }
  return hasOpened;
};
