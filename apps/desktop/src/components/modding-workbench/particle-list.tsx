import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type MouseEvent } from "react";

export interface ParticleListItem {
  id: string;
  label: string;
  detail: string;
  hex?: string;
  dirty?: boolean;
}
export function ParticleList({
  items,
  active,
  onSelect,
  label,
  disabled = false,
  selection,
}: {
  items: ParticleListItem[];
  active: string;
  onSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  disabled?: boolean;
  selection?: Set<string>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 60,
    overscan: 5,
  });
  return (
    <div
      ref={scroll}
      className='min-h-0 flex-1 overflow-auto'
      role='group'
      aria-label={label}>
      <div style={{ height: rows.getTotalSize(), position: "relative" }}>
        {rows.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (!item) return null;
          return (
            <button
              key={item.id}
              type='button'
              disabled={disabled}
              aria-pressed={
                selection ? selection.has(item.id) : active === item.id
              }
              title={item.id}
              onClick={(event) => onSelect(item.id, event)}
              className={`absolute left-0 top-0 flex w-full select-none items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50 ${selection ? (selection.has(item.id) ? "bg-primary/5" : "") : active === item.id ? "bg-primary/10" : ""} ${active === item.id ? "ring-1 ring-inset ring-primary/40" : ""}`}
              style={{
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}>
              {item.hex ? (
                <span
                  className='size-7 shrink-0 rounded border'
                  style={{ backgroundColor: item.hex }}
                />
              ) : null}
              <span className='min-w-0 flex-1'>
                <span className='block truncate font-medium'>
                  {item.dirty ? "● " : ""}
                  {item.label}
                </span>
                <span className='block truncate text-[10px] text-muted-foreground'>
                  {item.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
