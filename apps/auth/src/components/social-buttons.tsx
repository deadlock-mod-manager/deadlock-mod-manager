import { Button } from "@deadlock-mods/ui/components/button";
import { SteamIcon } from "./icons";

interface SocialButtonsProps {
  onSteamClick: () => void;
  onDevClick?: () => void;
  showDevButton?: boolean;
}

export function SocialButtons({
  onSteamClick,
  onDevClick,
  showDevButton,
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
      {showDevButton && onDevClick && (
        <Button
          type='button'
          variant='secondary'
          className='w-full'
          onClick={onDevClick}>
          Use dev email login
        </Button>
      )}
    </div>
  );
}
