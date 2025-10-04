import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { identifyMod } from "@/lib/api";
import type { LocalAddonInfo } from "@/types/mods";

interface AddonCardProps {
  addon: LocalAddonInfo;
}

export const AddonCard = ({ addon }: AddonCardProps) => {
  const { t } = useTranslation();
  const [identifying, setIdentifying] = useState(false);
  const [identificationResult, setIdentificationResult] = useState<{
    remoteId?: string;
    modName?: string;
    modAuthor?: string;
    confidence?: number;
  } | null>(null);

  if (!addon.vpkParsed || !addon.vpkParsed.fingerprint) {
    return (
      <Card className='mb-4'>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center justify-between'>
            <span className='truncate'>{addon.fileName}</span>
            <Badge variant='destructive' className='ml-2 shrink-0'>
              Error
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='pt-0'>
          <p className='text-sm text-destructive'>
            Failed to parse VPK file. The file may be corrupted or invalid.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleIdentify = async () => {
    setIdentifying(true);
    try {
      const result = await identifyMod({
        vpkHash: addon.vpkParsed.fingerprint.sha256,
        contentSignature: addon.vpkParsed.fingerprint.contentSignature,
        merkleRoot: addon.vpkParsed.fingerprint.merkleRoot || undefined,
        fileCount: addon.vpkParsed.fingerprint.fileCount,
        fileName: addon.fileName,
      });
      setIdentificationResult(result);

      if (result.remoteId) {
        toast.success(
          t("addons.identificationSuccess", { name: result.modName }),
        );
      } else {
        toast.info(t("addons.identificationFailed"));
      }
    } catch (error) {
      console.error("Failed to identify mod:", error);
      toast.error(t("addons.identificationError"));
    } finally {
      setIdentifying(false);
    }
  };

  return (
    <Card className='mb-4'>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base flex items-center justify-between'>
          <span className='truncate'>{addon.fileName}</span>
          <Badge variant='outline' className='ml-2 shrink-0'>
            v{addon.vpkParsed.version}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='space-y-2 text-sm text-muted-foreground'>
          <div className='flex justify-between'>
            <span>{t("addons.fileCount")}:</span>
            <span>{addon.vpkParsed.fingerprint.fileCount}</span>
          </div>
          <div className='flex justify-between'>
            <span>{t("addons.fileSize")}:</span>
            <span>
              {(addon.vpkParsed.fingerprint.fileSize / 1024 / 1024).toFixed(2)}{" "}
              MB
            </span>
          </div>
          <div className='flex justify-between'>
            <span>{t("addons.contentHash")}:</span>
            <span className='font-mono text-xs truncate max-w-32'>
              {addon.vpkParsed.fingerprint.contentSignature}
            </span>
          </div>

          {identificationResult && (
            <div className='mt-3 p-3 bg-muted rounded-md'>
              <div className='font-medium text-foreground mb-1'>
                {t("addons.identificationResult")}:
              </div>
              {identificationResult.remoteId ? (
                <div className='space-y-1'>
                  <div>
                    <strong>{t("addons.modName")}:</strong>{" "}
                    {identificationResult.modName}
                  </div>
                  <div>
                    <strong>{t("addons.modAuthor")}:</strong>{" "}
                    {identificationResult.modAuthor}
                  </div>
                  <div>
                    <strong>{t("addons.remoteId")}:</strong>{" "}
                    {identificationResult.remoteId}
                  </div>
                  {identificationResult.confidence && (
                    <div>
                      <strong>{t("addons.confidence")}:</strong>{" "}
                      {Math.round(identificationResult.confidence * 100)}%
                    </div>
                  )}
                </div>
              ) : (
                <div className='text-muted-foreground'>
                  {t("addons.modNotFound")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className='mt-4'>
          <Button
            onClick={handleIdentify}
            disabled={identifying}
            isLoading={identifying}
            size='sm'
            variant='outline'
            className='w-full'>
            {identifying ? t("addons.identifying") : t("addons.identifyMod")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
