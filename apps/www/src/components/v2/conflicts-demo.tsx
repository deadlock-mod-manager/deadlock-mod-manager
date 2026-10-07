import { cn } from "@deadlock-mods/ui/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Two real GameBanana skins for the same hero, as they'd clash in game. */
const MODS = [
  { id: "691863", name: "Yamato remodel" },
  { id: "599927", name: "Yamato redesign (NEW ICONS and COLORS!)" },
];

const ROW_HEIGHT = 60;

/**
 * A Conflicts group from My Mods that actually works: "Load first" swaps
 * which skin the game uses, the way it does in the app.
 */
export const ConflictsDemo = () => {
  const { t } = useTranslation("v2");
  const [order, setOrder] = useState(MODS.map((mod) => mod.id));
  const [announcement, setAnnouncement] = useState("");

  const loadFirst = (id: string, name: string) => {
    setOrder((current) => [id, ...current.filter((entry) => entry !== id)]);
    setAnnouncement(t("demo.conflicts.loadedFirst", { mod: name }));
  };

  return (
    <div className='rounded-xl border border-border-strong bg-surface p-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <p className='px-1 font-semibold text-sm'>{t("demo.conflicts.title")}</p>
      <ul
        className='relative mt-2'
        style={{ height: ROW_HEIGHT * MODS.length }}>
        {MODS.map((mod) => {
          const position = order.indexOf(mod.id);
          const used = position === 0;
          return (
            <li
              key={mod.id}
              className='absolute inset-x-0 flex items-center gap-3 border-border border-t px-1 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] first:border-t-0 motion-reduce:transition-none'
              style={{
                height: ROW_HEIGHT,
                transform: `translateY(${position * ROW_HEIGHT}px)`,
              }}>
              <img
                src={`/home/mods/${mod.id}.webp`}
                alt=''
                width={40}
                height={40}
                loading='lazy'
                className={cn(
                  "size-10 shrink-0 rounded-md object-cover transition-[filter,opacity] duration-500",
                  !used && "opacity-50 grayscale",
                )}
              />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-foreground text-sm'>
                  {mod.name}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    used ? "text-primary" : "text-muted-foreground",
                  )}>
                  {used
                    ? t("demo.conflicts.used")
                    : t("demo.conflicts.skipped")}
                </span>
              </span>
              {!used && (
                <button
                  type='button'
                  onClick={() => loadFirst(mod.id, mod.name)}
                  className='h-8 shrink-0 rounded-md border border-border-hover px-3 font-medium text-xs hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                  {t("demo.conflicts.loadFirst")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className='mt-3 px-1 text-muted-foreground text-xs'>
        <span aria-hidden='true'>{t("demo.conflicts.hint")}</span>
        <span role='status' className='sr-only'>
          {announcement}
        </span>
      </p>
    </div>
  );
};
