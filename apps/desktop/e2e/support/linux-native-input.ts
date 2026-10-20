import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertOwnedWorld } from "./world";

const execute = promisify(execFile);
const xdotool = async (...args: string[]) =>
  (await execute("xdotool", args, { timeout: 5000 })).stdout.trim();

export type NativeInputRequest = {
  Action:
    | "click"
    | "drag"
    | "keyboard-reorder"
    | "pointer-down"
    | "pointer-move"
    | "pointer-up";
  X: number;
  Y: number;
  EndX: number;
  EndY: number;
  Width: number;
  Height: number;
};

export const linuxNativeInput = async (
  processId: number,
  world: string,
  request: NativeInputRequest,
) => {
  await assertOwnedWorld(world);
  if (process.env.DMM_E2E_ALLOW_NATIVE_INPUT !== "1" || !process.env.DISPLAY)
    throw new Error(
      "Linux native input requires --allow-native-input and an X11 display",
    );
  const windows = (
    await xdotool("search", "--onlyvisible", "--pid", String(processId))
  ).split("\n");
  const candidates = await Promise.all(
    windows.map(async (id) => {
      const geometry = Object.fromEntries(
        (await xdotool("getwindowgeometry", "--shell", id))
          .split("\n")
          .map((line) => line.split("=")),
      );
      return {
        id,
        width: Number(geometry.WIDTH),
        height: Number(geometry.HEIGHT),
      };
    }),
  );
  const window = candidates.sort(
    (a, b) => b.width * b.height - a.width * a.height,
  )[0];
  if (!window || !(window.width > 0 && window.height > 0))
    throw new Error("Owned E2E window is not visible");
  const position = (x: number, y: number) => {
    if (!(x >= 0 && y >= 0 && x < request.Width && y < request.Height))
      throw new Error("Input must stay inside the owned viewport");
    return [
      String(Math.round((x * window.width) / request.Width)),
      String(Math.round((y * window.height) / request.Height)),
    ];
  };
  await xdotool("windowfocus", "--sync", window.id);
  if ((await xdotool("getwindowfocus")) !== window.id)
    throw new Error("Owned E2E window must have focus");
  if (request.Action === "pointer-up") {
    await xdotool("mouseup", "1");
    return;
  }
  await xdotool(
    "mousemove",
    "--sync",
    "--window",
    window.id,
    ...position(request.X, request.Y),
  );
  if (request.Action === "pointer-down") await xdotool("mousedown", "1");
  else if (request.Action === "click") await xdotool("click", "1");
  else if (request.Action === "keyboard-reorder")
    await xdotool("key", "space", "Down", "Down", "space");
  else if (request.Action === "drag") {
    await xdotool("mousedown", "1");
    try {
      await xdotool(
        "mousemove",
        "--sync",
        "--window",
        window.id,
        ...position(request.EndX, request.EndY),
      );
    } finally {
      await xdotool("mouseup", "1");
    }
  }
};
