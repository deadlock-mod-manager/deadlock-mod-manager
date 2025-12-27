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
import { LogInIcon, PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users } from "lucide-react";
import { useOIDCSession } from "@/hooks/use-oidc-session";

export default function UserMenu() {
  const navigate = useNavigate();
  const { session, isLoading, signOut } = useOIDCSession();

  if (isLoading) {
    return <Skeleton className='h-10 w-10 rounded-full' />;
  }

  if (!session) {
    return (
      <Button
        onClick={() =>
          navigate({
            to: "/login",
          })
        }
        variant='outline'
        size='sm'
        icon={<LogInIcon className='size-4' />}>
        Sign In
      </Button>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const isAdmin = session.user.isAdmin === true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='flex items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'>
          <Avatar className='h-9 w-9 border-2 border-border'>
            <AvatarImage
              src={session.user.picture || undefined}
              alt={session.user.name || "User"}
            />
            <AvatarFallback className='bg-primary text-primary-foreground text-xs font-semibold'>
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-64 bg-card/95 backdrop-blur-sm border-border/50 shadow-xl'>
        <div className='flex items-center gap-3 p-3'>
          <Avatar className='h-12 w-12 border-2 border-border'>
            <AvatarImage
              src={session.user.picture || undefined}
              alt={session.user.name || "User"}
            />
            <AvatarFallback className='bg-primary text-primary-foreground font-semibold'>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className='flex flex-col gap-0.5 overflow-hidden'>
            <p className='font-semibold text-sm text-foreground truncate'>
              {session.user.name}
            </p>
            <p className='text-muted-foreground text-xs truncate'>
              {session.user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className='cursor-pointer gap-2 py-2.5'>
          <Link to='/friends'>
            <Users className='size-4' />
            <span>Friends</span>
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem asChild className='cursor-pointer gap-2 py-2.5'>
              <Link to='/dashboard'>
                <LayoutDashboard className='size-4' />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='cursor-pointer gap-2 py-2.5'
          onClick={() => {
            signOut();
            navigate({ to: "/" });
          }}>
          <PhosphorIcons.SignOut className='size-4' />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
