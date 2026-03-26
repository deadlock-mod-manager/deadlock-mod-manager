import { Button } from "@deadlock-mods/ui/components/button";
import { DiscordIcon, SteamIcon } from "./icons";

interface SocialButtonsProps {
  onSteamClick: () => void;
  onDiscordClick: () => void;
}

export function SocialButtons({
  onSteamClick,
  onDiscordClick,
}: SocialButtonsProps) {
  return (
    <div className='flex flex-col gap-3'>
      <Button
        type='button'
        variant='outline'
        className='w-full'
        onClick={onSteamClick}>
        <SteamIcon className='h-5 w-5' />
        Continue with Steam
      </Button>
      <Button
        type='button'
        variant='outline'
        className='w-full'
        onClick={onDiscordClick}>
        <DiscordIcon className='h-5 w-5' />
        Continue with Discord
      </Button>
    </div>
  );
}
