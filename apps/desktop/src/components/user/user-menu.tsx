import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { SignOutIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import AuthModal from "./auth-modal";

export default function UserMenu() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return <Skeleton className='size-8 rounded-full' />;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className='cursor-pointer rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          type='button'>
          <Avatar className='size-8'>
            <AvatarImage
              src={user.picture || undefined}
              alt={user.name || user.email || "User"}
            />
            <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8} className='w-48'>
        <DropdownMenuLabel className='font-normal'>
          <p className='text-sm font-medium leading-none'>{user.name}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <SignOutIcon className='size-4' />
          {t("auth.signOut", "Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
