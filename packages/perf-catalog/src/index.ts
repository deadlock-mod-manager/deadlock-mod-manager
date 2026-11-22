import catalogJson from "../data/catalog.json" with { type: "json" };
import { type Catalog, catalogSchema } from "./schema";

export * from "./schema";

export const loadCatalog = (): Catalog => catalogSchema.parse(catalogJson);
