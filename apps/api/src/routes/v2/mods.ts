import { modDownloadRepository, modRepository } from '@deadlock-mods/database';
import { toModDownloadDto, toModDto } from '@deadlock-mods/utils';
import { Hono } from 'hono';

const modsV2Router = new Hono();

modsV2Router.get('/', async (c) => {
  const allMods = await modRepository.findAll();
  return c.json(allMods.map(toModDto));
});

modsV2Router.get('/:id', async (c) => {
  const mod = await modRepository.findByRemoteId(c.req.param('id'));
  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404);
  }
  return c.json(toModDto(mod));
});

// V2 API: return ALL available downloads for the mod
modsV2Router.get('/:id/downloads', async (c) => {
  const remoteId = c.req.param('id');
  const mod = await modRepository.findByRemoteId(remoteId);

  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404);
  }

  const downloads = await modDownloadRepository.findByModId(mod.id);

  if (downloads.length === 0) {
    return c.json({ error: 'No downloads found for this mod' }, 404);
  }

  // Return all downloads sorted by size (largest first)
  const sortedDownloads = downloads.sort((a, b) => b.size - a.size);

  return c.json({
    downloads: toModDownloadDto(sortedDownloads),
    count: sortedDownloads.length,
    primary: toModDownloadDto([sortedDownloads[0]])[0], // Primary download for convenience
  });
});

// V2 also supports the old endpoint for backward compatibility within v2
modsV2Router.get('/:id/download', async (c) => {
  const remoteId = c.req.param('id');
  const mod = await modRepository.findByRemoteId(remoteId);

  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404);
  }

  const downloads = await modDownloadRepository.findByModId(mod.id);

  if (downloads.length === 0) {
    return c.json({ error: 'No downloads found for this mod' }, 404);
  }

  // V2 returns all downloads even on the old endpoint
  const sortedDownloads = downloads.sort((a, b) => b.size - a.size);
  return c.json(toModDownloadDto(sortedDownloads));
});

export default modsV2Router;
