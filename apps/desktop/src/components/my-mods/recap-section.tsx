import type { ReactNode } from "react";
import {
  type RecapAction,
  RecapRowAction,
} from "@/components/my-mods/recap-row-action";
import type { LocalMod } from "@/types/mods";

type RecapSectionProps = {
  icon: ReactNode;
  title: string;
  hint?: string;
  mods: { mod: LocalMod; detail?: string }[];
  action?: RecapAction;
};

export const RecapSection = ({
  icon,
  title,
  hint,
  mods,
  action,
}: RecapSectionProps) => {
  if (mods.length === 0) return null;

  return (
    <section className='space-y-2'>
      <div className='flex items-center gap-2'>
        {icon}
        <h3 className='text-sm font-medium'>
          {title} ({mods.length})
        </h3>
      </div>
      {hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
      <ul className='divide-y rounded-md border'>
        {mods.map(({ mod, detail }) => (
          <li
            key={mod.remoteId}
            className='flex items-center justify-between gap-3 px-3 py-2'>
            <div className='min-w-0'>
              <p className='truncate text-sm'>{mod.name}</p>
              {detail && (
                <p className='text-xs break-words text-destructive'>{detail}</p>
              )}
            </div>
            {action && <RecapRowAction mod={mod} action={action} />}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const asItems = (mods: LocalMod[]) => mods.map((mod) => ({ mod }));
