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
import { useTranslation } from "react-i18next";

const UPDATE_CHANNEL_QUERY_KEY = ["update-channel"] as const;

export const UpdateChannelSelect = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: channel = "stable" } = useQuery({
    queryKey: UPDATE_CHANNEL_QUERY_KEY,
    queryFn: () => invoke<string>("get_update_channel"),
    staleTime: Infinity,
  });

  const { mutate: setChannel } = useMutation({
    mutationFn: (newChannel: string) =>
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
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.updateChannel")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.updateChannelDescription")}
        </p>
      </div>
      <Select onValueChange={setChannel} value={channel}>
        <SelectTrigger className='w-36'>
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
  );
};
