import { generateConfigString } from "@deadlock-mods/crosshair/config-generator";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { encodeConfigToURL } from "@deadlock-mods/crosshair/url-encoder";
import { Button } from "@deadlock-mods/ui/components/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { localizePath } from "@/lib/i18n/locales";
import { useLocale } from "@/lib/i18n/route";

interface ExportButtonProps {
  config: CrosshairConfig;
  className?: string;
}

export function ExportButton({ config, className }: ExportButtonProps) {
  const { t } = useTranslation("tool-crosshair");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const configString = generateConfigString(config);
    await navigator.clipboard.writeText(configString);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Button onClick={handleCopy} className={className} variant='default'>
      {copied ? (
        <>
          <Check className='w-4 h-4 mr-2' />
          {t("export.copied")}
        </>
      ) : (
        <>
          <Copy className='w-4 h-4 mr-2' />
          {t("export.copy")}
        </>
      )}
    </Button>
  );
}

interface ShareButtonProps {
  config: CrosshairConfig;
  className?: string;
}

export function ShareButton({ config, className }: ShareButtonProps) {
  const { t } = useTranslation("tool-crosshair");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const encodedConfig = encodeConfigToURL(config);
    const path = localizePath("/crosshair-generator", locale);
    const url = `${window.location.origin}${path}?edit=${encodedConfig}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Button onClick={handleShare} className={className} variant='outline'>
      {copied ? (
        <>
          <Check className='w-4 h-4 mr-2' />
          {t("export.linkCopied")}
        </>
      ) : (
        <>
          <Share2 className='w-4 h-4 mr-2' />
          {t("export.share")}
        </>
      )}
    </Button>
  );
}
