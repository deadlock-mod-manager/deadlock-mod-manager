import { browser } from "@wdio/globals";

export type TauriEventData = {
  event: string;
  id: number;
  payload: { modId?: string; error?: string };
};

type EventHold = {
  wrappedCallbacks: number;
  captured: boolean;
  released: boolean;
  held: (() => void)[];
};

declare global {
  interface Window {
    __internal_unstable_listeners_object_id__?: Record<
      string,
      Record<string, { handlerId: number }>
    >;
    e2eEventHold?: EventHold;
  }
}

export const holdEventsFromCancellation = (modId: string) =>
  browser.execute((target: string) => {
    const listeners = window["__internal_unstable_listeners_object_id__"] ?? {};
    const { callbacks } = window["__TAURI_INTERNALS__"];
    const hold: EventHold = {
      wrappedCallbacks: 0,
      captured: false,
      released: false,
      held: [],
    };
    for (const event of Object.getOwnPropertyNames(listeners)) {
      if (!event.startsWith("download-")) continue;
      for (const id of Object.getOwnPropertyNames(listeners[event])) {
        const { handlerId } = listeners[event][id];
        const deliver = callbacks.get(handlerId);
        if (!deliver) continue;
        hold.wrappedCallbacks++;
        callbacks.set(handlerId, (data) => {
          const cancelled =
            data.event === "download-error" &&
            (data.payload.error ?? "").includes("cancelled");
          if (
            !hold.released &&
            data.payload.modId === target &&
            (hold.captured || cancelled)
          ) {
            hold.captured = true;
            hold.held.push(() => deliver(data));
            return;
          }
          deliver(data);
        });
      }
    }
    window.e2eEventHold = hold;
    return hold.wrappedCallbacks;
  }, modId);

export const holdEvents = (event: string) =>
  browser.execute((name: string) => {
    const listeners =
      window["__internal_unstable_listeners_object_id__"]?.[name] ?? {};
    const { callbacks } = window["__TAURI_INTERNALS__"];
    const hold: EventHold = {
      wrappedCallbacks: 0,
      captured: false,
      released: false,
      held: [],
    };
    for (const id of Object.getOwnPropertyNames(listeners)) {
      const { handlerId } = listeners[id];
      const deliver = callbacks.get(handlerId);
      if (!deliver) continue;
      hold.wrappedCallbacks++;
      callbacks.set(handlerId, (data) => {
        if (hold.released) {
          deliver(data);
          return;
        }
        hold.captured = true;
        hold.held.push(() => deliver(data));
      });
    }
    window.e2eEventHold = hold;
    return hold.wrappedCallbacks;
  }, event);

export const cancellationHeld = () =>
  browser.execute(() => window.e2eEventHold?.captured === true);

export const releaseHeldEvents = () =>
  browser.execute(() => {
    const hold = window.e2eEventHold;
    if (!hold) return 0;
    hold.released = true;
    const held = hold.held.splice(0);
    for (const deliver of held) deliver();
    return held.length;
  });
