import { CustomSettingsRepository, db } from "@deadlock-mods/database";
import { toCustomSettingDto } from "@deadlock-mods/shared";
import { Hono } from "hono";

const customSettingsRouter = new Hono();

customSettingsRouter.get("/", async (c) => {
  const customSettingsRepository = new CustomSettingsRepository(db);
  const settings = await customSettingsRepository.findAll();
  return c.json(settings.map(toCustomSettingDto));
});

export default customSettingsRouter;
