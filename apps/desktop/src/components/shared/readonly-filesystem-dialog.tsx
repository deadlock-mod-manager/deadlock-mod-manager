import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Copy,
  FileCog,
  FolderOpen,
  RefreshCw,
  Terminal,
  TriangleAlert,
} from "@deadlock-mods/ui/icons";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { XIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { openGameInfoFolder } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { getOsType } from "@/lib/utils";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * A floating panel (not a Radix Dialog) so the Tauri window drag region
 * is never blocked by a full-screen overlay.
 *
 * The outer wrapper is `pointer-events-none`; only the card itself is
 * `pointer-events-auto`, so dragging/resizing the window still works.
 */
export function ReadonlyFilesystemDialog({
  open,
  onOpenChange,
  onRecheck,
  isRechecking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecheck: () => Promise<void>;
  isRechecking: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isLinux, setIsLinux] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);
  const lastPlaybackTimeRef = useRef(0);
  const gamePath = usePersistedStore((state) => state.gamePath);

  const linuxFixCommand = gamePath
    ? [
        `chmod -R u+w ${shellQuote(`${gamePath}/game/citadel/addons`)}`,
        `chmod u+w ${shellQuote(`${gamePath}/game/citadel/gameinfo.gi`)}`,
      ].join(" && ")
    : "";

  const closeLightbox = () => {
    if (lightboxVideoRef.current) {
      lastPlaybackTimeRef.current = lightboxVideoRef.current.currentTime;
      lightboxVideoRef.current.pause();
    }

    setLightboxOpen(false);

    const previewVideo = previewVideoRef.current;
    if (!previewVideo) {
      return;
    }

    previewVideo.currentTime = lastPlaybackTimeRef.current;
    void previewVideo.play().catch(() => undefined);
  };

  const openLightbox = () => {
    const previewVideo = previewVideoRef.current;

    if (previewVideo) {
      lastPlaybackTimeRef.current = previewVideo.currentTime;
      previewVideo.pause();
    }

    setLightboxOpen(true);
  };

  const syncLightboxPlayback = () => {
    const lightboxVideo = lightboxVideoRef.current;

    if (!lightboxVideo) {
      return;
    }

    if (lastPlaybackTimeRef.current > 0) {
      lightboxVideo.currentTime = lastPlaybackTimeRef.current;
    }

    void lightboxVideo.play().catch(() => undefined);
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (lightboxOpen) {
        closeLightbox();
        return;
      }

      onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setLightboxOpen(false);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    const detectPlatform = async () => {
      const osType = await getOsType();

      if (!cancelled) {
        setIsLinux(osType === "linux");
      }
    };

    void detectPlatform();

    return () => {
      cancelled = true;
    };
  }, []);

  const copyLinuxFixCommand = async () => {
    if (!linuxFixCommand) {
      return;
    }

    try {
      await writeText(linuxFixCommand);
      toast.success("Copied Linux fix command");
    } catch {
      toast.error("Failed to copy Linux fix command");
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — pointer-events-none so titlebar drag still works */}
      <div
        className='fixed inset-0 z-50 flex items-center justify-center pointer-events-none'
        aria-modal='true'
        role='dialog'>
        {/* Semi-transparent scrim, also pointer-events-none */}
        <div className='pointer-events-none absolute inset-0 bg-black/20' />

        {/* Card — pointer-events-auto so it's interactive */}
        <div
          className={`relative pointer-events-auto w-full mx-4 bg-background border rounded-lg shadow-xl p-6 flex flex-col gap-4 ${
            isLinux ? "max-w-3xl" : "max-w-2xl"
          }`}>
          <button
            type='button'
            aria-label='Close'
            className='absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity'
            onClick={() => onOpenChange(false)}>
            <XIcon className='h-4 w-4' />
          </button>

          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <TriangleAlert className='h-5 w-5 text-amber-500' />
              <h2 className='text-lg font-semibold leading-none tracking-tight'>
                Read-only filesystem detected
              </h2>
            </div>
            <p className='text-sm text-muted-foreground'>
              Your addons folder or gameinfo.gi is marked as read-only. Use the
              steps below to make it writable again.
            </p>
            <p className='text-xs text-muted-foreground'>
              No restart is needed. The app rechecks automatically, and you can
              force a fresh check once you have fixed the permissions.
            </p>
          </div>

          {lightboxOpen && (
            <div
              className='fixed inset-0 z-[60] flex items-center justify-center pointer-events-none'
              role='dialog'
              aria-modal='true'>
              <div
                className='absolute inset-0 bg-black/90 pointer-events-auto cursor-pointer'
                onClick={closeLightbox}
                aria-hidden='true'
              />
              <div className='relative pointer-events-auto w-full max-w-6xl mx-4'>
                <button
                  type='button'
                  aria-label='Close'
                  className='absolute -top-8 right-0 text-white opacity-70 hover:opacity-100 transition-opacity'
                  onClick={closeLightbox}>
                  <XIcon className='h-5 w-5' />
                </button>
                <div className='overflow-hidden rounded-md bg-black'>
                  <video
                    ref={lightboxVideoRef}
                    src='/read-only-tutorial.mp4'
                    className='w-full object-contain scale-110 origin-top'
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload='auto'
                    onLoadedMetadata={syncLightboxPlayback}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type='button'
            className='group relative w-full overflow-hidden rounded-md cursor-zoom-in'
            onClick={openLightbox}
            aria-label='Click to enlarge tutorial video'>
            <div className='aspect-video overflow-hidden rounded-md bg-black/30'>
              <video
                ref={previewVideoRef}
                src='/read-only-tutorial.mp4'
                className='pointer-events-none h-full w-full object-cover scale-[1.75] origin-top'
                autoPlay
                loop
                muted
                playsInline
                preload='auto'
              />
            </div>
            <div className='absolute inset-0 flex items-center justify-center bg-black/0 transition-colors rounded-md group-hover:bg-black/30'>
              <span className='opacity-0 transition-opacity text-white text-xs font-medium bg-black/60 px-2 py-1 rounded group-hover:opacity-100'>
                Click to enlarge
              </span>
            </div>
          </button>

          <div className='grid gap-2 sm:grid-cols-3'>
            <Button
              icon={<FolderOpen className='h-4 w-4' />}
              variant='outline'
              onClick={() =>
                invoke("open_mods_folder", { profileFolder: null })
              }>
              Open Addons Folder
            </Button>
            <Button
              icon={<FileCog className='h-4 w-4' />}
              variant='outline'
              onClick={() => openGameInfoFolder()}>
              Open Gameinfo Folder
            </Button>
            <Button
              icon={<RefreshCw className='h-4 w-4' />}
              isLoading={isRechecking}
              variant='secondary'
              onClick={() => void onRecheck()}>
              Recheck now
            </Button>
          </div>

          {isLinux && linuxFixCommand && (
            <Accordion
              className='w-full rounded-md border bg-muted/20 px-4'
              collapsible
              type='single'>
              <AccordionItem className='border-none' value='linux-fix'>
                <AccordionTrigger className='py-3 no-underline hover:no-underline'>
                  <div className='flex min-w-0 items-start gap-2 text-left'>
                    <Terminal className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
                    <div className='min-w-0'>
                      <span className='block'>Linux terminal fix</span>
                      <span className='text-xs font-normal text-muted-foreground'>
                        Copy or inspect the chmod command
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className='flex flex-col gap-3'>
                    <p className='text-xs text-muted-foreground'>
                      Run this command in a terminal to make both paths writable
                      again:
                    </p>
                    <pre className='overflow-x-auto rounded-md bg-black px-3 py-2 text-[11px] text-white sm:text-xs'>
                      <code className='block w-max min-w-full whitespace-nowrap leading-relaxed'>
                        {linuxFixCommand}
                      </code>
                    </pre>
                    <div>
                      <Button
                        size='sm'
                        variant='outline'
                        icon={<Copy className='h-4 w-4' />}
                        onClick={copyLinuxFixCommand}>
                        Copy Linux command
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </>
  );
}
