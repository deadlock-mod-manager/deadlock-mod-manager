import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { LogInIcon, LogOutIcon, UserIcon } from "@deadlock-mods/ui/icons";
import { useAuth } from "@/hooks/use-auth";

export default function UserMenu() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) {
    return <Skeleton className='h-10 w-10 rounded-full' />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Button
        onClick={login}
        variant='outline'
        size='sm'
        icon={<LogInIcon className='size-4' />}>
        Sign In
      </Button>
    );
  }

  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || user.email.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-10 w-10 rounded-full p-0'>
          <Avatar className='h-10 w-10'>
            <AvatarImage
              src={user.image || undefined}
              alt={user.name || user.email}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
        <div className='flex items-center justify-start gap-2 p-2'>
          <div className='flex flex-col space-y-1'>
            {user.name && (
              <p className='text-sm font-medium leading-none'>{user.name}</p>
            )}
            <p className='text-xs leading-none text-muted-foreground'>
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon className='mr-2 h-4 w-4' />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOutIcon className='mr-2 h-4 w-4' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
