import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ModCardSkeleton = () => {
  return (
    <Card className="cursor-pointer shadow">
      <Skeleton className="h-48 w-full rounded-t-xl bg-muted" />
      <CardHeader className="px-3 py-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <CardTitle>
                <Skeleton className="h-4 w-32" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-32" />
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex flex-col">
            <Button disabled size="icon" variant="outline">
              <DownloadIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export default ModCardSkeleton;
