import { toast } from "@deadlock-mods/ui/components/sonner";
import { UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDroppedSource } from "@/hooks/use-file-drop";
import { useAddModDialog } from "@/lib/add-mod-dialog";

const hasFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false;

export const GlobalFileDrop = () => {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const enabled = !useAddModDialog((state) => state.open);
  const { handleDataTransfer } = useDroppedSource(
    (source) => useAddModDialog.getState().show(source),
    (message) => toast.error(message),
  );
  const handleDataTransferRef = useRef(handleDataTransfer);
  handleDataTransferRef.current = handleDataTransfer;

  useEffect(() => {
    if (!enabled) return;

    let depth = 0;
    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      setDragging(!event.defaultPrevented);
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(event) || event.defaultPrevented || !event.dataTransfer) {
        return;
      }
      event.preventDefault();
      void handleDataTransferRef.current(event.dataTransfer);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      setDragging(false);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [enabled]);

  if (!dragging) return null;

  return (
    <div className='pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80'>
      <div className='flex flex-col items-center gap-2 rounded-xl border-2 border-primary/60 border-dashed bg-card/90 px-10 py-8 text-center shadow-lg'>
        <UploadSimple className='size-10 text-primary' />
        <p className='font-semibold text-lg'>
          {t("addMods.dropAnywhereTitle")}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t("addMods.dropFilesDescription")}
        </p>
      </div>
    </div>
  );
};
