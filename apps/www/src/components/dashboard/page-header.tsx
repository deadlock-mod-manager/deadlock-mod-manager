type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className='flex flex-col gap-2'>
      <h1 className='text-2xl font-bold'>{title}</h1>
      <p className='text-muted-foreground'>{description}</p>
    </div>
  );
}
