import type { Database } from '../client';
import { CustomSettingsRepository } from './custom-settings.repository';
import { ModRepository } from './mod.repository';
import { ModDownloadRepository } from './mod-download.repository';

export class RepositoryService {
  readonly mods: ModRepository;
  readonly modDownloads: ModDownloadRepository;
  readonly customSettings: CustomSettingsRepository;

  constructor(db: Database) {
    this.mods = new ModRepository(db);
    this.modDownloads = new ModDownloadRepository(db);
    this.customSettings = new CustomSettingsRepository(db);
  }
}
