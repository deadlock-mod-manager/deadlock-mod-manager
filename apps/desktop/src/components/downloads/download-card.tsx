import { Card } from "@deadlock-mods/ui/components/card";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { useMemo } from "react";
import { usePersistedStore } from "@/lib/store";
import { formatSize, formatSpeed } from "@/lib/utils";
import { ModStatus, type LocalMod } from "@/types/mods";

type DownloadCardProps = {
  download: LocalMod;
};

const DownloadCard = ({ download }: DownloadCardProps) => {
  const { getModProgress } = usePersistedStore();
  const modProgress = getModProgress(download.remoteId);
  const isDownloading = download.status === ModStatus.Downloading;
  const percentage = isDownloading ? (modProgress?.percentage ?? 0) : 100;
  const speed = isDownloading ? (modProgress?.speed ?? 0) : 0;
  const totalSize = useMemo(() => {
    if (!download.downloads || download.downloads.length === 0) {
      return 0;
    }
    return download.downloads.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [download.downloads]);

  return (
    <Card className='p-4'>
      <div className='mb-2 flex items-center justify-between'>
        <h3 className='font-semibold text-lg'>{download.name}</h3>
        <span className='text-muted-foreground text-sm'>
          {formatSize(totalSize)}
        </span>
      </div>
      <Progress className='mb-2' value={percentage} />
      <div className='flex items-center justify-between text-sm'>
        <span>{percentage.toFixed(1)}%</span>
        <span>{formatSpeed(speed)}</span>
      </div>
    </Card>
  );
};

export default DownloadCard;
