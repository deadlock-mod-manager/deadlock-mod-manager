import { Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModAudioPreviewProps {
  audioUrl: string;
  isAudio?: boolean;
}

export const ModAudioPreview = ({
  audioUrl,
  isAudio = false,
}: ModAudioPreviewProps) => {
  if (!isAudio) {
    return null;
  }

  if (!audioUrl) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Volume2 className='h-5 w-5' />
          Audio Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='flex flex-col items-center space-y-6 p-8'>
          <audio
            className='w-full'
            controls
            preload='metadata'
            src={audioUrl}
          />
        </div>
      </CardContent>
    </Card>
  );
};
