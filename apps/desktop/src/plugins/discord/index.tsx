import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

export const manifest = {
  id: "discord",
  nameKey: "plugins.discord.title",
  descriptionKey: "plugins.discord.description",
  version: "0.0.1",
  author: "Skeptic",
  icon: "public/icon.svg",
} as const;

// Official Discord Application ID for Deadlock Mod Manager
const DISCORD_APP_ID = "1425598471842562068" as const;

type DiscordSettings = {
  details?: string;
  state?: string;
  showElapsedTime?: boolean;
};

const DEFAULT_SETTINGS: DiscordSettings = {
  details: "Managing Deadlock Mods",
  state: "Using Deadlock Mod Manager",
  showElapsedTime: true,
};

const Settings = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | DiscordSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);

  const current = settings ?? DEFAULT_SETTINGS;

  return (
    <div className='flex flex-col gap-4 pl-4 max-h-[calc(100vh-16rem)] overflow-y-auto pr-4'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='discord-details'>
          {t(`plugins.${manifest.id}.details`)}
        </Label>
        <Input
          id='discord-details'
          onChange={(e) =>
            setSettings(manifest.id, {
              ...current,
              details: e.target.value,
            })
          }
          placeholder='Managing Deadlock Mods'
          value={current.details || ""}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='discord-state'>
          {t(`plugins.${manifest.id}.state`)}
        </Label>
        <Input
          id='discord-state'
          onChange={(e) =>
            setSettings(manifest.id, {
              ...current,
              state: e.target.value,
            })
          }
          placeholder='Using Deadlock Mod Manager'
          value={current.state || ""}
        />
      </div>

      <div className='flex items-center justify-between mt-2 pr-2'>
        <div className='space-y-1'>
          <Label className='pl-1 sm:pl-2' htmlFor='discord-elapsed-time'>
            {t(`plugins.${manifest.id}.showElapsedTime`)}
          </Label>
          <p className='text-xs text-muted-foreground pl-1 sm:pl-2'>
            {t(`plugins.${manifest.id}.showElapsedTimeDescription`)}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <input
            aria-checked={!!current.showElapsedTime}
            className='sr-only'
            id='discord-elapsed-time'
            readOnly
            role='switch'
            type='checkbox'
            value={current.showElapsedTime ? "on" : "off"}
          />
          <button
            aria-pressed={!!current.showElapsedTime}
            className='inline-flex h-6 w-11 items-center rounded-full bg-secondary transition-colors data-[state=on]:bg-primary'
            data-state={current.showElapsedTime ? "on" : "off"}
            onClick={() =>
              setSettings(manifest.id, {
                ...current,
                showElapsedTime: !current.showElapsedTime,
              })
            }
            type='button'>
            <span
              className='inline-block h-5 w-5 translate-x-1 rounded-full bg-background shadow transition-transform data-[state=on]:translate-x-5'
              data-state={current.showElapsedTime ? "on" : "off"}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

const Render = () => {
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | DiscordSettings
    | undefined;
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[manifest.id] ?? false,
  );
  // Discord expects unix seconds
  const [startTimestamp] = useState(() => Math.floor(Date.now() / 1000));
  const timeoutsRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    logger.info("Discord plugin effect triggered", {
      isEnabled,
    });

    // reset cancellation and clear any leftover timers
    cancelledRef.current = false;
    if (timeoutsRef.current.length > 0) {
      for (const id of timeoutsRef.current) clearTimeout(id);
      timeoutsRef.current.length = 0;
    }

    // Use a timeout to avoid rapid connect/disconnect cycles
    const timeoutId = window.setTimeout(() => {
      if (cancelledRef.current) return;
      if (!isEnabled) {
        logger.info("Plugin disabled, clearing presence");
        invoke("clear_discord_presence")
          .then(() => logger.info("Discord presence cleared"))
          .catch((error) => {
            logger.warn("Failed to clear Discord presence:", error);
          });
        return;
      }

      const applicationId = DISCORD_APP_ID;

      // Set up Discord Rich Presence
      // We do not use assets; send nulls explicitly

      const activity = {
        details: settings?.details || DEFAULT_SETTINGS.details,
        state: settings?.state || DEFAULT_SETTINGS.state,
        large_image_key: null,
        large_image_text: null,
        small_image_key: null,
        small_image_text: null,
        start_timestamp:
          settings?.showElapsedTime !== false ? startTimestamp : null,
      };

      logger.info("Attempting to set Discord presence", {
        applicationId: applicationId,
        activity,
      });

      // Try to set presence with retry logic
      const attemptConnection = async (retries = 3) => {
        if (cancelledRef.current) return;
        try {
          await invoke("set_discord_presence", {
            applicationId: applicationId,
            activity,
          });
          logger.info("Discord Rich Presence connected successfully");
        } catch (error) {
          if (retries > 0) {
            logger.warn(
              `Failed to set Discord presence, retrying... (${retries} attempts left)`,
              error,
            );
            if (cancelledRef.current) return;
            const retryId = window.setTimeout(() => {
              if (cancelledRef.current) return;
              attemptConnection(retries - 1);
            }, 2000);
            timeoutsRef.current.push(retryId);
          } else {
            logger.warn(
              "Failed to set Discord presence after all attempts:",
              error,
            );
            logger.info("Make sure Discord is running and you're logged in");
          }
        }
      };

      attemptConnection();
    }, 1000); // Wait 1 second before connecting
    timeoutsRef.current.push(timeoutId);

    return () => {
      cancelledRef.current = true;
      if (timeoutsRef.current.length > 0) {
        for (const id of timeoutsRef.current) clearTimeout(id);
        timeoutsRef.current.length = 0;
      }
      // Cleanup: clear presence instead of disconnecting
      logger.info("Cleaning up Discord connection");
      invoke("clear_discord_presence")
        .then(() => logger.info("Discord presence cleared"))
        .catch((error) => {
          logger.error("Failed to clear Discord presence:", error);
        });
    };
  }, [isEnabled, settings, startTimestamp]);

  // This plugin doesn't render any UI elements
  return null;
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
};

export default mod;
