import {
  db,
  ModDownloadRepository,
  ModRepository,
} from "@deadlock-mods/database";
import type { NewModEvent } from "@deadlock-mods/shared";
import { singleton } from "tsyringe";
import { parseRemoteIdFromUrl } from "@/mods/embed-builder";
import { wideEventContext } from "@/lib/logger";

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
    const wide = wideEventContext.get();
    try {
      const remoteId = parseRemoteIdFromUrl(eventData.link);

      if (!remoteId) {
        wide?.merge({
          enrichment: {
            remoteIdParse: "failed",
            url: eventData.link,
          },
        });
        return eventData;
      }

      wide?.merge({
        enrichment: {
          remoteId,
          url: eventData.link,
        },
      });

      const mod = await this.modRepository.findByRemoteId(remoteId);

      if (!mod) {
        wide?.merge({
          enrichment: {
            remoteId,
            foundInDb: false,
          },
        });
        return eventData;
      }

      const downloads = await this.modDownloadRepository.findByModId(mod.id);
      const downloadUrl = downloads.length > 0 ? downloads[0].url : undefined;

      wide?.merge({
        enrichment: {
          remoteId,
          modId: mod.id,
          foundInDb: true,
          hasDescription: !!mod.description,
          downloads: mod.downloadCount,
          likes: mod.likes,
          hasDownloadUrl: !!downloadUrl,
        },
      });

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
    } catch {
      wide?.merge({
        enrichment: {
          failed: true,
          url: eventData.link,
        },
      });
      return eventData;
    }
  }
}
