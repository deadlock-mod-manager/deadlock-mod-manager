import { browser } from "@wdio/globals";

/** What Tauri hands a JavaScript event listener. */
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
    // Tauri 2 keeps each webview's event listeners here, by event name and id.
    __internal_unstable_listeners_object_id__?: Record<
      string,
      Record<string, { handlerId: number }>
    >;
    e2eEventHold?: EventHold;
  }
}

/**
 * Holds back the mod's download events from its first cancellation error on,
 * in the order they arrive, until `releaseHeldEvents`. The app's listeners are
 * wrapped where Tauri keeps them, so the events themselves are the backend's.
 * Returns how many listener callbacks it wrapped.
 */
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

/**
 * Holds back every `event` the backend sends from now on, in the order they
 * arrive, until `releaseHeldEvents`. Returns how many listener callbacks it
 * wrapped.
 */
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

/** Whether the hold has caught the cancellation error yet. */
export const cancellationHeld = () =>
  browser.execute(() => window.e2eEventHold?.captured === true);

/** Delivers the held events in their original order; returns how many. */
export const releaseHeldEvents = () =>
  browser.execute(() => {
    const hold = window.e2eEventHold;
    if (!hold) return 0;
    hold.released = true;
    const held = hold.held.splice(0);
    for (const deliver of held) deliver();
    return held.length;
  });
