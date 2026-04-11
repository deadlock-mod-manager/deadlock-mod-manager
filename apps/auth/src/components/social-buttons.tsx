import { Button } from "@deadlock-mods/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";
import { DiscordIcon, SteamIcon } from "./icons";

interface SocialButtonsProps {
  callbackURL?: string;
  onSteamClick: () => void;
}

function resolveSocialCallbackURL(callbackURL: string | undefined): string {
  if (callbackURL) {
    return callbackURL;
  }
  return `${window.location.origin}/`;
}

export function SocialButtons({
  callbackURL,
  onSteamClick,
}: SocialButtonsProps) {
  const discordMutation = useMutation({
    mutationFn: async () => {
      await authClient.signIn.social({
        provider: "discord",
        callbackURL: resolveSocialCallbackURL(callbackURL),
      });
    },
  });

  return (
    <div className='flex flex-col gap-3'>
      <Button
        type='button'
        variant='outline'
        className='w-full'
        disabled={discordMutation.isPending}
        onClick={() => discordMutation.mutate()}>
        <DiscordIcon className='h-5 w-5' />
        Continue with Discord
      </Button>
      <Button
        type='button'
        variant='outline'
        className='w-full'
        onClick={onSteamClick}>
        <SteamIcon className='h-5 w-5' />
        Continue with Steam
      </Button>
    </div>
  );
}
