import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import type { ParticleDiagnostic } from "./types";

/** Convert transport failures to the same localized diagnostics as compilation. */
export function particleAssetDiagnostics(
  data: PreviewParticles,
): ParticleDiagnostic[] {
  return data.diagnostics.map((issue) => {
    let code: ParticleDiagnostic["code"];
    switch (issue.code) {
      case "systemLimit":
      case "depthLimit":
      case "textureLimit":
        code = "system-limit";
        break;
      case "missingTexture":
        code = "missing-texture";
        break;
      case "cycle":
        code = "invalid-definition";
        break;
      case "unavailable":
        code = "invalid-definition";
        break;
    }
    return {
      path: issue.path,
      stage: "definition",
      className: "",
      code,
      detail: issue.detail,
    };
  });
}
