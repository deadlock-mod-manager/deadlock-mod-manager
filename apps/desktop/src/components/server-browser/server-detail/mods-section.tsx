interface ModEntry {
  name: string;
  version?: string;
}

interface ServerDetailModsSectionProps {
  title: string;
  items: ModEntry[];
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
          {items.map((m, idx) => (
            <li
              key={`${m.name}-${idx}`}
              className='flex items-center justify-between gap-2 rounded-sm bg-card px-2 py-1 font-mono'>
              <span className='truncate'>{m.name}</span>
              {m.version && (
                <span className='shrink-0 text-[10px] text-muted-foreground'>
                  {m.version}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ServerDetailModsSection;
