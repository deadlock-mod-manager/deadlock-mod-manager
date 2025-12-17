import { Button } from "@deadlock-mods/ui/components/button";
import { SteamIcon } from "./icons";

interface SocialButtonsProps {
  onSteamClick: () => void;
}

export function SocialButtons({ onSteamClick }: SocialButtonsProps) {
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
    </div>
  );
}
