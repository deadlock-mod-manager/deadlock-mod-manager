import { formatSize, formatSpeed } from '@/lib/utils';
import { LocalMod } from '@/types/mods';
import { FolderOpen } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface DownloadCardProps {
  download: LocalMod;
}

const DownloadCard = ({ download }: DownloadCardProps) => {
  const progress = download.progress ?? 0;
  const speed = download.speed ?? 0;
  const totalSize = useMemo(() => {
    return download.downloads?.reduce((acc, curr) => acc + curr.size, 0) ?? 0;
  }, [download.downloads]);

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">{download.name}</h3>
        <span className="text-sm text-muted-foreground">{formatSize(totalSize)}</span>
      </div>
      <Progress value={download.progress} className="mb-2" />
      <div className="flex justify-between items-center text-sm">
        <span>{progress.toFixed(1)}%</span>
        <span>{formatSpeed(speed)}</span>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size={'icon'} onClick={() => invoke('show_in_folder', { path: download.path })}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open folder</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
};

export default DownloadCard;
