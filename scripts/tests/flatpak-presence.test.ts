import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

for (const variant of ["", ".cef"]) {
  test(`Flatpak ${variant || "wry"} exposes Discord IPC locations`, () => {
    const manifest = readFileSync(
      new URL(
        `../../apps/desktop/flatpak/dev.stormix.deadlock-mod-manager${variant}.yml`,
        import.meta.url,
      ),
      "utf8",
    );
    const finishArgs = manifest
      .split("finish-args:\n")[1]
      ?.split("\nmodules:")[0]
      .split("\n")
      .map((line) => line.trim().replace(/^- /, ""));

    // discord-rich-presence searches slots 0–9 and Discord's Flatpak directory.
    for (let slot = 0; slot < 10; slot++) {
      expect(finishArgs).toContain(`--filesystem=xdg-run/discord-ipc-${slot}`);
    }
    expect(finishArgs).toContain(
      "--filesystem=xdg-run/app/com.discordapp.Discord:create",
    );
  });
}
