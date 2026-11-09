import { browser } from "@wdio/globals";

type IpcHold = {
  captured: boolean;
  delivered: boolean;
  release: () => void;
};

declare global {
  interface Window {
    e2eIpcHold?: IpcHold;
  }
}

/**
 * Holds back the reply to the next `command` call for `profileFolder` until
 * `releaseHeldIpcReply`. Tauri sends each command through `fetch` to its IPC
 * protocol, so the backend still runs the command at once; only the app's
 * view of the result waits, as if the command had been slow.
 */
export const holdNextIpcReply = (command: string, profileFolder: string) =>
  browser.execute(
    (target: string, folder: string) => {
      const send = window.fetch.bind(window);
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const hold: IpcHold = { captured: false, delivered: false, release };
      window.e2eIpcHold = hold;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          hold.captured ||
          !url.endsWith(`/${target}`) ||
          typeof init?.body !== "string" ||
          !init.body.includes(JSON.stringify(folder))
        )
          return send(input, init);
        hold.captured = true;
        const response = await send(input, init);
        await released;
        window.fetch = send;
        hold.delivered = true;
        return response;
      };
    },
    command,
    profileFolder,
  );

export const ipcReplyHeld = () =>
  browser.execute(() => window.e2eIpcHold?.captured === true);

export const releaseHeldIpcReply = () =>
  browser.execute(() => {
    window.e2eIpcHold?.release();
  });

export const ipcReplyDelivered = () =>
  browser.execute(() => window.e2eIpcHold?.delivered === true);
