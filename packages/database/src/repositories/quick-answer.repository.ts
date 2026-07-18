import { EntityNotFoundError, mapDrizzleError } from "@deadlock-mods/common";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import {
  type NewQuickAnswerAsset,
  type NewQuickAnswerTemplate,
  quickAnswerAssets,
  quickAnswerTemplates,
} from "../schema/quick-answers";
import { BaseRepository } from "./base";

export class QuickAnswerRepository extends BaseRepository {
  async create(
    templateInput: NewQuickAnswerTemplate,
    assetInputs: Omit<NewQuickAnswerAsset, "id" | "templateId">[],
  ) {
    try {
      const result = await this.db.transaction(async (transaction) => {
        const [template] = await transaction
          .insert(quickAnswerTemplates)
          .values(templateInput)
          .returning();

        if (!template) {
          throw new EntityNotFoundError("new quick answer template", "pending");
        }

        const assets =
          assetInputs.length === 0
            ? []
            : await transaction
                .insert(quickAnswerAssets)
                .values(
                  assetInputs.map((asset) => ({
                    ...asset,
                    templateId: template.id,
                  })),
                )
                .returning();

        return { template, assets };
      });

      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({
          guildId: templateInput.guildId,
          slug: templateInput.slug,
        })
        .error("Failed to create quick answer template");
      return err(mapDrizzleError(error));
    }
  }

  async findBySlug(guildId: string, slug: string) {
    try {
      const [template] = await this.db
        .select()
        .from(quickAnswerTemplates)
        .where(
          and(
            eq(quickAnswerTemplates.guildId, guildId),
            eq(quickAnswerTemplates.slug, slug),
            eq(quickAnswerTemplates.isActive, true),
          ),
        )
        .limit(1);

      return ok(template ?? null);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ guildId, slug })
        .error("Failed to find quick answer template");
      return err(mapDrizzleError(error));
    }
  }

  async findBySlugWithAssets(guildId: string, slug: string) {
    try {
      const [template] = await this.db
        .select()
        .from(quickAnswerTemplates)
        .where(
          and(
            eq(quickAnswerTemplates.guildId, guildId),
            eq(quickAnswerTemplates.slug, slug),
            eq(quickAnswerTemplates.isActive, true),
          ),
        )
        .limit(1);

      if (!template) {
        return ok(null);
      }

      const assets = await this.db
        .select()
        .from(quickAnswerAssets)
        .where(eq(quickAnswerAssets.templateId, template.id))
        .orderBy(asc(quickAnswerAssets.sortOrder));

      return ok({ template, assets });
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ guildId, slug })
        .error("Failed to find quick answer template with assets");
      return err(mapDrizzleError(error));
    }
  }

  async searchActive(guildId: string, query: string) {
    try {
      const normalizedQuery = query.trim();
      const searchCondition =
        normalizedQuery.length === 0
          ? eq(quickAnswerTemplates.guildId, guildId)
          : and(
              eq(quickAnswerTemplates.guildId, guildId),
              or(
                ilike(quickAnswerTemplates.slug, `%${normalizedQuery}%`),
                ilike(quickAnswerTemplates.title, `%${normalizedQuery}%`),
              ),
            );

      const templates = await this.db
        .select()
        .from(quickAnswerTemplates)
        .where(and(searchCondition, eq(quickAnswerTemplates.isActive, true)))
        .orderBy(asc(quickAnswerTemplates.slug))
        .limit(25);

      return ok(templates);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ guildId, query })
        .error("Failed to search quick answer templates");
      return err(mapDrizzleError(error));
    }
  }

  async updateContent(
    templateId: string,
    title: string,
    body: string,
    updatedByDiscordId: string,
  ) {
    try {
      const [template] = await this.db
        .update(quickAnswerTemplates)
        .set({ title, body, updatedByDiscordId })
        .where(eq(quickAnswerTemplates.id, templateId))
        .returning();

      if (!template) {
        return err(
          new EntityNotFoundError("quick answer template", templateId),
        );
      }

      return ok(template);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ templateId })
        .error("Failed to update quick answer template");
      return err(mapDrizzleError(error));
    }
  }

  async addAssets(
    templateId: string,
    assetInputs: Omit<NewQuickAnswerAsset, "id" | "templateId">[],
  ) {
    try {
      if (assetInputs.length === 0) {
        return ok([]);
      }

      const assets = await this.db
        .insert(quickAnswerAssets)
        .values(
          assetInputs.map((asset) => ({
            ...asset,
            templateId,
          })),
        )
        .returning();

      return ok(assets);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ templateId })
        .error("Failed to add quick answer assets");
      return err(mapDrizzleError(error));
    }
  }

  async removeAsset(templateId: string, assetId: string) {
    try {
      const [asset] = await this.db
        .delete(quickAnswerAssets)
        .where(
          and(
            eq(quickAnswerAssets.id, assetId),
            eq(quickAnswerAssets.templateId, templateId),
          ),
        )
        .returning();

      if (!asset) {
        return err(new EntityNotFoundError("quick answer asset", assetId));
      }

      return ok(asset);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ templateId, assetId })
        .error("Failed to remove quick answer asset");
      return err(mapDrizzleError(error));
    }
  }

  async deleteTemplate(templateId: string) {
    try {
      const [template] = await this.db
        .delete(quickAnswerTemplates)
        .where(eq(quickAnswerTemplates.id, templateId))
        .returning();

      if (!template) {
        return err(
          new EntityNotFoundError("quick answer template", templateId),
        );
      }

      return ok(template);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ templateId })
        .error("Failed to delete quick answer template");
      return err(mapDrizzleError(error));
    }
  }

  async recordUsage(templateId: string) {
    try {
      await this.db
        .update(quickAnswerTemplates)
        .set({
          usageCount: sql`${quickAnswerTemplates.usageCount} + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(quickAnswerTemplates.id, templateId));

      return ok(undefined);
    } catch (error) {
      this.logger
        .withError(error)
        .withMetadata({ templateId })
        .error("Failed to record quick answer usage");
      return err(mapDrizzleError(error));
    }
  }
}
