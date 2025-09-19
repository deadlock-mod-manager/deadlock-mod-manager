import { FolderOpen } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePersistedStore } from "@/lib/store";
import { formatSize, formatSpeed } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

type DownloadCardProps = {
  download: LocalMod;
};

const DownloadCard = ({ download }: DownloadCardProps) => {
  const { getModProgress } = usePersistedStore();
  const modProgress = getModProgress(download.remoteId);
  const percentage = modProgress?.percentage ?? 0;
  const speed = modProgress?.speed ?? 0;
  const totalSize = useMemo(() => {
    return download.downloads?.reduce((acc, curr) => acc + curr.size, 0) ?? 0;
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
        <div className='flex items-center gap-2'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() =>
                  invoke("show_in_folder", { path: download.path })
                }
                size={"icon"}
                variant='outline'>
                <FolderOpen className='h-4 w-4' />
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
