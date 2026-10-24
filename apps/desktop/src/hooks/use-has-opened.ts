import { useState } from "react";

/**
 * Stays true once `open` has been true. Lets list items skip mounting a dialog
 * until it is first used, while keeping it mounted afterwards so its close
 * animation and internal state still work.
 */
export const useHasOpened = (open: boolean) => {
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) {
    setHasOpened(true);
  }
  return hasOpened;
};
