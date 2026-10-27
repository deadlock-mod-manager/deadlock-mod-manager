import { WarningCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export function ImageLocationWarning({
  count,
  directory = false,
}: {
  count: number;
  directory?: boolean;
}) {
  const { t } = useTranslation();
  const message = t(
    directory ? "workbenchImages.folderWarning" : "workbenchImages.fileWarning",
    { count },
  );
  return (
    <span
      role='img'
      aria-label={message}
      title={message}
      className='ml-auto shrink-0 text-destructive'>
      <WarningCircleIcon aria-hidden='true' weight='fill' className='size-4' />
    </span>
  );
}
