import { useTranslation } from "react-i18next";
import type { ParticleSystemInUse } from "@/components/foundry/particles/systems-in-use";

interface Props {
  systems: readonly ParticleSystemInUse[];
  pending?: boolean;
  onOpen?: (path: string) => void;
}

export function ModelParticleList({ systems, pending, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <section className='shrink-0 border-b'>
      <h3 className='px-3 pt-3 text-xs font-medium'>
        {t("modelEditor.particlesInUse")}
        <span className='ml-2 font-normal text-muted-foreground'>
          {systems.length}
        </span>
      </h3>
      <p className='px-3 py-2 text-[10px] text-muted-foreground'>
        {t("modelEditor.particleUsageHint")}
      </p>
      {pending ? (
        <p className='px-3 pb-3 text-xs text-muted-foreground'>
          {t("modelEditor.particlesLoading")}
        </p>
      ) : systems.length ? (
        <ul
          className='max-h-44 overflow-y-auto p-1'
          aria-label={t("modelEditor.particlesInUse")}>
          {systems.map((system) => (
            <li
              key={system.path}
              className='flex items-center gap-2 rounded px-2 hover:bg-muted/50'>
              <button
                type='button'
                className='min-w-0 flex-1 truncate py-2 text-left text-xs disabled:cursor-default'
                disabled={!onOpen || system.missing}
                title={system.path}
                onClick={() => onOpen?.(system.path)}>
                {system.path.split("/").at(-1)}
              </button>
              <span className='shrink-0 text-[10px] text-muted-foreground'>
                {t(
                  system.missing
                    ? "modelEditor.particleMissing"
                    : system.limited
                      ? "modelEditor.particleLimited"
                      : system.active
                        ? "modelEditor.particleActive"
                        : "modelEditor.particleReferenced",
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='px-3 pb-3 text-xs text-muted-foreground'>
          {t("modelEditor.particlesEmpty")}
        </p>
      )}
    </section>
  );
}
