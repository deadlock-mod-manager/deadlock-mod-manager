import { useMutation } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { createLogger } from "@/lib/logger";

const logger = createLogger("preview-diagnostics");

export const CopyPreviewDetails = ({ details }: { details: string }) => {
  const { t } = useTranslation();
  const copy = useMutation({
    mutationFn: () => writeText(details),
    meta: { skipGlobalErrorHandler: true },
    onError: (error) => {
      logger.withError(error).warn("Failed to copy preview diagnostics");
    },
  });
  return (
    <div className='space-y-1'>
      <button
        type='button'
        className='text-muted-foreground underline underline-offset-4 disabled:opacity-50'
        disabled={copy.isPending}
        onClick={() => copy.mutate()}>
        {t(
          copy.isSuccess
            ? "modPreview.detailsCopied"
            : "modPreview.copySupportDetails",
        )}
      </button>
      {copy.isError && (
        <p role='alert' className='text-muted-foreground'>
          {t("modPreview.copyFailed")}
        </p>
      )}
    </div>
  );
};
