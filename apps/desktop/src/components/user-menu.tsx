import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { LogInIcon } from "@deadlock-mods/ui/icons";
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
    <div className='flex items-center gap-4'>
      <div className='flex flex-col gap-2 overflow-hidden items-end'>
        <p className='font-medium leading-none'>{user.name}</p>
        <Button variant='text' size='text' className='text-xs' onClick={logout}>
          Sign out
        </Button>
      </div>
      <Avatar className='h-12 w-12'>
        <AvatarImage
          src={user.image || undefined}
          alt={user.name || user.email}
        />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
    </div>
  );
}
