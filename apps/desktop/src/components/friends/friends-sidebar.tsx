import type { FriendEntryDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@deadlock-mods/ui/components/sheet";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ExternalLink, Users } from "@deadlock-mods/ui/icons";
import { open } from "@tauri-apps/plugin-shell";
import { useFriends } from "@/hooks/use-friends";

interface FriendsSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WEBSITE_FRIENDS_URL =
  import.meta.env.VITE_WEBSITE_URL ?? "https://deadlockmods.app";

function FriendEntry({ friend }: { friend: FriendEntryDto }) {
  const displayName = friend.displayName || friend.userId;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className='flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3'>
      <div className='relative'>
        <Avatar className='size-10'>
          <AvatarImage src={friend.avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-background ${
            friend.isOnline ? "bg-green-500" : "bg-gray-400"
          }`}
        />
      </div>
      <div className='flex flex-col overflow-hidden'>
        <span className='truncate font-medium text-sm'>{displayName}</span>
        <span className='text-xs text-muted-foreground'>
          {friend.isOnline ? "Online" : "Offline"}
        </span>
      </div>
    </div>
  );
}

function EmptyState() {
  const handleOpenWebsite = async () => {
    try {
      await open(`${WEBSITE_FRIENDS_URL}/friends`);
    } catch {
      // Silently fail
    }
  };

  return (
    <div className='flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center'>
      <Users className='size-12 text-muted-foreground/50' />
      <div className='space-y-1'>
        <p className='font-medium text-sm'>No friends yet</p>
        <p className='text-xs text-muted-foreground'>
          Add friends on the website to see them here
        </p>
      </div>
      <Button variant='outline' size='sm' onClick={handleOpenWebsite}>
        <ExternalLink className='mr-2 size-4' />
        Add Friends
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className='space-y-3'>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className='flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3'>
          <Skeleton className='size-10 rounded-full' />
          <div className='flex flex-col gap-1'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-3 w-16' />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FriendsSidebar({ open, onOpenChange }: FriendsSidebarProps) {
  const { friends, isLoading } = useFriends();

  const friendsList = friends?.friends ?? [];
  const onlineFriends = friendsList.filter((f) => f.isOnline);
  const offlineFriends = friendsList.filter((f) => !f.isOnline);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-80 sm:w-96'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2'>
            <Users className='size-5' />
            Friends
          </SheetTitle>
          <SheetDescription>
            {friendsList.length > 0
              ? `${onlineFriends.length} online, ${offlineFriends.length} offline`
              : "Manage your friends on the website"}
          </SheetDescription>
        </SheetHeader>

        <div className='mt-6 space-y-4'>
          {isLoading ? (
            <LoadingState />
          ) : friendsList.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className='space-y-2'>
                  <h4 className='text-xs font-medium uppercase text-muted-foreground'>
                    Online ({onlineFriends.length})
                  </h4>
                  <div className='space-y-2'>
                    {onlineFriends.map((friend) => (
                      <FriendEntry key={friend.userId} friend={friend} />
                    ))}
                  </div>
                </div>
              )}

              {offlineFriends.length > 0 && (
                <div className='space-y-2'>
                  <h4 className='text-xs font-medium uppercase text-muted-foreground'>
                    Offline ({offlineFriends.length})
                  </h4>
                  <div className='space-y-2'>
                    {offlineFriends.map((friend) => (
                      <FriendEntry key={friend.userId} friend={friend} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
