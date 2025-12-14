import { Button } from "@deadlock-mods/ui/components/button";
import { GithubIcon, SteamIcon } from "./icons";

interface SocialButtonsProps {
  onSteamClick: () => void;
  githubUrl: string;
}

export function SocialButtons({ onSteamClick, githubUrl }: SocialButtonsProps) {
  return (
    <div className='flex flex-col gap-3'>
      <Button asChild variant='outline' className='w-full'>
        <a href={githubUrl}>
          <GithubIcon className='h-5 w-5' />
          Continue with GitHub
        </a>
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
