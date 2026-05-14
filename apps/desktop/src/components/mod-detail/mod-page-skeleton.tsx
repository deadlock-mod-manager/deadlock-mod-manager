import {
  Card,
  CardContent,
  CardFooter,
} from "@deadlock-mods/ui/components/card";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";

export const ModPageSkeleton = () => {
  return (
    <div className='w-full overflow-y-auto overflow-x-hidden px-4'>
      <div className='container mx-auto max-w-6xl space-y-6 py-6'>
        <div className='mb-4 flex items-center justify-between'>
          <Skeleton className='h-8 w-32 rounded-md' />
        </div>

        <Card className='overflow-hidden space-y-4 shadow-none'>
          <div className='relative h-64 w-full overflow-hidden'>
            <Skeleton className='h-full w-full rounded-none' />
            <div className='absolute bottom-0 left-0 space-y-3 p-6'>
              <Skeleton className='h-9 w-72 bg-white/10' />
              <Skeleton className='h-5 w-40 bg-white/10' />
            </div>
          </div>

          <CardContent>
            <div className='space-y-5'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5'>
                    <Skeleton className='h-8 w-8 shrink-0 rounded-md' />
                    <div className='flex min-w-0 flex-col gap-1.5'>
                      <Skeleton className='h-3 w-14' />
                      <Skeleton className='h-4 w-24' />
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className='grid auto-cols-fr grid-flow-col gap-3'>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2'>
                    <Skeleton className='h-3.5 w-3.5 rounded-sm' />
                    <div className='flex flex-col gap-1'>
                      <Skeleton className='h-2.5 w-16' />
                      <Skeleton className='h-3 w-24' />
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className='flex flex-wrap items-center gap-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className='h-6 w-16 rounded-full' />
                ))}
              </div>
            </div>
          </CardContent>

          <CardFooter className='flex items-center justify-between gap-2 border-t border-border/40 bg-card px-6 py-3'>
            <Skeleton className='h-8 w-36' />
            <div className='flex items-center gap-2'>
              <Skeleton className='h-9 w-9 rounded-md' />
              <Skeleton className='h-9 w-28 rounded-md' />
            </div>
          </CardFooter>
        </Card>

        <div className='space-y-3 rounded-lg border border-border/50 p-6'>
          <Skeleton className='h-5 w-32' />
          <div className='space-y-2'>
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-4 w-5/6' />
            <Skeleton className='h-4 w-2/3' />
          </div>
        </div>

        <div className='grid grid-cols-2 gap-3 md:grid-cols-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='aspect-video w-full rounded-lg' />
          ))}
        </div>
      </div>
    </div>
  );
};
