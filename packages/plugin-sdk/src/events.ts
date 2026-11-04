import * as decode from "./decoders";
import { PluginCallError } from "./errors";
import type { EventBatch } from "./generated/EventBatch";
import type { EventSnapshot } from "./generated/EventSnapshot";
import type { HostEvent } from "./generated/HostEvent";
import type { HostEventType } from "./generated/HostEventType";
import { HOST_EVENT_TYPES } from "./generated/event-types";
import type { JsonValue } from "./json";

export type { EventBatch, EventSnapshot, HostEvent, HostEventType };

export { HOST_EVENT_TYPES };

const player: decode.Decoder<
  Extract<
    HostEvent,
    { type: "match.scoreboard.updated" }
  >["data"]["friendly"][number]
> = (value) => {
  const data = decode.object(value);
  const optionalNumber = (key: string) =>
    decode.field(data, key, decode.nullable(decode.number));
  return {
    slot: decode.field(data, "slot", decode.string),
    heroId: optionalNumber("heroId"),
    souls: optionalNumber("souls"),
    level: optionalNumber("level"),
    kills: optionalNumber("kills"),
    deaths: optionalNumber("deaths"),
    assists: optionalNumber("assists"),
    objectiveDamage: optionalNumber("objectiveDamage"),
    isLocal: decode.field(data, "isLocal", decode.boolean),
    isDead: decode.field(data, "isDead", decode.boolean),
  };
};

const decodeHostEvent: decode.Decoder<HostEvent> = (value) => {
  const event = decode.object(value);
  const schemaVersion = decode.field(event, "schemaVersion", decode.number);
  if (schemaVersion !== 1)
    throw new decode.DecodeError("$.schemaVersion", "event schema 1");
  const base = {
    id: decode.field(event, "id", decode.string),
    schemaVersion,
    observedAt: decode.field(event, "observedAt", decode.string),
    operationId: decode.field(
      event,
      "operationId",
      decode.nullable(decode.string),
    ),
  };
  const type = decode.field(event, "type", decode.oneOf(HOST_EVENT_TYPES));
  const data = decode.field(event, "data", decode.object);
  const text = (key: string) => decode.field(data, key, decode.string);
  const optionalNumber = (key: string) =>
    decode.field(data, key, decode.nullable(decode.number));
  const optionalText = (key: string) =>
    decode.field(data, key, decode.nullable(decode.string));
  switch (type) {
    case "game.started":
    case "game.exited":
      return { ...base, type, data: { sessionId: optionalText("sessionId") } };
    case "game.activity.changed":
      return {
        ...base,
        type,
        data: {
          phase: text("phase"),
          matchMode: text("matchMode"),
          mapName: optionalText("mapName"),
        },
      };
    case "game.hero.changed":
      return {
        ...base,
        type,
        data: {
          heroKey: optionalText("heroKey"),
          transformed: decode.field(data, "transformed", decode.boolean),
        },
      };
    case "game.party.changed":
      return {
        ...base,
        type,
        data: { size: decode.field(data, "size", decode.number) },
      };
    case "matchmaking.started":
    case "matchmaking.stopped":
      return {
        ...base,
        type,
        data: { queuedSince: optionalNumber("queuedSince") },
      };
    case "match.joined":
    case "match.left":
      return {
        ...base,
        type,
        data: { matchId: text("matchId"), lobbyId: text("lobbyId") },
      };
    case "match.phase.changed":
      return {
        ...base,
        type,
        data: { matchId: text("matchId"), phase: text("phase") },
      };
    case "match.scoreboard.updated":
      return {
        ...base,
        type,
        data: {
          matchId: optionalText("matchId"),
          clockSeconds: optionalNumber("clockSeconds"),
          reportedAt: optionalNumber("reportedAt"),
          friendly: decode.field(data, "friendly", decode.array(player)),
          enemy: decode.field(data, "enemy", decode.array(player)),
        },
      };
    case "session.classified":
      return {
        ...base,
        type,
        data: {
          sessionId: text("sessionId"),
          classification: text("classification"),
        },
      };
    case "mods.install.started":
    case "mods.install.completed":
    case "mods.install.failed":
    case "mods.disabled":
    case "mods.updated":
    case "mods.removed":
    case "downloads.started":
    case "downloads.completed":
    case "downloads.failed":
    case "downloads.cancelled":
    case "downloads.paused":
    case "downloads.resumed":
      return {
        ...base,
        type,
        data: { modId: text("modId"), profile: text("profile") },
      };
    case "downloads.progress":
      return {
        ...base,
        type,
        data: {
          modId: text("modId"),
          profile: text("profile"),
          downloadedBytes: decode.field(data, "downloadedBytes", decode.number),
          totalBytes: decode.field(data, "totalBytes", decode.number),
        },
      };
    case "profiles.created":
    case "profiles.activated":
    case "profiles.removed":
      return { ...base, type, data: { folder: text("folder") } };
    default: {
      const exhaustive: never = type;
      throw new decode.DecodeError(
        "$.type",
        `a supported event type: ${exhaustive}`,
      );
    }
  }
};

export const decodeEventSnapshot: decode.Decoder<EventSnapshot> = (
  value: JsonValue,
) => {
  const snapshot = decode.object(value);
  return {
    cursor: decode.field(snapshot, "cursor", decode.string),
    latest: decode.field(snapshot, "latest", decode.array(decodeHostEvent)),
  };
};

export const decodeEventBatch: decode.Decoder<EventBatch> = (
  value: JsonValue,
) => {
  const batch = decode.object(value);
  return {
    cursor: decode.field(batch, "cursor", decode.string),
    events: decode.field(batch, "events", decode.array(decodeHostEvent)),
    hasMore: decode.field(batch, "hasMore", decode.boolean),
  };
};

export type EventReadOptions = {
  types: HostEventType[];
  after: string;
  limit?: number;
};
export type EventSubscriptionOptions = {
  types: HostEventType[];
  /** Current retained observations, initially and when they change. Initial
   * source scans refresh this snapshot without becoming new events. */
  onSnapshot: (snapshot: EventSnapshot) => void;
  /** Permission, lifecycle, decoding, and callback errors stop the subscription. */
  onError: (error: Error) => void;
};
export type EventClient = {
  snapshot(types: HostEventType[]): Promise<EventSnapshot>;
  read(options: EventReadOptions): Promise<EventBatch>;
  subscribe(
    options: EventSubscriptionOptions,
    onEvent: (event: HostEvent) => void,
  ): Promise<() => void>;
};

export function createEventClient(
  reader: Pick<EventClient, "snapshot" | "read">,
): EventClient {
  return {
    ...reader,
    async subscribe(options, onEvent) {
      const types = [...options.types];
      const initial = await reader.snapshot(types);
      options.onSnapshot(initial);
      let cursor = initial.cursor;
      let observationIds = initial.latest.map((event) => event.id).join("\0");
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      async function poll() {
        if (stopped) return;
        try {
          const batch = await reader.read({ types, after: cursor });
          if (stopped) return;
          for (const event of batch.events) {
            if (stopped) return;
            onEvent(event);
          }
          if (stopped) return;
          cursor = batch.cursor;
          const snapshot = await reader.snapshot(types);
          if (stopped) return;
          const nextIds = snapshot.latest.map((event) => event.id).join("\0");
          if (nextIds !== observationIds) {
            options.onSnapshot(snapshot);
            observationIds = nextIds;
          }
          timer = setTimeout(() => void poll(), batch.hasMore ? 0 : 2000);
        } catch (error) {
          if (stopped) return;
          let failure = error;
          if (
            error instanceof PluginCallError &&
            error.code === "cursor_expired"
          ) {
            try {
              const snapshot = await reader.snapshot(types);
              if (stopped) return;
              options.onSnapshot(snapshot);
              observationIds = snapshot.latest
                .map((event) => event.id)
                .join("\0");
              cursor = snapshot.cursor;
              timer = setTimeout(() => void poll(), 2000);
              return;
            } catch (recoveryError) {
              failure = recoveryError;
            }
          }
          stopped = true;
          options.onError(
            failure instanceof Error
              ? failure
              : new PluginCallError({
                  source: "client",
                  command: "host.events.read",
                  code: "subscription_failed",
                  message: "Event subscription failed",
                }),
          );
        }
      }
      timer = setTimeout(() => void poll(), 0);
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
  };
}
