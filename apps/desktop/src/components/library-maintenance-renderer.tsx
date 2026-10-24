import { useDownloadsMigration } from "@/hooks/use-downloads-migration";
import { useHeroDetection } from "@/hooks/use-hero-detection";
import { useModOrderMigration } from "@/hooks/use-mod-order-migration";

export const LibraryMaintenanceRenderer = () => {
  useModOrderMigration();
  useDownloadsMigration();
  useHeroDetection();
  return null;
};
