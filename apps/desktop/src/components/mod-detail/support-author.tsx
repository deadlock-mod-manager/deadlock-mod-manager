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
import { useTranslation } from "react-i18next";
import type { DonationLink } from "@deadlock-mods/shared";

const PLATFORM_ICONS: Record<string, Icon> = {
  "Ko-fi": CoffeeIcon,
  "Buy Me a Coffee": CoffeeIcon,
  Patreon: PatreonLogoIcon,
  PayPal: PaypalLogoIcon,
  "GitHub Sponsors": GithubLogoIcon,
};

interface SupportAuthorProps {
  donationLinks: DonationLink[];
  isInstalled?: boolean;
}

export const SupportAuthor = ({
  donationLinks,
  isInstalled,
}: SupportAuthorProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-end gap-3 border-b border-border/50 bg-muted/30 px-6 py-3'>
      <Heart
        className='h-5 w-5 shrink-0 text-primary animate-heartbeat [animation-delay:1s]'
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
            <Button
              key={link.url}
              variant='outline'
              size='sm'
              className='animate-jiggle [animation-delay:1s]'
              onClick={async () => {
                try {
                  await openUrl(link.url);
                } catch {
                  toast.error(t("notifications.failedToOpenForumPost"));
                }
              }}>
              {Icon && <Icon className='h-4 w-4' />}
              {link.platform}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
