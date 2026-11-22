import type { ComponentType } from "react";
import type { PluginManifest } from "@/types/plugins";

export type PluginModule = {
  manifest: PluginManifest;
  Render?: ComponentType;
  Settings?: ComponentType;
  Page?: ComponentType; // Optional page rendered at /plugins/:id
};
