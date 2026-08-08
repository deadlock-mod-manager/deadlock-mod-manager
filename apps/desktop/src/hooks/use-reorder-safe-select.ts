import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useRef } from "react";

/**
 * Click handling for lists whose rows move while the pointer is inside them.
 *
 * The live scoreboard re-sorts by souls every second, so a row can slide out
 * from under the cursor between the press and the release. The browser then
 * fires `click` on the nearest common ancestor of the two - the list, not
 * either row - and the press is silently dropped. That is why rows in a running
 * match only sometimes opened a player card.
 *
 * Remembering which row was pressed and committing it when the list sees the
 * click fixes that without giving up the ordinary semantics: releasing outside
 * the list still cancels, and the press lands on the row that was aimed at
 * rather than on whatever drifted into its place.
 *
 * `containerProps` goes on the element that encloses one reordering group;
 * `itemProps(item)` on each row inside it.
 */
export const useReorderSafeSelect = <T>(onSelect: (item: T) => void) => {
  const pressed = useRef<T | null>(null);

  const containerProps = {
    onClick: () => {
      const item = pressed.current;
      pressed.current = null;
      if (item !== null) {
        onSelect(item);
      }
    },
  };

  const itemProps = useCallback(
    (item: T) => ({
      onPointerDown: (event: PointerEvent) => {
        if (event.button === 0) {
          pressed.current = item;
        }
      },
      // Keyboard activation never goes through a pointer, so it commits here
      // and clears the slot the container handler would otherwise read.
      onClick: (event: MouseEvent) => {
        if (event.detail === 0) {
          pressed.current = null;
          onSelect(item);
        }
      },
    }),
    [onSelect],
  );

  return { containerProps, itemProps };
};
