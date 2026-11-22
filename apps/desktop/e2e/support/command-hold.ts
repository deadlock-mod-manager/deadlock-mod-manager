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

export const commandReplyHeld = () =>
  browser.execute(() => window.e2eCommandHold?.captured === true);

export const releaseCommandReply = () =>
  browser.execute(() => {
    window.e2eCommandHold?.release?.();
  });
