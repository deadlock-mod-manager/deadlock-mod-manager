import { Loader2 } from "@deadlock-mods/ui/icons";

export const LoadingState = () => (
  <div className='container mx-auto max-w-4xl py-12'>
    <div className='text-center'>
      <Loader2 className='mx-auto mb-4 h-12 w-12 animate-spin' />
      <h1 className='mb-4 font-bold text-3xl'>Loading downloads</h1>
      <p className='text-muted-foreground'>Fetching the latest release…</p>
    </div>
  </div>
);
