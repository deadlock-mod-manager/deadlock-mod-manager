import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Check, Copy, Gamepad2 } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface MapHowToPlayProps {
  mapName?: string;
}

const CopyableCommand = ({ command }: { command: string }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success(t("modDetail.mapHowToPlay.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className='inline-flex items-center gap-1.5 rounded bg-muted px-2.5 py-1 font-mono text-sm'>
      <span>{command}</span>
      <button
        className='inline-flex shrink-0 cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground'
        onClick={handleCopy}
        type='button'>
        {copied ? (
          <Check className='h-3.5 w-3.5 text-green-500' />
        ) : (
          <Copy className='h-3.5 w-3.5' />
        )}
      </button>
    </span>
  );
};

export const MapHowToPlay = ({ mapName }: MapHowToPlayProps) => {
  const { t } = useTranslation();

  const displayName = mapName ?? "MAP_NAME";
  const mapCommand = `map ${displayName}`;

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Gamepad2 className='h-5 w-5' />
          {t("modDetail.mapHowToPlay.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className='list-decimal space-y-3 pl-5 text-sm'>
          <li>{t("modDetail.mapHowToPlay.step1")}</li>
          <li>{t("modDetail.mapHowToPlay.step2")}</li>
          <li>
            <div className='flex flex-col gap-1.5'>
              <span>{t("modDetail.mapHowToPlay.step3Command")}</span>
              <CopyableCommand command={mapCommand} />
              {!mapName && (
                <span className='text-xs text-muted-foreground'>
                  {t("modDetail.mapHowToPlay.mapNameFallback")}
                </span>
              )}
            </div>
          </li>
          <li>
            {t("modDetail.mapHowToPlay.step4Glitch", {
              mapCommand,
            })}
          </li>
          <li>{t("modDetail.mapHowToPlay.step5Status")}</li>
          <li>{t("modDetail.mapHowToPlay.step6Share")}</li>
        </ol>
      </CardContent>
    </Card>
  );
};
