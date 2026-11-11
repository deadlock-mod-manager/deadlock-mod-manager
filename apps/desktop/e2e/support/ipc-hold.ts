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
      const original = window.fetch;
      const send = original.bind(window);
      const hold: IpcHold = {
        captured: false,
        delivered: false,
        release: () => {},
      };
      const released = new Promise<void>((resolve) => {
        hold.release = resolve;
      });
      window.e2eIpcHold = hold;
      const holdReply = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        // Tauri posts a command's arguments as JSON to `ipc://localhost/<command>`.
        if (
          hold.captured ||
          !String(input).endsWith(`/${target}`) ||
          !String(init?.body).includes(JSON.stringify(folder))
        )
          return send(input, init);
        hold.captured = true;
        const response = await send(input, init);
        await released;
        window.fetch = original;
        hold.delivered = true;
        return response;
      };
      // Assigning a plain function to `window.fetch` doesn't type-check under
      // Bun's `fetch` type, which adds `preconnect`; the webview has no such
      // property to keep.
      Object.defineProperty(window, "fetch", {
        configurable: true,
        writable: true,
        value: holdReply,
      });
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
