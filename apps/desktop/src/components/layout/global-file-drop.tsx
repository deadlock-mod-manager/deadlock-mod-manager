import { toast } from "@deadlock-mods/ui/components/sonner";
import { UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { useDroppedSource } from "@/hooks/use-file-drop";
import { setPendingDrop } from "@/lib/pending-drop";

const ADD_MODS_PATH = "/add-mods";

const hasFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Lets users drop a mod file anywhere in the window. The drop opens the Add
 * Mods page with the file loaded; that page keeps its own drop zone.
 */
export const GlobalFileDrop = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dragging, setDragging] = useState(false);
  const enabled = pathname !== ADD_MODS_PATH;
  const { handleDataTransfer } = useDroppedSource(
    (source) => {
      setPendingDrop(source);
      navigate(ADD_MODS_PATH);
    },
    (message) => toast.error(message),
  );
  // The listeners stay attached for the whole drag; read the latest handler.
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
      // A drop zone on the page (VPK replacement) handles its own drops.
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
    <div className='pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-[2px]'>
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
