import type { FriendModUsageDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Users } from "@deadlock-mods/ui/icons";
import { useFriendsUsingMod } from "@/hooks/use-friends-active-mods";

interface FriendsBadgeProps {
  modId: string;
}

const MAX_VISIBLE_AVATARS = 3;

const FriendAvatar = ({ friend }: { friend: FriendModUsageDto }) => {
  const initials = friend.displayName.slice(0, 2).toUpperCase();
  return (
    <Avatar className='size-5 border-2 border-background'>
      <AvatarImage
        src={friend.avatarUrl ?? undefined}
        alt={friend.displayName}
      />
      <AvatarFallback className='text-[8px]'>{initials}</AvatarFallback>
    </Avatar>
  );
};

export const FriendsBadge = ({ modId }: FriendsBadgeProps) => {
  const { friends, isLoading } = useFriendsUsingMod(modId);

  if (isLoading || friends.length === 0) {
    return null;
  }

  const visibleFriends = friends.slice(0, MAX_VISIBLE_AVATARS);
  const remainingCount = friends.length - MAX_VISIBLE_AVATARS;
  const friendNames = friends.map((f) => f.displayName).join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 backdrop-blur-sm'>
          <Users className='size-3 text-primary-foreground' />
          <div className='flex -space-x-2'>
            {visibleFriends.map((friend) => (
              <FriendAvatar key={friend.userId} friend={friend} />
            ))}
          </div>
          {remainingCount > 0 && (
            <span className='text-[10px] font-medium text-primary-foreground'>
              +{remainingCount}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side='bottom' className='max-w-xs'>
        <p className='text-xs'>
          <span className='font-medium'>Friends using this mod:</span>
          <br />
          {friendNames}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

export default FriendsBadge;
