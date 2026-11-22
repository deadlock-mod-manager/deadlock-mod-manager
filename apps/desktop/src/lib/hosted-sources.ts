import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import { BASE_URL } from "./api-client";
import { runtimeServiceOrigin } from "./runtime-bootstrap";

export const PERFORMANCE_PACK_TAG = "performance";

export const isHostedSource = (source: NativeSourceSummary) =>
  source.descriptorUrl.startsWith(
    `${runtimeServiceOrigin("dmmApi", BASE_URL)}/api/v2/hosted-sources/`,
  );
