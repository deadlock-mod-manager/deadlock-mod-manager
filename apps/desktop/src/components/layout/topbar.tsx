import { Badge } from "@deadlock-mods/ui/components/badge";
import useAbout from "@/hooks/use-about";
import UserMenu from "../user-menu";
import Logo from "./logo";

export const Topbar = () => {
  const { version } = useAbout();

  return (
    <div className='border-t border-border h-16 justify-between items-center flex px-4'>
      <div className='flex items-center gap-2'>
        <Logo className='h-12 w-12' />
        <span className='font-primary text-2xl'>Deadlock Mod Manager</span>
        {version && (
          <span className='text-muted-foreground text-xs'>v{version}</span>
        )}
        <Badge className='font-medium text-xs' variant='outline'>
          Early Access
        </Badge>
      </div>
      <div className='flex items-center gap-2'>
        <UserMenu />
      </div>
    </div>
  );
};
