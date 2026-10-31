/* oxlint-disable anti-slop/no-runtime-typeof -- postMessage data crosses the frame boundary untyped and is decoded here. */
import type { BridgeTransport } from "./client";
import {
  DecodeError,
  boolean,
  field,
  number,
  object,
  oneOf,
  string,
} from "./decoders";
import { PluginCallError } from "./errors";
import type { JsonValue } from "./json";

/**
 * Embedded plugin views run in `<iframe sandbox="allow-scripts">` inside the
 * app window. Their origin is opaque, so they cannot use Tauri IPC or touch
 * the app document; every call goes to the host as a JSON string through
 * `postMessage`, and the host decides which plugin the frame belongs to.
 */
export const FRAME_PROTOCOL = "dmm-plugin-frame/1";

export const HOST_COLORS = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "border",
  "input",
  "ring",
] as const;

export type HostColor = (typeof HOST_COLORS)[number];

export type HostPalette = Record<HostColor, string>;

export type HostTheme = {
  colorScheme: "dark" | "light";
  /** CSS colors, e.g. `hsl(20 9% 6%)`. */
  colors: HostPalette;
  radius: string;
};

export type HostContext = { theme: HostTheme; locale: string };

/** Messages a frame sends to the host. */
export type FrameMessage =
  | { type: "ready" }
  | { type: "call"; id: number; command: string; payloadJson: string };

/** Messages the host sends to a frame. */
export type HostMessage =
  | { type: "context"; context: HostContext }
  | { type: "result"; id: number; ok: true; value: string }
  | { type: "result"; id: number; ok: false; code: string; message: string };

export const encodeMessage = (message: FrameMessage | HostMessage) =>
  JSON.stringify({ protocol: FRAME_PROTOCOL, ...message });

function parse<T>(data: JsonValue, decode: (value: JsonValue) => T): T | null {
  if (typeof data !== "string") return null;
  try {
    const message = object(JSON.parse(data));
    if (field(message, "protocol", string) !== FRAME_PROTOCOL) return null;
    return decode(message);
  } catch (error) {
    if (error instanceof DecodeError || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export const parseFrameMessage = (data: JsonValue): FrameMessage | null =>
  parse(data, (value) => {
    const message = object(value);
    if (field(message, "type", oneOf(["ready", "call"])) === "ready") {
      return { type: "ready" };
    }
    return {
      type: "call",
      id: field(message, "id", number),
      command: field(message, "command", string),
      payloadJson: field(message, "payloadJson", string),
    };
  });

/** Builds a full host palette from one lookup per color. */
export function mapHostColors(read: (name: HostColor) => string) {
  return {
    background: read("background"),
    foreground: read("foreground"),
    card: read("card"),
    cardForeground: read("cardForeground"),
    primary: read("primary"),
    primaryForeground: read("primaryForeground"),
    secondary: read("secondary"),
    secondaryForeground: read("secondaryForeground"),
    muted: read("muted"),
    mutedForeground: read("mutedForeground"),
    accent: read("accent"),
    accentForeground: read("accentForeground"),
    destructive: read("destructive"),
    destructiveForeground: read("destructiveForeground"),
    border: read("border"),
    input: read("input"),
    ring: read("ring"),
  } satisfies HostPalette;
}

const decodeColors = (value: JsonValue): HostPalette => {
  const colors = object(value);
  return mapHostColors((name) => field(colors, name, string));
};

const decodeTheme = (value: JsonValue): HostTheme => {
  const theme = object(value);
  return {
    colorScheme: field(theme, "colorScheme", oneOf(["dark", "light"])),
    colors: field(theme, "colors", decodeColors),
    radius: field(theme, "radius", string),
  };
};

const parseHostMessage = (data: JsonValue): HostMessage | null =>
  parse(data, (value) => {
    const message = object(value);
    if (field(message, "type", oneOf(["context", "result"])) === "context") {
      const context = field(message, "context", object);
      return {
        type: "context",
        context: {
          theme: field(context, "theme", decodeTheme),
          locale: field(context, "locale", string),
        },
      };
    }
    const id = field(message, "id", number);
    if (field(message, "ok", boolean)) {
      return {
        type: "result",
        id,
        ok: true,
        value: field(message, "value", string),
      };
    }
    return {
      type: "result",
      id,
      ok: false,
      code: field(message, "code", string),
      message: field(message, "message", string),
    };
  });

export const isEmbedded = () =>
  typeof window !== "undefined" && window.parent !== window;

const postToHost = (message: FrameMessage) =>
  // The opaque frame cannot name the host origin; frame-ancestors limits who embeds it.
  window.parent.postMessage(encodeMessage(message), "*");

const hostMessages = new Set<(message: HostMessage) => void>();
let listening = false;

function subscribe(handler: (message: HostMessage) => void) {
  if (!listening) {
    listening = true;
    window.addEventListener("message", (event: MessageEvent<JsonValue>) => {
      if (event.source !== window.parent) return;
      const message = parseHostMessage(event.data);
      if (message) for (const deliver of hostMessages) deliver(message);
    });
  }
  hostMessages.add(handler);
  return () => hostMessages.delete(handler);
}

let nextCallId = 1;

export const frameTransport: BridgeTransport = ({ command, payloadJson }) =>
  new Promise((resolve, reject) => {
    if (!isEmbedded()) {
      reject(
        new PluginCallError({
          source: "bridge",
          code: "not_embedded",
          message: "Plugin views only work inside Deadlock Mod Manager.",
          command,
        }),
      );
      return;
    }
    const id = nextCallId++;
    const unsubscribe = subscribe((message) => {
      if (message.type !== "result" || message.id !== id) return;
      unsubscribe();
      if (message.ok) {
        resolve(message.value);
        return;
      }
      reject(
        new PluginCallError({
          source: "bridge",
          code: message.code,
          message: message.message,
          command,
        }),
      );
    });
    postToHost({ type: "call", id, command, payloadJson });
  });

/** Calls `listener` with the host theme and locale now and whenever they change. */
export function onHostContext(listener: (context: HostContext) => void) {
  const unsubscribe = subscribe((message) => {
    if (message.type === "context") listener(message.context);
  });
  postToHost({ type: "ready" });
  return unsubscribe;
}

/** Exposes the host theme as `--dmm-<color>` (kebab-case) and `--dmm-radius`. */
export function applyHostTheme(
  theme: HostTheme,
  root = document.documentElement,
) {
  root.style.colorScheme = theme.colorScheme;
  root.style.setProperty("--dmm-radius", theme.radius);
  for (const name of HOST_COLORS) {
    const property = name.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    root.style.setProperty(`--dmm-${property}`, theme.colors[name]);
  }
}
