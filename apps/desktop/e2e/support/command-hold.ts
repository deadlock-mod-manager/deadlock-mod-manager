import { browser } from "@wdio/globals";

type CommandHold = {
  captured: boolean;
  release: (() => void) | null;
};

declare global {
  interface Window {
    e2eCommandHold?: CommandHold;
  }
}

/**
 * Holds back the reply to the next `command` call for `modId` until
 * `releaseCommandReply`. Tauri sends each command as a request to its `ipc:`
 * protocol, so the call still reaches the backend at once and the reply the
 * app finally gets is the backend's own; only its delivery waits.
 */
export const holdCommandReply = (command: string, modId: string) =>
  browser.execute(
    (target: string, mod: string) => {
      const original = window.fetch;
      const deliver = original.bind(window);
      const hold: CommandHold = { captured: false, release: null };
      const isTarget = (
        input: RequestInfo | URL,
        body: BodyInit | null | undefined,
      ) => {
        const { protocol, hostname, pathname } = new URL(
          input instanceof Request ? input.url : String(input),
          location.href,
        );
        // Tauri posts commands to ipc://localhost/<command>, or to
        // http(s)://ipc.localhost/<command> on Windows, with the arguments
        // as JSON text.
        return (
          (protocol === "ipc:" || hostname === "ipc.localhost") &&
          pathname === `/${target}` &&
          String(body).includes(`"modId":${JSON.stringify(mod)}`)
        );
      };
      const held = (input: RequestInfo | URL, init?: RequestInit) => {
        const reply = deliver(input, init);
        if (hold.captured || !isTarget(input, init?.body)) return reply;
        hold.captured = true;
        const gate = new Promise<void>((resolve) => {
          hold.release = resolve;
        });
        return gate.then(() => reply);
      };
      window.fetch = Object.assign(held, original);
      window.e2eCommandHold = hold;
    },
    command,
    modId,
  );

/** Whether the held call has been made yet. */
export const commandReplyHeld = () =>
  browser.execute(() => window.e2eCommandHold?.captured === true);

/** Delivers the held reply, settled the way the backend settled it. */
export const releaseCommandReply = () =>
  browser.execute(() => {
    window.e2eCommandHold?.release?.();
  });
