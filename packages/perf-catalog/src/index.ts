import catalogJson from "../data/catalog.json" with { type: "json" };
import { type Catalog, catalogSchema } from "./schema";

export * from "./schema";

/** The committed catalog, validated. Throws if the generated file is invalid. */
export const loadCatalog = (): Catalog => catalogSchema.parse(catalogJson);
