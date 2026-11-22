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
