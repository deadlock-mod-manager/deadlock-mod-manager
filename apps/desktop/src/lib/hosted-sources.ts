import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import { BASE_URL } from "./api-client";
import { runtimeServiceOrigin } from "./runtime-bootstrap";

/** Listings with this tag also show on the Performance page. */
export const PERFORMANCE_PACK_TAG = "performance";

/**
 * Sources DMM's own API publishes for mod projects that only offer an
 * archive link. Rust enrolls them (`native_sources/hosted.rs`).
 */
export const isHostedSource = (source: NativeSourceSummary) =>
  source.descriptorUrl.startsWith(
    `${runtimeServiceOrigin("dmmApi", BASE_URL)}/api/v2/hosted-sources/`,
  );
