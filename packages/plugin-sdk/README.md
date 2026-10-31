# @deadlock-mods/plugin-sdk

TypeScript SDK for the UI of an external Deadlock Mod Manager plugin. The UI runs in a sandboxed frame inside the app, and the SDK calls the plugin's backend commands through the app page.

External plugins are installed at runtime from a ZIP archive containing `manifest.json`, the compiled UI (`ui/index.html` and its assets) and `backend.wasm`. They are not bundled with Deadlock Mod Manager and do not use the built-in plugin loader in `apps/desktop/src/plugins`.

## Usage

```ts
import {
  createPluginClient,
  decode,
  defineCommand,
  PluginCallError,
} from "@deadlock-mods/plugin-sdk";

type Status = { watching: boolean; builds: string[] };

const decodeStatus: decode.Decoder<Status> = (value, path) => {
  const source = decode.object(value, path);
  return {
    watching: decode.field(source, "watching", decode.boolean, path),
    builds: decode.field(source, "builds", decode.array(decode.string), path),
  };
};

const client = createPluginClient();

const status = await client.status(decodeStatus);
const [latest] = status.builds;
if (latest) await client.deploy({ hash: latest }, decode.json);

// Any other command exported by the plugin's backend:
type RenameInput = { label: string };
const rename = defineCommand<RenameInput, string>("rename", decode.string);
await client.call(rename, { label: "Night build" });
```

Every call resolves with the decoded value or rejects with a `PluginCallError`:

| `source`   | Meaning                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `client`   | The SDK refused the call before sending it (invalid or host-only command name, bad payload).      |
| `bridge`   | The host rejected the call or could not finish it: plugin disabled, access revoked, worker crash. |
| `command`  | The command ran and returned `{ ok: false, error: { code, message } }`.                           |
| `protocol` | The response was not a valid envelope, or the value failed the command's decoder.                 |

`code` and `message` come from the host or the command. `toJSON()` returns a plain object, so the error can be logged or posted between frames.

Command inputs are JSON objects. Declare them with `type` aliases rather than `interface` so they satisfy `JsonObject`.

## Theme and language

Inside the app, `onHostContext` delivers the app's theme and language now and whenever they change. `applyHostTheme` exposes the colors as `--dmm-<color>` (for example `--dmm-background`, `--dmm-muted-foreground`) and `--dmm-radius`:

```ts
import { applyHostTheme, isEmbedded, onHostContext } from "@deadlock-mods/plugin-sdk";

if (isEmbedded()) {
  onHostContext(({ theme, locale }) => {
    applyHostTheme(theme);
    void i18n.changeLanguage(locale);
  });
}
```

Leave the page background transparent when embedded so the app's backdrop shows through. The app's own fonts are not available to the frame.

## Contract

- The frame posts JSON strings tagged `dmm-plugin-frame/1` to the app page: `ready`, and `call` with `{ id, command, payloadJson }`. The page answers with `context`, and with `result` carrying the command's JSON envelope as a string.
- Envelope (guest ABI v1): `{ "ok": true, "value": <json> }` or `{ "ok": false, "error": { "code": string, "message": string } }`. The SDK validates it at runtime before decoding `value`.
- `status` is called with payload `{}`. `deploy` takes the plugin's own payload.
- `tick` is run by the host supervisor on a schedule. Plugin views cannot call it.
- Calls have no cancellation, progress events or subscriptions. A call that is in flight completes or fails.

## Security requirements

The SDK is a convenience for honest plugins. It is not the security boundary; the host is.

- **No identity in messages.** The SDK never sends a plugin ID. The app page knows which plugin it embedded in which frame and ignores any identity a message claims.
- **No IPC.** The frame is sandboxed with an opaque origin, so it cannot call any Tauri command, read the app page or reach the network, whether or not the SDK is used.
- **Access is granted by the user, not the manifest.** The manifest lists requested permissions. The user grants them in the trusted host settings, choosing the output VPK and the target profile there. Paths and profiles never come from plugin payloads.
- **Every call is re-checked.** The host checks the plugin is enabled and holds the needed grant on every call, including `tick`. Disabling the plugin, revoking its access or removing it makes later calls fail with a `bridge` error.
- **The backend runs outside the frame.** `backend.wasm` executes in a host-supervised worker process. A worker failure fails the current call; it does not take the host down.
- **Ship everything in the archive.** Bundle React and every other dependency into the UI build. The frame's CSP only loads files from the plugin's own package.
- **Validate what you receive.** Decode every command result before using it, as the example above does.

## Lifecycle

The lifecycle is driven by the host and does not depend on the plugin view being open:

1. **Install:** the user picks an archive. The host validates it and installs the plugin disabled. Installing an archive with an existing ID and a newer version updates the plugin.
2. **Grant:** the user reviews the requested permissions and grants access, choosing the output VPK and a non-default profile.
3. **Enable:** the host starts supervising the plugin's backend and runs `tick` in the background.
4. **Open:** the plugin appears in the app's sidebar, and its page embeds the UI. Leaving the page does not stop background work.
5. **Disable or revoke:** background work stops, the page drops the frame, and later calls are rejected.
6. **Remove:** the host deletes the installed plugin and its grant.

The frame can be unloaded, reloaded or reopened at any time, and the backend can be restarted between calls. Keep durable state in the backend's plugin storage rather than in the frame.

## Dependencies

None. The SDK only uses `postMessage`.

## Development

```bash
pnpm --filter @deadlock-mods/plugin-sdk test
pnpm --filter @deadlock-mods/plugin-sdk check-types
```
