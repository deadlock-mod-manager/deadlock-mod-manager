import { ChevronDown, Package } from "@deadlock-mods/ui/icons";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { usePersistedStore } from "@/lib/store";

interface CompatibilityModRowProps {
  modId: string;
  name: string;
  labels: readonly string[];
  children: ReactNode;
}

export function CompatibilityModRow({
  modId,
  name,
  labels,
  children,
}: CompatibilityModRowProps) {
  const { t } = useTranslation();
  const mod = usePersistedStore((state) =>
    state.localMods.find((item) => item.remoteId === modId),
  );
  const { shouldBlur } = useNSFWBlur(mod);
  const [imageFailed, setImageFailed] = useState(false);
  const cover =
    mod && !shouldBlur && !imageFailed ? getModCoverImage(mod) : undefined;
  return (
    <details className='group/mod-row rounded-lg open:bg-muted/25'>
      <summary className='flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden'>
        <span
          aria-hidden
          className='relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border/60'>
          {cover ? (
            <img
              src={cover}
              alt=''
              width={48}
              height={48}
              loading='lazy'
              decoding='async'
              className='size-full object-cover'
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Package className='size-5 text-muted-foreground' />
          )}
        </span>
        <span className='min-w-0 flex-1'>
          <span
            className='block truncate font-medium text-sm text-foreground'
            title={name}>
            {name}
          </span>
          <span className='mt-1.5 flex flex-wrap gap-x-2 gap-y-1'>
            {labels.map((label) => (
              <span
                key={label}
                className='rounded bg-muted/60 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground'>
                {label}
              </span>
            ))}
          </span>
        </span>
        <span className='sr-only'>{t("myMods.compatibility.details")}</span>
        <ChevronDown
          aria-hidden
          className='size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-open/mod-row:rotate-180 group-open/mod-row:text-primary'
        />
      </summary>
      <div className='space-y-4 px-3 pb-4 pt-1 text-xs sm:pl-[4.5rem] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150'>
        {children}
      </div>
    </details>
  );
}
