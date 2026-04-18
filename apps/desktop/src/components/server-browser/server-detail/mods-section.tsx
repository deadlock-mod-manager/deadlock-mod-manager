import type {
  ServerBrowserEntry,
  ServerRequiredMod,
} from "@deadlock-mods/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";

/** Heartbeat `mods[]` uses `name`; relay-style entries use `id` + `url`. */
type ServerDetailModListItem =
  | ServerBrowserEntry["mods"][number]
  | ServerRequiredMod;

const modListLabel = (m: ServerDetailModListItem): string =>
  "name" in m ? m.name : m.id;

const modListUrl = (m: ServerDetailModListItem): string | undefined =>
  "url" in m ? m.url : undefined;

interface ServerDetailModsSectionProps {
  title: string;
  items: ServerDetailModListItem[];
  emptyText?: string;
}

const ServerDetailModsSection = ({
  title,
  items,
  emptyText,
}: ServerDetailModsSectionProps) => {
  return (
    <section className='space-y-2'>
      <h3 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        emptyText ? (
          <p className='text-xs text-muted-foreground'>{emptyText}</p>
        ) : null
      ) : (
        <ul className='space-y-1 text-xs' role='list'>
          {items.map((m, idx) => {
            const label = modListLabel(m);
            const url = modListUrl(m);
            return (
              <li
                key={`${label}-${idx}`}
                className='flex items-center justify-between gap-2 rounded-sm bg-card px-2 py-1 font-mono'>
                <span className='flex min-w-0 items-center gap-1.5 truncate'>
                  <span className='truncate'>{label}</span>
                  {url && (
                    <a
                      aria-label={`Open ${label}`}
                      className='shrink-0 text-muted-foreground hover:text-foreground'
                      href={url}
                      rel='noreferrer noopener'
                      target='_blank'>
                      <ArrowSquareOutIcon className='size-3' weight='bold' />
                    </a>
                  )}
                </span>
                {m.version ? (
                  <span className='shrink-0 text-[10px] text-muted-foreground'>
                    {m.version}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ServerDetailModsSection;
