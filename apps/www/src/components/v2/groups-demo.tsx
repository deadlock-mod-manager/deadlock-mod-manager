import { cn } from "@deadlock-mods/ui/lib/utils";
import { ChevronRight, Power } from "@deadlock-mods/ui/icons";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

type DemoMod = { id: string; name: string };

/** Real GameBanana mods, sorted into groups the way a player might. */
const GROUPS: { id: "mains" | "testing"; mods: DemoMod[] }[] = [
  {
    id: "mains",
    mods: [
      { id: "691863", name: "Yamato remodel" },
      { id: "661996", name: "Formal Wraith" },
      { id: "628313", name: "Toon Ivy (SOUL ORB FIX)" },
    ],
  },
  {
    id: "testing",
    mods: [
      { id: "656006", name: "Holliday Remodel" },
      { id: "636266", name: "Jacket (Billy Overhaul)" },
    ],
  },
];

/**
 * Two groups from My Mods: the header expands a group, and the power button
 * turns all of its mods on or off at once, the way it does in the app.
 */
export const GroupsDemo = () => {
  const { t } = useTranslation("v2");
  const baseId = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    mains: true,
  });
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(["691863", "661996"]),
  );
  const [announcement, setAnnouncement] = useState("");

  const toggleGroup = (name: string, mods: DemoMod[]) => {
    const enable = mods.some((mod) => !enabled.has(mod.id));
    setEnabled((current) => {
      const next = new Set(current);
      for (const mod of mods) {
        if (enable) next.add(mod.id);
        else next.delete(mod.id);
      }
      return next;
    });
    setAnnouncement(
      t(enable ? "demo.groups.enabledAll" : "demo.groups.disabledAll", {
        name,
      }),
    );
  };

  return (
    <div className='rounded-xl border border-border-strong bg-surface p-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <div className='space-y-3'>
        {GROUPS.map(({ id, mods }) => {
          const name = t(`demo.groups.names.${id}`);
          const isOpen = expanded[id] ?? false;
          const enabledCount = mods.filter((mod) => enabled.has(mod.id)).length;
          const canEnable = enabledCount < mods.length;
          const contentId = `${baseId}-${id}`;
          return (
            <div key={id}>
              <div className='flex items-center gap-2 border-border border-b pb-2'>
                <button
                  type='button'
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  onClick={() =>
                    setExpanded((current) => ({ ...current, [id]: !isOpen }))
                  }
                  className='flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
                  <ChevronRight
                    aria-hidden='true'
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span aria-hidden='true' className='flex shrink-0 -space-x-2'>
                    {mods.map((mod) => (
                      <img
                        key={mod.id}
                        src={`/home/mods/${mod.id}.webp`}
                        alt=''
                        width={24}
                        height={24}
                        loading='lazy'
                        className={cn(
                          "size-6 rounded-sm object-cover ring-2 ring-surface transition-[filter,opacity] duration-300 motion-reduce:transition-none",
                          !enabled.has(mod.id) && "opacity-70 grayscale",
                        )}
                      />
                    ))}
                  </span>
                  <span className='truncate font-medium'>{name}</span>
                  <span className='shrink-0 text-muted-foreground text-xs'>
                    {t("demo.groups.count", { count: mods.length })}
                  </span>
                </button>
                <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>
                  {t("demo.groups.enabledCount", {
                    count: enabledCount,
                    total: mods.length,
                  })}
                </span>
                <button
                  type='button'
                  aria-label={t(
                    canEnable ? "demo.groups.enable" : "demo.groups.disable",
                    { name },
                  )}
                  onClick={() => toggleGroup(name, mods)}
                  className='flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                  <Power
                    aria-hidden='true'
                    className={cn(
                      "size-4 transition-colors duration-200",
                      !canEnable && "text-primary",
                    )}
                  />
                </button>
              </div>
              <ul id={contentId} hidden={!isOpen}>
                {mods.map((mod) => {
                  const on = enabled.has(mod.id);
                  return (
                    <li
                      key={mod.id}
                      className='flex items-center gap-3 border-border border-b px-1 py-2 last:border-b-0'>
                      <img
                        src={`/home/mods/${mod.id}.webp`}
                        alt=''
                        width={32}
                        height={32}
                        loading='lazy'
                        className={cn(
                          "size-8 shrink-0 rounded-md object-cover transition-[filter,opacity] duration-300 motion-reduce:transition-none",
                          !on && "opacity-50 grayscale",
                        )}
                      />
                      <span className='min-w-0 flex-1 truncate text-sm'>
                        {mod.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          on ? "text-primary" : "text-muted-foreground",
                        )}>
                        {on ? t("demo.groups.on") : t("demo.groups.off")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className='mt-3 px-1 text-muted-foreground text-xs'>
        <span aria-hidden='true'>{t("demo.groups.hint")}</span>
        <span role='status' className='sr-only'>
          {announcement}
        </span>
      </p>
    </div>
  );
};
