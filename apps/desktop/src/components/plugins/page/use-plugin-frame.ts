import {
  encodeMessage,
  type HostContext,
  type HostMessage,
  type JsonValue,
  mapHostColors,
  parseFrameMessage,
} from "@deadlock-mods/plugin-sdk";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import {
  callExternalPluginFrame,
  externalPluginFrameUrl,
  externalPluginViewQueryKey,
  openExternalPluginView,
} from "@/lib/external-plugins";

const READY_TIMEOUT_MS = 10_000;

export type FramePhase = "starting" | "ready" | "noAnswer";

const readColorScheme = () =>
  document.documentElement.classList.contains("light") ? "light" : "dark";

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

export const usePluginFrame = (pluginId: string, live: boolean) => {
  const { i18n } = useTranslation();
  const view = useQuery({
    queryKey: externalPluginViewQueryKey(pluginId),
    queryFn: () => openExternalPluginView(pluginId),
    enabled: live,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const token = live ? view.data : undefined;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [colorScheme, setColorScheme] = useState(readColorScheme);
  const [phase, setPhase] = useState<FramePhase>("starting");
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    setPhase("starting");
    const timer = window.setTimeout(
      () => setPhase((current) => (current === "ready" ? current : "noAnswer")),
      READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [token, frameKey]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!token || !frame) return;
    const send = (message: HostMessage) =>
      frame.contentWindow?.postMessage(encodeMessage(message), "*");
    const sendContext = () => {
      const context = readHostContext(i18n.language);
      setColorScheme(context.theme.colorScheme);
      send({ type: "context", context });
    };

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
          token,
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
  }, [token, frameKey, i18n.language]);

  const shownPhase: FramePhase = view.isError ? "noAnswer" : phase;
  return {
    frameRef,
    colorScheme,
    phase: shownPhase,
    src: token ? externalPluginFrameUrl(token) : undefined,
    frameKey: `${token ?? ""}:${frameKey}`,
    reload: () => {
      setFrameKey((key) => key + 1);
      if (view.isError) void view.refetch();
    },
  };
};
