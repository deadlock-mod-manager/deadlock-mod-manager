import {
  encodeMessage,
  type HostContext,
  type HostMessage,
  type JsonValue,
  mapHostColors,
  parseFrameMessage,
} from "@deadlock-mods/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { callExternalPluginFrame } from "@/lib/external-plugins";

/** How long a frame may take to post `ready` before the page says it didn't answer. */
const READY_TIMEOUT_MS = 10_000;

export type FramePhase = "starting" | "ready" | "noAnswer";

const readColorScheme = () =>
  document.documentElement.classList.contains("light") ? "light" : "dark";

// `cardForeground` -> `--card-foreground`
const themeVariable = (name: string) =>
  `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

const readHostContext = (locale: string): HostContext => {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) =>
    `hsl(${style.getPropertyValue(themeVariable(name)).trim()})`;
  return {
    theme: {
      colorScheme: readColorScheme(),
      colors: mapHostColors(color),
      radius: style.getPropertyValue("--radius").trim(),
    },
    locale,
  };
};

/** Bridges the sandboxed plugin frame: relays its calls, sends theme and
 * locale, and tracks whether it has started. */
export const usePluginFrame = (
  pluginId: string,
  live: boolean,
  packageHash: string | undefined,
) => {
  const { i18n } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The frame element must share the plugin page's color-scheme, or the
  // browser paints an opaque backdrop behind the frame.
  const [colorScheme, setColorScheme] = useState(readColorScheme);
  const [phase, setPhase] = useState<FramePhase>("starting");
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    if (!live) return;
    setPhase("starting");
    const timer = window.setTimeout(
      () => setPhase((current) => (current === "ready" ? current : "noAnswer")),
      READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [live, packageHash, frameKey]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!live || !frame) return;
    const send = (message: HostMessage) =>
      // Sandboxed frames have an opaque origin, so the target cannot be named.
      frame.contentWindow?.postMessage(encodeMessage(message), "*");
    const sendContext = () => {
      const context = readHostContext(i18n.language);
      setColorScheme(context.theme.colorScheme);
      send({ type: "context", context });
    };

    // Calls are attributed to the plugin this page embedded, never to
    // anything the frame says about itself.
    const onMessage = async (event: MessageEvent<JsonValue>) => {
      if (event.source !== frame.contentWindow) return;
      const message = parseFrameMessage(event.data);
      if (!message) return;
      if (message.type === "ready") {
        setPhase("ready");
        sendContext();
        return;
      }
      try {
        const value = await callExternalPluginFrame(
          pluginId,
          message.command,
          message.payloadJson,
        );
        send({ type: "result", id: message.id, ok: true, value });
      } catch (error) {
        send({
          type: "result",
          id: message.id,
          ok: false,
          code: "host_rejected",
          message: getErrorMessage(error),
        });
      }
    };

    window.addEventListener("message", onMessage);
    const themeObserver = new MutationObserver(sendContext);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    sendContext();
    return () => {
      window.removeEventListener("message", onMessage);
      themeObserver.disconnect();
    };
  }, [live, packageHash, frameKey, pluginId, i18n.language]);

  return {
    frameRef,
    colorScheme,
    phase,
    /** Changes whenever the frame must be remounted. */
    frameKey: `${packageHash ?? ""}:${frameKey}`,
    reload: () => setFrameKey((key) => key + 1),
  };
};
