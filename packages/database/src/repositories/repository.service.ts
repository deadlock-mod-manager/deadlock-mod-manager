import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CustomSettingsRepository } from './custom-settings.repository';
import { ModRepository } from './mod.repository';
import { ModDownloadRepository } from './mod-download.repository';

export class RepositoryService {
  public readonly mods: ModRepository;
  public readonly modDownloads: ModDownloadRepository;
  public readonly customSettings: CustomSettingsRepository;

  constructor(db: NodePgDatabase<any>) {
    this.mods = new ModRepository(db);
    this.modDownloads = new ModDownloadRepository(db);
    this.customSettings = new CustomSettingsRepository(db);
  }
}
