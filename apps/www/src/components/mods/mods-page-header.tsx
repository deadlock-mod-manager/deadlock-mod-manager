interface ModsPageHeaderProps {
  title: string;
  description: string;
}

export function ModsPageHeader({ title, description }: ModsPageHeaderProps) {
  return (
    <div className='mb-16'>
      <h1 className='mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text font-bold text-5xl text-transparent tracking-tight sm:text-6xl md:text-7xl'>
        {title}
      </h1>
      <p className='max-w-2xl text-lg text-white/70 sm:text-xl'>
        {description}
      </p>
    </div>
  );
}
