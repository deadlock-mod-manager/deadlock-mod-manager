import { Card, CardHeader, CardTitle } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";

const ModCardSkeleton = () => {
  return (
    <Card className='shadow-none border h-full'>
      <Skeleton className='h-48 w-full rounded-t-xl' />
      <CardHeader className='px-3 py-4'>
        <div className='flex items-start justify-between'>
          <div className='flex w-full flex-col gap-3'>
            <div className='space-y-1'>
              <CardTitle>
                <Skeleton className='h-4 w-32' />
              </CardTitle>
              <Skeleton className='h-3.5 w-24' />
            </div>
            <div className='flex flex-row justify-between'>
              <div className='flex flex-col gap-1.5'>
                <Skeleton className='h-3 w-24' />
                <Skeleton className='h-3 w-20' />
              </div>
              <Skeleton className='h-8 w-8 rounded-md' />
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export default ModCardSkeleton;
