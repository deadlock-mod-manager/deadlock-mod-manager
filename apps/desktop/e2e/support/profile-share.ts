// Importing a share code through the profile manager, and reading the result.
import { $, browser } from "@wdio/globals";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { step } from "./evidence";
import { readPersistedDocument } from "./observations";
import { waitForOverlaysClosed } from "./ui";

const modSchema = z.looseObject({ remoteId: z.string(), status: z.string() });
const profileSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  mods: z.array(modSchema),
});

export const readShareState = async (world: string) =>
  z
    .object({
      state: z.looseObject({
        activeProfileId: z.string(),
        localMods: z.array(modSchema),
        profiles: z.record(z.string(), profileSchema),
      }),
    })
    .parse(await readPersistedDocument(world)).state;

const toastTexts = () =>
  browser.execute(() =>
    [...document.querySelectorAll("[data-sonner-toast]")].map(
      (toast) =>
        `${toast.getAttribute("data-type") ?? ""}: ${toast.textContent ?? ""}`,
    ),
  );

/** Closes every open dialog through its own Close button. */
const closeDialogs = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // Look the button up fresh each time: WebKitGTK reports a re-rendered
    // dialog's button as stale.
    const open = await browser.execute(() => {
      const buttons = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ].filter((button) => button.textContent?.trim() === "Close");
      buttons.at(-1)?.click();
      return buttons.length > 0;
    });
    if (!open) break;
    if (attempt >= 5) await browser.keys("Escape");
    await setTimeout(400);
  }
  await waitForOverlaysClosed();
};

const openProfileManager = () =>
  step("open the profile manager", async () => {
    await waitForOverlaysClosed();
    await $('button[aria-label="Active Profile"]').click();
    await $(
      '//*[@role="dialog"]//*[normalize-space()="Sync Profiles"]',
    ).waitForDisplayed();
  });

const importDialog =
  '//*[@role="dialog"][.//*[normalize-space()="Import Profile Preview"]]';

/** Imports a share code into a new profile and returns that profile. */
export const importShareCode = (world: string, code: string) =>
  step(`import share code ${code}`, async () => {
    const before = new Set(Object.keys((await readShareState(world)).profiles));
    await openProfileManager();
    await $("button=Import Profile").click();
    const input = await $('input[placeholder^="Enter Profile ID"]');
    await input.waitForDisplayed();
    await input.setValue(code);
    await $('button[type="submit"][form="profile-import-form"]').click();
    const create = await $(
      `${importDialog}//button[normalize-space()="Create New Profile"]`,
    );
    await create.waitForClickable({ timeout: 20_000 });
    await create.click();
    const profile = await importedProfile(world, before);
    await browser.waitUntil(async () => !(await $(importDialog).isExisting()), {
      timeout: 60_000,
      timeoutMsg: "The import dialog never closed",
    });
    await closeDialogs();
    return profile;
  });

const importedProfile = async (world: string, before: Set<string>) => {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const state = await readShareState(world);
    const created = Object.values(state.profiles).find(
      (profile) => !before.has(profile.id),
    );
    if (created && created.mods.length > 0) return created;
    if (Date.now() >= deadline)
      throw new Error(
        `The imported profile never got its mods: ${JSON.stringify(created ?? null)} ${JSON.stringify(await toastTexts())}`,
      );
    await setTimeout(250);
  }
};
