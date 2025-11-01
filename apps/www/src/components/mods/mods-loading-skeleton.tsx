export function ModsLoadingSkeleton() {
  return (
    <div className='container mx-auto px-4 py-12'>
      <div className='mb-16'>
        <h1 className='mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text font-bold text-5xl text-transparent tracking-tight sm:text-6xl md:text-7xl'>
          Browse Mods
        </h1>
        <p className='max-w-2xl text-lg text-white/70 sm:text-xl'>
          Discover and download mods for Deadlock
        </p>
      </div>
      <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {Array.from({ length: 12 }).map(() => (
          <div
            key={crypto.randomUUID()}
            className='aspect-[4/5] animate-pulse rounded-lg bg-muted'
          />
        ))}
      </div>
    </div>
  );
}
