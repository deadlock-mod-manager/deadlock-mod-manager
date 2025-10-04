import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className='h-9 w-24' />;
  }

  if (!session) {
    return (
      <Button asChild variant='outline'>
        <Link to='/login'>Sign In</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{session.user.name}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='bg-card'>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
        <DropdownMenuItem>
          <Button
            className='w-full'
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
            variant='destructive'>
            Sign Out
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
