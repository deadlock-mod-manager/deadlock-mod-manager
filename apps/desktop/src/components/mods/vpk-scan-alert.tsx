import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalyzeAddonsButton } from "../my-mods/analyze-addons-button";

interface VpkScanAlertProps {
  unmatchedVpkCount: number;
  unmatchedVpks: string[];
  isLoading?: boolean;
  refetch: () => void;
}

export const VpkScanAlert = ({
  unmatchedVpkCount,
  unmatchedVpks,
  refetch,
}: VpkScanAlertProps) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [isListVisible, setIsListVisible] = useState(false);

  if (dismissed || unmatchedVpkCount === 0) {
    return null;
  }

  const toggleList = () => {
    setIsListVisible(!isListVisible);
  };

  return (
    <Alert variant='warning' className='my-4 items-start'>
      <PhosphorIcons.Warning
        weight='duotone'
        className='h-5 w-5 shrink-0 text-foreground'
      />
      <div className='flex flex-1 flex-col gap-4'>
        <div className='flex-1 flex-col justify-center gap-1'>
          <AlertTitle className='font-bold'>
            {t("mods.vpkScanAlert.title")}
          </AlertTitle>
          <AlertDescription>
            {t("mods.vpkScanAlert.description", { count: unmatchedVpkCount })}
          </AlertDescription>
          {unmatchedVpks.length > 0 && (
            <>
              <Button
                onClick={toggleList}
                size='no-padding'
                variant='transparent'
                className='mt-2 w-fit text-xs'>
                {isListVisible ? (
                  <>
                    <PhosphorIcons.CaretUp className='h-3 w-3' />
                    {t("mods.vpkScanAlert.hideList")}
                  </>
                ) : (
                  <>
                    <PhosphorIcons.CaretDown className='h-3 w-3' />
                    {t("mods.vpkScanAlert.showList")}
                  </>
                )}
              </Button>
              {isListVisible && (
                <div className='mt-2 text-sm'>
                  <ul className='list-inside list-disc space-y-1'>
                    {unmatchedVpks.map((vpk) => (
                      <li key={vpk} className='font-mono text-xs'>
                        {vpk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-2'>
        <AnalyzeAddonsButton />
        <Button
          onClick={refetch}
          size='sm'
          variant='ghost'
          icon={<PhosphorIcons.ArrowClockwiseIcon className='h-4 w-4' />}>
          {t("mods.vpkScanAlert.refresh")}
        </Button>
      </div>
      <Button onClick={() => setDismissed(true)} size='sm' variant='ghost'>
        <PhosphorIcons.X className='h-4 w-4' />
      </Button>
    </Alert>
  );
};
