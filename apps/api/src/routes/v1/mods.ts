import { modDownloadRepository, modRepository } from '@deadlock-mods/database';
import { toModDownloadDto, toModDto } from '@deadlock-mods/utils';
import { Hono } from 'hono';

const modsV1Router = new Hono();

modsV1Router.get('/', async (c) => {
  const allMods = await modRepository.findAll();
  return c.json(allMods.map(toModDto));
});

modsV1Router.get('/:id', async (c) => {
  const mod = await modRepository.findByRemoteId(c.req.param('id'));
  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404);
  }
  return c.json(toModDto(mod));
});

// V1 backward compatibility: return only the first download (primary/largest file)
modsV1Router.get('/:id/download', async (c) => {
  const remoteId = c.req.param('id');
  const mod = await modRepository.findByRemoteId(remoteId);

  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404);
  }

  const downloads = await modDownloadRepository.findByModId(mod.id);

  if (downloads.length === 0) {
    return c.json({ error: 'No downloads found for this mod' }, 404);
  }

  // Return only the first download for backward compatibility
  // Sort by size (largest first) to ensure primary file is returned
  const sortedDownloads = downloads.sort((a, b) => b.size - a.size);
  const primaryDownload = [sortedDownloads[0]];

  return c.json(toModDownloadDto(primaryDownload));
});

export default modsV1Router;
