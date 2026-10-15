import { toast } from "@deadlock-mods/ui/components/sonner";
import { AppUpdateNotification } from "@/components/layout/app-update-notification";
import { AppUpdateError } from "@/lib/app-updates";

export const showAppUpdateError = (error: Error | null) => {
  const failure = error instanceof AppUpdateError ? error : null;
  toast.custom(
    (id) => (
      <AppUpdateNotification
        failure={failure}
        onDismiss={() => toast.dismiss(id)}
      />
    ),
    { duration: 12_000 },
  );
};
