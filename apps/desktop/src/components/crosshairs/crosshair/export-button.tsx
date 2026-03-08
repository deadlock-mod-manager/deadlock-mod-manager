import { generateConfigString } from "@deadlock-mods/crosshair/config-generator";
import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { encodeConfigToURL } from "@deadlock-mods/crosshair/url-encoder";
import { Button } from "@deadlock-mods/ui/components/button";
import { Check, Copy, Share2 } from "@deadlock-mods/ui/icons";
import { useState } from "react";

interface ExportButtonProps {
  readonly config: CrosshairConfig;
  readonly className?: string;
}

export function ExportButton({
  config,
  className,
}: Readonly<ExportButtonProps>) {
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
          Copied!
        </>
      ) : (
        <>
          <Copy className='w-4 h-4 mr-2' />
          Copy Config
        </>
      )}
    </Button>
  );
}

interface ShareButtonProps {
  readonly config: CrosshairConfig;
  readonly className?: string;
}

export function ShareButton({ config, className }: Readonly<ShareButtonProps>) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const encodedConfig = encodeConfigToURL(config);
    const url = `${globalThis.location.origin}/crosshair-generator?edit=${encodedConfig}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Button onClick={handleShare} className={className} variant='outline'>
      {copied ? (
        <>
          <Check className='w-4 h-4 mr-2' />
          Link Copied!
        </>
      ) : (
        <>
          <Share2 className='w-4 h-4 mr-2' />
          Share URL
        </>
      )}
    </Button>
  );
}
