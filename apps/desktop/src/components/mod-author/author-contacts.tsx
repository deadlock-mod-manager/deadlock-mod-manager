import {
  isAuthorContactUrl,
  type ModAuthorContactDto,
} from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ButterflyIcon,
  CoffeeIcon,
  DiscordLogoIcon,
  GithubLogoIcon,
  type Icon,
  InstagramLogoIcon,
  PatreonLogoIcon,
  RedditLogoIcon,
  SoundcloudLogoIcon,
  SteamLogoIcon,
  TwitchLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

type ContactType = ModAuthorContactDto["type"];

const PLATFORMS = {
  discord: { name: "Discord", icon: DiscordLogoIcon },
  steam: { name: "Steam", icon: SteamLogoIcon },
  x: { name: "X", icon: XLogoIcon },
  bluesky: { name: "Bluesky", icon: ButterflyIcon },
  instagram: { name: "Instagram", icon: InstagramLogoIcon },
  youtube: { name: "YouTube", icon: YoutubeLogoIcon },
  twitch: { name: "Twitch", icon: TwitchLogoIcon },
  kofi: { name: "Ko-fi", icon: CoffeeIcon },
  patreon: { name: "Patreon", icon: PatreonLogoIcon },
  buymeacoffee: { name: "Buy Me a Coffee", icon: CoffeeIcon },
  github: { name: "GitHub", icon: GithubLogoIcon },
  reddit: { name: "Reddit", icon: RedditLogoIcon },
  soundcloud: { name: "SoundCloud", icon: SoundcloudLogoIcon },
} satisfies Record<ContactType, { name: string; icon: Icon }>;

const contactKey = (contact: ModAuthorContactDto) =>
  `${contact.type}:${contact.url ?? contact.value}`;

/** Discord usernames have no link, so they're copied instead of opened. */
const DiscordContact = ({ contact }: { contact: ModAuthorContactDto }) => {
  const { t } = useTranslation();
  const inviteUrl =
    contact.url !== null && isAuthorContactUrl("discord", contact.url)
      ? contact.url
      : null;
  const action = useMutation({
    mutationFn: async () => {
      if (inviteUrl) {
        await openUrl(inviteUrl);
        return;
      }
      await navigator.clipboard.writeText(contact.value);
      toast.success(t("authorPage.discordCopied", { username: contact.value }));
    },
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("authorPage.openContactError")),
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={action.isPending}
          onClick={() => action.mutate()}
          size='sm'
          variant='outline'>
          <DiscordLogoIcon className='size-4' weight='duotone' />
          <span className='max-w-40 truncate'>{contact.value}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {inviteUrl
          ? t("authorPage.joinDiscordServer")
          : t("authorPage.copyDiscordUsername")}
      </TooltipContent>
    </Tooltip>
  );
};

const LinkContact = ({ contact }: { contact: ModAuthorContactDto }) => {
  const { t } = useTranslation();
  const platform = PLATFORMS[contact.type];
  const open = useMutation({
    mutationFn: (url: string) => openUrl(url),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("authorPage.openContactError")),
  });
  const { url } = contact;
  if (!url || !isAuthorContactUrl(contact.type, url)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`${platform.name}: ${contact.value}`}
          disabled={open.isPending}
          onClick={() => open.mutate(url)}
          size='icon'
          variant='ghost'>
          <platform.icon className='size-5' weight='duotone' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {platform.name}: {contact.value}
      </TooltipContent>
    </Tooltip>
  );
};

interface AuthorContactsProps {
  contacts: ModAuthorContactDto[];
}

export const AuthorContacts = ({ contacts }: AuthorContactsProps) => {
  if (contacts.length === 0) return null;
  const discord = contacts.filter((contact) => contact.type === "discord");
  const links = contacts.filter((contact) => contact.type !== "discord");

  return (
    <div className='flex flex-wrap items-center justify-end gap-1'>
      {discord.map((contact) => (
        <DiscordContact contact={contact} key={contactKey(contact)} />
      ))}
      {links.map((contact) => (
        <LinkContact contact={contact} key={contactKey(contact)} />
      ))}
    </div>
  );
};
