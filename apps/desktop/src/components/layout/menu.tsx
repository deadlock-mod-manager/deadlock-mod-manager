import { Badge } from "@deadlock-mods/ui/components/badge";
import { WindowTitlebar } from "tauri-controls";
import useAbout from "@/hooks/use-about";
import Logo from "./logo";

export const Menu = () => {
  const { data } = useAbout();
  const version = data?.version;

  return (
    <WindowTitlebar className='z-20 bg-background'>
      <div className='inline-flex h-fit w-fit items-center gap-2 p-2'>
        <Logo className='h-6 w-6' />
        <div className='flex items-center gap-2'>
          <span className='font-primary text-md'>Deadlock Mod Manager</span>
          {version && (
            <span className='text-muted-foreground text-xs'>v{version}</span>
          )}
          <Badge className='font-medium text-xs' variant='outline'>
            Early Access
          </Badge>
        </div>
      </div>
    </WindowTitlebar>
  );
};
