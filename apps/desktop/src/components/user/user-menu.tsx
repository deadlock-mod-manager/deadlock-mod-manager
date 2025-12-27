import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { useState } from "react";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { useAuth } from "@/hooks/use-auth";
import AuthModal from "./auth-modal";

export default function UserMenu() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [showFriendsSidebar, setShowFriendsSidebar] = useState(false);

  if (isLoading) {
    return <Skeleton className='h-10 w-10 rounded-full' />;
  }

  if (!isAuthenticated || !user) {
    return <AuthModal />;
  }

  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    user.email?.slice(0, 2).toUpperCase() ||
    "U";

  return (
    <>
      <div className='flex items-center gap-4'>
        <div className='flex flex-col gap-2 overflow-hidden items-end'>
          <p className='font-medium leading-none'>{user.name}</p>
          <Button
            variant='text'
            size='text'
            className='text-xs'
            onClick={logout}>
            Sign out
          </Button>
        </div>
        <button
          type='button'
          onClick={() => setShowFriendsSidebar(true)}
          className='rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'>
          <Avatar className='h-12 w-12 cursor-pointer'>
            <AvatarImage
              src={user.picture || undefined}
              alt={user.name || user.email || "User"}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </div>

      <FriendsSidebar
        open={showFriendsSidebar}
        onOpenChange={setShowFriendsSidebar}
      />
    </>
  );
}
