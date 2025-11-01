import type { ModDto } from "@deadlock-mods/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { BrowseModCard } from "./browse-mod-card";

interface ModsGridProps {
  mods: ModDto[];
}

export function ModsGrid({ mods }: ModsGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { setScrollElement, scrollY, restoreScrollPosition } =
    useScrollPosition("/mods");

  console.log("[ModsGrid] Render", {
    modsCount: mods.length,
    scrollY,
    hasParentRef: !!parentRef.current,
  });

  const COLUMNS = 4;

  const modRows = useMemo(() => {
    const rows: ModDto[][] = [];
    for (let i = 0; i < mods.length; i += COLUMNS) {
      rows.push(mods.slice(i, i + COLUMNS));
    }
    console.log("[ModsGrid] modRows computed", { rowsCount: rows.length });
    return rows;
  }, [mods]);

  const rowVirtualizer = useVirtualizer({
    count: modRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400,
    overscan: 2,
    initialOffset: scrollY,
  });

  console.log("[ModsGrid] Virtualizer state", {
    totalSize: rowVirtualizer.getTotalSize(),
    virtualItemsCount: rowVirtualizer.getVirtualItems().length,
    scrollOffset: rowVirtualizer.scrollOffset,
  });

  useEffect(() => {
    console.log("[ModsGrid] setScrollElement effect", {
      hasParentRef: !!parentRef.current,
      scrollY,
    });

    if (parentRef.current) {
      setScrollElement(parentRef.current);

      if (scrollY > 0) {
        console.log("[ModsGrid] Scheduling scroll restoration", { scrollY });
        requestAnimationFrame(() => {
          restoreScrollPosition();
        });
      }
    }
  }, [setScrollElement, scrollY, restoreScrollPosition]);

  return (
    <div ref={parentRef} className='h-[calc(100vh-400px)] overflow-y-auto'>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowMods = modRows[virtualRow.index];
          if (!rowMods) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}>
              <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {rowMods.map((mod) => (
                  <BrowseModCard key={mod.id} mod={mod} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
