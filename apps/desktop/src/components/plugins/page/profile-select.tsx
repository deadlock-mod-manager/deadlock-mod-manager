import {
  CaretDownIcon,
  LockSimpleIcon,
  PlusCircleIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_PROFILE_FOLDER } from "@/lib/external-plugins";
import { cn } from "@/lib/utils";
import type { ModProfile } from "@/types/profiles";

const OPTION =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left leading-[normal] focus-visible:outline-none";

type ProfileSelectProps = {
  /** Non-default profiles with their own folder. */
  profiles: ModProfile[];
  defaultProfile: ModProfile | undefined;
  /** Installing never targets the default profile; reading may. */
  install: boolean;
  selectedFolder: string | null;
  testProfileName: string;
  open: boolean;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (folder: string) => void;
  onCreate: () => void;
};

const enabledModCount = (profile: ModProfile) =>
  Object.values(profile.enabledMods).filter((entry) => entry.enabled).length;

/** Picks the profile a plugin may use. When it installs, the default profile
 * is listed but never selectable. The menu opens in place, pushing the card open. */
export const ProfileSelect = ({
  profiles,
  defaultProfile,
  install,
  selectedFolder,
  testProfileName,
  open,
  creating,
  onOpenChange,
  onSelect,
  onCreate,
}: ProfileSelectProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected =
    !install && selectedFolder === DEFAULT_PROFILE_FOLDER
      ? defaultProfile
      : profiles.find((profile) => profile.folderName === selectedFolder);
  const modsHint = (profile: ModProfile) =>
    t(
      install
        ? "plugins.page.setup.profileModsInstall"
        : "plugins.page.setup.profileMods",
      { count: enabledModCount(profile) },
    );
  const option = (profile: ModProfile, folder: string) => (
    <button
      aria-pressed={folder === selectedFolder}
      className={cn(
        OPTION,
        folder === selectedFolder ? "bg-foreground/5" : "hover:bg-foreground/5",
      )}
      key={profile.id}
      onClick={() => onSelect(folder)}
      type='button'>
      <UserCircleIcon className='shrink-0 text-muted-foreground' size={15} />
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate font-semibold text-[13px] text-foreground'>
          {profile.name}
        </span>
        <span className='text-[11px] text-muted-foreground'>
          {modsHint(profile)}
        </span>
      </span>
    </button>
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className='flex w-full flex-col gap-1.5' ref={rootRef}>
      <button
        aria-expanded={open}
        className={cn(
          "flex h-[34px] w-full cursor-pointer items-center gap-2 rounded-[8px] bg-background px-2.5 text-left ring-1 ring-inset focus-visible:outline-none focus-visible:ring-primary",
          open ? "ring-primary" : "ring-border",
        )}
        onClick={() => onOpenChange(!open)}
        type='button'>
        <UserCircleIcon className='shrink-0 text-muted-foreground' size={14} />
        <span
          className={cn(
            "truncate text-[13px] leading-[normal]",
            selected ? "text-foreground" : "text-muted-foreground",
          )}>
          {selected?.name ?? t("plugins.page.setup.chooseProfile")}
        </span>
        <span className='h-px flex-1' />
        <CaretDownIcon className='shrink-0 text-muted-foreground' size={12} />
      </button>
      {open ? (
        <div className='flex w-full flex-col gap-0.5 rounded-[10px] bg-card p-1.5 shadow-[0px_12px_32px_#000000AA] ring-1 ring-foreground/10 ring-inset'>
          {install ? (
            <>
              <button
                className={cn(
                  OPTION,
                  "bg-primary/[0.08] hover:bg-primary/[0.12]",
                )}
                disabled={creating}
                onClick={onCreate}
                type='button'>
                <PlusCircleIcon className='shrink-0 text-primary' size={15} />
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='font-semibold text-[13px] text-primary'>
                    {t("plugins.page.setup.createProfile")}
                  </span>
                  <span className='text-[11px] text-muted-foreground'>
                    {t("plugins.page.setup.createProfileHint", {
                      name: testProfileName,
                    })}
                  </span>
                </span>
                <span className='shrink-0 rounded-[6px] bg-primary/[0.12] px-[7px] py-0.5 font-semibold text-[11px] text-primary'>
                  {t("plugins.page.setup.recommended")}
                </span>
              </button>
              <span className='h-px w-full bg-foreground/[0.06]' />
            </>
          ) : null}
          {!install && defaultProfile
            ? option(defaultProfile, DEFAULT_PROFILE_FOLDER)
            : null}
          {profiles.map((profile) => option(profile, profile.folderName ?? ""))}
          {install && defaultProfile ? (
            <div
              aria-disabled
              aria-selected={false}
              className={cn(OPTION, "cursor-not-allowed opacity-50")}
              role='option'>
              <LockSimpleIcon
                className='shrink-0 text-muted-foreground'
                size={15}
              />
              <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className='truncate font-semibold text-[13px] text-foreground'>
                  {defaultProfile.name}
                </span>
                <span className='text-[11px] text-muted-foreground'>
                  {t("plugins.page.setup.defaultProfile")}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
