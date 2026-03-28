import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import type { NewModEvent } from "@deadlock-mods/shared";
import { singleton } from "tsyringe";
import { parseRemoteIdFromUrl } from "@/mods/embed-builder";
import { logger as mainLogger } from "@/lib/logger";

const logger = mainLogger.child().withContext({
  service: "mod-enricher",
});

@singleton()
export class ModEnricherService {
  private readonly modRepository: ModRepository;
  private readonly modDownloadRepository: ModDownloadRepository;

  constructor() {
    this.modRepository = new ModRepository(db);
    this.modDownloadRepository = new ModDownloadRepository(db);
  }

  async enrichModData(eventData: NewModEvent["data"]): Promise<
    NewModEvent["data"] & {
      description?: string;
      downloads?: number;
      likes?: number;
      author?: string;
      category?: string;
      downloadUrl?: string;
      isAudio?: boolean;
    }
  > {
    try {
      const remoteId = parseRemoteIdFromUrl(eventData.link);

      if (!remoteId) {
        logger
          .withMetadata({ url: eventData.link })
          .warn("Could not parse remote ID from URL");
        return eventData;
      }

      logger
        .withMetadata({ remoteId, url: eventData.link })
        .debug("Parsed remote ID from URL");

      const mod = await this.modRepository.findByRemoteId(remoteId);

      if (!mod) {
        logger
          .withMetadata({ remoteId })
          .info("Mod not found in database, using RSS data only");
        return eventData;
      }

      const downloads = await this.modDownloadRepository.findByModId(mod.id);
      const downloadUrl = downloads.length > 0 ? downloads[0].url : undefined;

      logger
        .withMetadata({
          remoteId,
          modId: mod.id,
          hasDescription: !!mod.description,
          downloads: mod.downloadCount,
          likes: mod.likes,
          hasDownloadUrl: !!downloadUrl,
        })
        .info("Enriched mod data from database");

      return {
        ...eventData,
        description: mod.description || undefined,
        downloads: mod.downloadCount || undefined,
        likes: mod.likes || undefined,
        author: mod.author || undefined,
        category: mod.category || undefined,
        downloadUrl: downloadUrl,
        isAudio: mod.isAudio,
      };
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ url: eventData.link })
        .warn("Failed to enrich mod data, using RSS data only");
      return eventData;
    }
  }
}
