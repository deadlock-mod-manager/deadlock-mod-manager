const Bar = ({ className }: { className?: string }) => (
  <div
    className={`dl-notch-sm relative overflow-hidden bg-muted ${className ?? ""}`}>
    <div className='animate-dl-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent' />
  </div>
);

export const RollSkeleton = () => (
  <div className='container mx-auto px-4 py-10'>
    {/* The skeleton is what crawlers and the server render see, so it carries the page heading. */}
    <h1 className='sr-only'>Deadlock Randomizer: random hero and item build</h1>
    <Bar className='h-14 w-full max-w-2xl' />
    <Bar className='mt-3 h-7 w-64' />
    <div className='mt-10 grid gap-6 lg:grid-cols-12'>
      <Bar className='aspect-[3/4] lg:col-span-3' />
      <div className='space-y-4 lg:col-span-4'>
        <Bar className='h-10 w-40' />
        <Bar className='h-24 w-full' />
        <Bar className='h-20 w-full' />
      </div>
      <Bar className='h-72 lg:col-span-5' />
    </div>
    <div className='mt-16 grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {Array.from({ length: 12 }, (_, index) => (
        <Bar className='h-28' key={index} />
      ))}
    </div>
  </div>
);
