import { customSettingsRepository } from '@deadlock-mods/database';
import { toCustomSettingDto } from '@deadlock-mods/utils';
import { Hono } from 'hono';

const customSettingsRouter = new Hono();

customSettingsRouter.get('/', async (c) => {
  const settings = await customSettingsRepository.findAll();
  return c.json(settings.map(toCustomSettingDto));
});

export default customSettingsRouter;
