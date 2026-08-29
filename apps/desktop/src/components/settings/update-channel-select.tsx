import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { getUpdateTarget } from "@/lib/tauri-commands";
import { buildStableRollbackUrl } from "@/lib/update-channel-policy";

const UPDATE_CHANNEL_QUERY_KEY = ["update-channel"] as const;
const UPDATE_TARGET_QUERY_KEY = ["app-env", "update-target"] as const;
type UpdateChannel = "stable" | "nightly";

export const UpdateChannelSelect = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: channel = "stable" } = useQuery<UpdateChannel>({
    queryKey: UPDATE_CHANNEL_QUERY_KEY,
    queryFn: () => invoke<UpdateChannel>("get_update_channel"),
    staleTime: Infinity,
  });
  const { data: updateTarget } = useQuery({
    queryKey: UPDATE_TARGET_QUERY_KEY,
    queryFn: getUpdateTarget,
    staleTime: Infinity,
  });
  const rollbackUrl = updateTarget
    ? buildStableRollbackUrl(updateTarget)
    : null;

  const { mutate: setChannel } = useMutation({
    mutationFn: (newChannel: UpdateChannel) =>
      invoke("set_update_channel", { channel: newChannel }),
    onSuccess: (_data, newChannel) => {
      queryClient.setQueryData(UPDATE_CHANNEL_QUERY_KEY, newChannel);
      toast.info(t("settings.updateChannelRestartRequired"));
    },
    onError: () => {
      toast.error(t("settings.updateChannelChangeFailed"));
    },
  });

  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between gap-6'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("settings.updateChannel")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.updateChannelDescription")}
          </p>
        </div>
        <Select onValueChange={setChannel} value={channel}>
          <SelectTrigger className='w-44 shrink-0'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='stable'>
              {t("settings.updateChannelStable")}
            </SelectItem>
            <SelectItem value='nightly'>
              {t("settings.updateChannelNightly")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {updateTarget?.operatingSystem === "windows" && (
        <p className='rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs leading-relaxed dark:text-amber-200'>
          {t("settings.updateChannelWindowsTrust")}
        </p>
      )}

      <div className='flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/25 px-3 py-2.5'>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t("settings.updateChannelRollbackDescription")}
        </p>
        {rollbackUrl && updateTarget && (
          <Button
            className='shrink-0'
            onClick={() => openUrl(rollbackUrl)}
            size='sm'
            variant='outline'>
            {t("settings.updateChannelRollbackAction", {
              runtime: updateTarget.runtime.toUpperCase(),
              installer: updateTarget.installer.toUpperCase(),
            })}
          </Button>
        )}
      </div>
    </div>
  );
};
