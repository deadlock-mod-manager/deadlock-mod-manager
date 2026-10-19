import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CoffeeIcon,
  GithubLogoIcon,
  Heart,
  Icon,
  PatreonLogoIcon,
  PaypalLogoIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DonationLink } from "@deadlock-mods/shared";

const PLATFORM_ICONS: Record<string, Icon> = {
  "Ko-fi": CoffeeIcon,
  "Buy Me a Coffee": CoffeeIcon,
  Patreon: PatreonLogoIcon,
  PayPal: PaypalLogoIcon,
  "GitHub Sponsors": GithubLogoIcon,
};

const BURST_HEARTS = [
  { dx: "-18px", rot: "-24deg", delay: "0ms" },
  { dx: "-6px", rot: "-8deg", delay: "60ms" },
  { dx: "8px", rot: "12deg", delay: "30ms" },
  { dx: "20px", rot: "28deg", delay: "90ms" },
];

interface SupportAuthorProps {
  donationLinks: DonationLink[];
  isInstalled?: boolean;
}

export const SupportAuthor = ({
  donationLinks,
  isInstalled,
}: SupportAuthorProps) => {
  const { t } = useTranslation();
  const [burst, setBurst] = useState({ url: "", count: 0 });

  return (
    <div className='flex items-center justify-end gap-3 border-b border-border/50 bg-muted/30 px-6 py-3'>
      <Heart
        key={burst.count}
        className={`h-5 w-5 shrink-0 text-primary ${burst.count > 0 ? "support-heart-pop" : "support-heart"}`}
        weight='fill'
      />
      <span className='text-sm font-medium text-muted-foreground'>
        {t(
          isInstalled
            ? "modDetail.supportAuthor.installedTitle"
            : "modDetail.supportAuthor.title",
        )}
      </span>
      <div className='flex flex-wrap gap-2'>
        {donationLinks.map((link) => {
          const Icon = PLATFORM_ICONS[link.platform];
          return (
            <span key={link.url} className='relative'>
              <Button
                variant='outline'
                size='sm'
                className='support-nudge'
                onClick={async () => {
                  setBurst((prev) => ({
                    url: link.url,
                    count: prev.count + 1,
                  }));
                  try {
                    await openUrl(link.url);
                  } catch {
                    toast.error(t("notifications.failedToOpenForumPost"));
                  }
                }}>
                {Icon && (
                  <span className='relative inline-flex'>
                    <Icon className='support-icon h-4 w-4' />
                    {Icon === CoffeeIcon && (
                      <>
                        <span className='support-steam left-[5px]' />
                        <span
                          className='support-steam left-[9px]'
                          style={{ animationDelay: "700ms" }}
                        />
                      </>
                    )}
                  </span>
                )}
                {link.platform}
              </Button>
              {burst.url === link.url &&
                BURST_HEARTS.map((heart) => (
                  <Heart
                    key={`${burst.count}-${heart.dx}`}
                    aria-hidden
                    className='support-burst-heart h-2.5 w-2.5 text-primary'
                    weight='fill'
                    style={
                      {
                        "--dx": heart.dx,
                        "--rot": heart.rot,
                        "--delay": heart.delay,
                      } as CSSProperties
                    }
                  />
                ))}
            </span>
          );
        })}
      </div>
    </div>
  );
};
