import type { FriendEntryDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Input } from "@deadlock-mods/ui/components/input";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Check, Copy, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOIDCSession } from "@/hooks/use-oidc-session";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/friends")({
  component: FriendsPage,
  head: () =>
    seo({
      title: "Friends | Deadlock Mod Manager",
      noindex: true,
    }),
});

function FriendsPage() {
  const navigate = useNavigate();
  const { session, isLoading: isSessionPending } = useOIDCSession();
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "error" | null>(
    null,
  );
  const copyFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!isSessionPending && !session) {
      navigate({
        to: "/login",
        search: {
          returnTo: "/friends",
        },
      });
    }
  }, [isSessionPending, session, navigate]);

  const { data: userIdData, isLoading: isUserIdLoading } = useQuery({
    ...orpc.getUserId.queryOptions(),
    enabled: !!session,
  });

  const {
    data: friendsData,
    isLoading: isFriendsLoading,
    refetch: refetchFriends,
  } = useQuery({
    ...orpc.listFriends.queryOptions(),
    enabled: !!session,
  });

  const sendFriendRequestMutation = useMutation(
    orpc.sendFriendRequest.mutationOptions(),
  );
  const acceptFriendRequestMutation = useMutation(
    orpc.acceptFriendRequest.mutationOptions(),
  );
  const declineFriendRequestMutation = useMutation(
    orpc.declineFriendRequest.mutationOptions(),
  );
  const cancelFriendRequestMutation = useMutation(
    orpc.cancelFriendRequest.mutationOptions(),
  );
  const removeFriendMutation = useMutation(orpc.removeFriend.mutationOptions());

  const friendCode = userIdData?.userId ?? "";
  const friends = friendsData?.friends ?? [];
  const incomingRequests = friendsData?.incomingRequests ?? [];
  const outgoingRequests = friendsData?.outgoingRequests ?? [];

  const isLoading = isSessionPending || isUserIdLoading || isFriendsLoading;

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeout.current) {
        clearTimeout(copyFeedbackTimeout.current);
      }
    };
  }, []);

  const showCopyFeedback = (state: "copied" | "error") => {
    if (copyFeedbackTimeout.current) {
      clearTimeout(copyFeedbackTimeout.current);
    }
    setCopyFeedback(state);
    copyFeedbackTimeout.current = setTimeout(() => {
      setCopyFeedback(null);
    }, 2200);
  };

  const getDisplayName = (entry: FriendEntryDto) => {
    if (entry.displayName && entry.displayName.length > 0) {
      return entry.displayName;
    }
    return entry.userId;
  };

  const handleCopyFriendCode = async () => {
    if (friendCode.length === 0) {
      toast.error("Unable to copy friend code right now.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard access is not available.");
      showCopyFeedback("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(friendCode);
      toast.success("Friend code copied to clipboard.");
      showCopyFeedback("copied");
    } catch (error) {
      showCopyFeedback("error");
      toast.error(
        error instanceof Error ? error.message : "Failed to copy friend code.",
      );
    }
  };

  const handleSendRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCode = friendCodeInput.trim();
    if (trimmedCode.length === 0) {
      toast.error("Enter a friend code first.");
      return;
    }
    if (trimmedCode === friendCode) {
      toast.error("You cannot add yourself as a friend.");
      return;
    }
    try {
      await sendFriendRequestMutation.mutateAsync({
        targetUserId: trimmedCode,
      });
      toast.success("Friend request sent.");
      setFriendCodeInput("");
      await refetchFriends();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send request.",
      );
    }
  };

  const handleAcceptRequest = async (requesterUserId: string) => {
    try {
      await acceptFriendRequestMutation.mutateAsync({ requesterUserId });
      toast.success("Friend request accepted.");
      await refetchFriends();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to accept request.",
      );
    }
  };

  const handleDeclineRequest = async (requesterUserId: string) => {
    try {
      await declineFriendRequestMutation.mutateAsync({ requesterUserId });
      toast.success("Friend request declined.");
      await refetchFriends();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to decline request.",
      );
    }
  };

  const handleCancelRequest = async (targetUserId: string) => {
    try {
      await cancelFriendRequestMutation.mutateAsync({ targetUserId });
      toast.success("Friend request cancelled.");
      await refetchFriends();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to cancel request.",
      );
    }
  };

  const handleRemoveFriend = async (friendUserId: string) => {
    try {
      await removeFriendMutation.mutateAsync({ friendUserId });
      toast.success("Friend removed.");
      await refetchFriends();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove friend.",
      );
    }
  };

  if (isLoading || !session) {
    return (
      <div className='container mx-auto max-w-4xl px-4 py-12'>
        <div className='grid gap-6'>
          <Skeleton className='h-28 w-full rounded-xl' />
          <Skeleton className='h-40 w-full rounded-xl' />
          <Skeleton className='h-48 w-full rounded-xl' />
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto max-w-4xl px-4 py-12'>
      <div className='flex flex-col gap-2'>
        <h1 className='text-3xl font-semibold tracking-tight'>Friends</h1>
        <p className='max-w-2xl text-muted-foreground'>
          Share your friend code with other players to connect, or enter a code
          below to send a request. Manage pending requests and existing friends
          from this page.
        </p>
      </div>

      <div className='mt-8 grid gap-6 md:grid-cols-2'>
        <Card className='border-border/60 bg-card/70 backdrop-blur'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0'>
            <div>
              <CardTitle>Your Friend Code</CardTitle>
              <CardDescription>
                Share this code so others can add you.
              </CardDescription>
            </div>
            <Users className='size-6 text-muted-foreground' />
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-muted/40 px-4 py-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs uppercase text-muted-foreground'>Code</p>
                <p className='break-all font-mono text-lg font-semibold tracking-wide'>
                  {friendCode}
                </p>
              </div>
              <div className='flex flex-col items-start gap-1 sm:items-end'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleCopyFriendCode}
                  disabled={friendCode.length === 0}
                  className='shrink-0'>
                  <Copy className='mr-2 size-4' />
                  Copy
                </Button>
                {copyFeedback === "copied" && (
                  <span className='flex items-center gap-1 text-xs font-medium text-primary'>
                    <Check className='size-3.5' />
                    Copied to clipboard
                  </span>
                )}
                {copyFeedback === "error" && (
                  <span className='flex items-center gap-1 text-xs font-medium text-destructive'>
                    <AlertCircle className='size-3.5' />
                    Copy failed
                  </span>
                )}
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Share this securely. Only give it to people you want to add.
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/60 bg-card/70 backdrop-blur'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0'>
            <div>
              <CardTitle>Add a Friend</CardTitle>
              <CardDescription>
                Enter a friend code to send a request.
              </CardDescription>
            </div>
            <UserPlus className='size-6 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <form className='space-y-4' onSubmit={handleSendRequest}>
              <div className='space-y-2'>
                <Input
                  value={friendCodeInput}
                  onChange={(event) => setFriendCodeInput(event.target.value)}
                  placeholder='Enter friend code'
                  autoComplete='off'
                  spellCheck={false}
                />
              </div>
              <Button
                type='submit'
                className='w-full'
                disabled={sendFriendRequestMutation.isPending}>
                Send Friend Request
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {incomingRequests.length > 0 && (
        <Card className='mt-8 border-border/60 bg-card/70 backdrop-blur'>
          <CardHeader>
            <CardTitle>Incoming Requests</CardTitle>
            <CardDescription>
              Accept or decline pending requests from other players.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {incomingRequests.map((request) => (
              <div
                key={request.userId}
                className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3'>
                <div className='flex flex-col'>
                  <span className='font-medium'>{getDisplayName(request)}</span>
                  <span className='text-xs text-muted-foreground'>
                    {request.userId}
                  </span>
                </div>
                <div className='flex gap-2'>
                  <Button
                    variant='default'
                    size='sm'
                    disabled={acceptFriendRequestMutation.isPending}
                    onClick={() => handleAcceptRequest(request.userId)}>
                    Accept
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={declineFriendRequestMutation.isPending}
                    onClick={() => handleDeclineRequest(request.userId)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {outgoingRequests.length > 0 && (
        <Card className='mt-8 border-border/60 bg-card/70 backdrop-blur'>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              These players have not accepted your request yet.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {outgoingRequests.map((request) => (
              <div
                key={request.userId}
                className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3'>
                <div className='flex items-center gap-2'>
                  <div className='flex flex-col'>
                    <span className='font-medium'>
                      {getDisplayName(request)}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {request.userId}
                    </span>
                  </div>
                  <Badge variant='outline' className='text-xs'>
                    Pending
                  </Badge>
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={cancelFriendRequestMutation.isPending}
                  onClick={() => handleCancelRequest(request.userId)}>
                  Cancel
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className='mt-8 border-border/60 bg-card/70 backdrop-blur'>
        <CardHeader>
          <CardTitle>Friends</CardTitle>
          <CardDescription>
            Your current friends. Remove someone at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {friends.length === 0 ? (
            <div className='rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground'>
              You have no friends yet. Share your code or send an invite to get
              started.
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.userId}
                className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3'>
                <div className='flex items-center gap-3'>
                  <div className='relative'>
                    {friend.avatarUrl ? (
                      <img
                        src={friend.avatarUrl}
                        alt={getDisplayName(friend)}
                        className='size-10 rounded-full'
                      />
                    ) : (
                      <div className='flex size-10 items-center justify-center rounded-full bg-muted'>
                        <Users className='size-5 text-muted-foreground' />
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-background ${
                        friend.isOnline ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>
                  <div className='flex flex-col'>
                    <span className='font-medium'>
                      {getDisplayName(friend)}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {friend.isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
                <Button
                  variant='destructive'
                  size='sm'
                  disabled={removeFriendMutation.isPending}
                  onClick={() => handleRemoveFriend(friend.userId)}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
