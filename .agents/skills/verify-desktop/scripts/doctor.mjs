// Read-only health check for the Deadlock Mod Manager dev instance that
// verify-desktop drives. Exits 0 only when the instance is worth driving.
// Usage: node .agents/skills/verify-desktop/scripts/doctor.mjs
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TIMEOUT_MS = 5000;
let failures = 0;

const report = (label, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}: ${detail}`);
  if (!ok) failures += 1;
};

const status = (url) =>
  fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(
    (response) => String(response.status),
    () => "nothing",
  );

// driver_session start has no timeout and hangs on a stale bridge port, so the
// bridge only counts as ready when a WebSocket upgrade answers 101 in time.
const bridgeStatusLine = () =>
  new Promise((done) => {
    const socket = connect({ host: "127.0.0.1", port: 9223 });
    const finish = (line) => {
      socket.destroy();
      done(line);
    };
    socket.setTimeout(TIMEOUT_MS, () => finish("nothing"));
    socket.on("error", () => finish("nothing"));
    socket.on("connect", () =>
      socket.write(
        [
          "GET / HTTP/1.1",
          "Host: 127.0.0.1:9223",
          "Connection: Upgrade",
          "Upgrade: websocket",
          "Sec-WebSocket-Version: 13",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          "",
          "",
        ].join("\r\n"),
      ),
    );
    socket.once("data", (chunk) => finish(chunk.toString().split("\r\n")[0]));
  });

const apiUrl = async () => {
  const env = await readFile(join(root, ".env"), "utf8").catch(() => "");
  const value = env
    .split(/\r?\n/)
    .filter((line) => line.startsWith("VITE_API_URL="))
    .at(-1)
    ?.slice("VITE_API_URL=".length)
    .replaceAll('"', "");
  return value || "https://api.deadlockmods.app";
};

const vite = await status("http://localhost:1420");
report(
  "vite",
  vite === "200",
  vite === "200"
    ? "http://localhost:1420 answers 200"
    : `http://localhost:1420 answered '${vite}'; ask the user to run 'pnpm desktop:dev'`,
);

const bridge = await bridgeStatusLine();
report(
  "bridge",
  bridge.includes(" 101 "),
  bridge.includes(" 101 ")
    ? `127.0.0.1:9223 upgraded (${bridge})`
    : `127.0.0.1:9223 answered '${bridge}'; the window may still be compiling, be a CEF/E2E/release build, or be stuck`,
);

const api = await apiUrl();
const health = await status(`${api}/health/live`);
report(
  "api",
  health === "200",
  health === "200"
    ? `${api}/health/live answers 200`
    : `${api}/health/live answered '${health}'; for a localhost URL ask the user to run 'pnpm api:dev'`,
);

// The log file spans many runs, so it is reported for evidence, not gated on.
const localAppData =
  process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
console.log(
  `info  log: ${join(localAppData, "dev.stormix.deadlock-mod-manager", "logs", "deadlock-mod-manager.log")}`,
);

console.log(
  failures === 0
    ? "doctor: ready to drive"
    : `doctor: ${failures} check(s) failed; do not call driver_session`,
);
process.exit(failures);
