import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CustomSetting, NewCustomSetting } from '../schema';
import { customSettings } from '../schema';

export class CustomSettingsRepository {
  constructor(private readonly db: NodePgDatabase<any>) {}

  async findAll(): Promise<CustomSetting[]> {
    return await this.db.select().from(customSettings);
  }

  async findById(id: string): Promise<CustomSetting | null> {
    const result = await this.db
      .select()
      .from(customSettings)
      .where(eq(customSettings.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByKey(key: string): Promise<CustomSetting | null> {
    const result = await this.db
      .select()
      .from(customSettings)
      .where(eq(customSettings.key, key))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async create(setting: NewCustomSetting): Promise<CustomSetting> {
    const result = await this.db
      .insert(customSettings)
      .values(setting)
      .returning();
    return result[0];
  }

  async update(
    id: string,
    setting: Partial<NewCustomSetting>
  ): Promise<CustomSetting> {
    const result = await this.db
      .update(customSettings)
      .set({ ...setting, updatedAt: new Date() })
      .where(eq(customSettings.id, id))
      .returning();
    return result[0];
  }

  async updateByKey(
    key: string,
    setting: Partial<NewCustomSetting>
  ): Promise<CustomSetting> {
    const result = await this.db
      .update(customSettings)
      .set({ ...setting, updatedAt: new Date() })
      .where(eq(customSettings.key, key))
      .returning();
    return result[0];
  }

  async upsertByKey(setting: NewCustomSetting): Promise<CustomSetting> {
    const existing = await this.findByKey(setting.key);

    if (existing) {
      return await this.updateByKey(setting.key, setting);
    }
    return await this.create(setting);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(customSettings).where(eq(customSettings.id, id));
  }

  async deleteByKey(key: string): Promise<void> {
    await this.db.delete(customSettings).where(eq(customSettings.key, key));
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: customSettings.id })
      .from(customSettings)
      .where(eq(customSettings.id, id))
      .limit(1);
    return result.length > 0;
  }

  async existsByKey(key: string): Promise<boolean> {
    const result = await this.db
      .select({ id: customSettings.id })
      .from(customSettings)
      .where(eq(customSettings.key, key))
      .limit(1);
    return result.length > 0;
  }
}
