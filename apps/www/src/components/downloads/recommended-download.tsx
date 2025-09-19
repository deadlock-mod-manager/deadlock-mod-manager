import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize, getPlatformIcon } from "@/lib/os-detection";
import type { OSInfo, PlatformDownload } from "@/types/releases";

interface RecommendedDownloadProps {
  userOS: OSInfo;
  download: PlatformDownload;
}

export const RecommendedDownload = ({
  userOS,
  download,
}: RecommendedDownloadProps) => (
  <div className='mb-6'>
    <h3 className='mb-3 flex items-center gap-2 font-semibold'>
      <span className='text-lg'>{getPlatformIcon(userOS.os)}</span>
      Best match for {userOS.displayName}
    </h3>
    <Button asChild className='w-full sm:w-auto' size='lg'>
      <a download href={download.url}>
        <Download className='mr-2 h-5 w-5' />
        Download {download.filename}
        <span className='ml-2 text-sm opacity-80'>
          ({formatFileSize(download.size)})
        </span>
      </a>
    </Button>
  </div>
);
