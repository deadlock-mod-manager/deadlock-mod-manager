import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ViewerEffectFactory } from "../viewer-effects";
import { ParticleAssets, type ParticleModelAsset } from "./assets";
import { createMaterialMotion } from "./material-motion";
import { SourceParticlePlayer } from "./player";

interface Options {
  modelPath: string;
  particles: boolean;
  period: number;
  releaseAt: number;
  onWarnings: (warnings: string[]) => void;
}

export const createSourceViewerEffect =
  (
    graph: FoundryParticleGraph,
    models: ParticleModelAsset[],
    options: Options,
  ): ViewerEffectFactory =>
  ({ model, camera }) => {
    const assets = new ParticleAssets(graph, models, {
      path: options.modelPath,
      model,
    });
    const ambient = new SourceParticlePlayer(assets, model, () => {});
    const cast = new SourceParticlePlayer(assets, model, () => {});
    const release = new SourceParticlePlayer(assets, model, () => {});
    let materialMotion: ReturnType<typeof createMaterialMotion> | null = null;
    let elapsed = 0;
    let phase = 0;
    let released = false;
    let closed = false;
    let previousWarnings = "";
    const resetCast = () => {
      cast.reset(options.particles ? graph.castRoots : []);
      released = options.releaseAt <= 0;
      release.reset(options.particles && released ? graph.releaseRoots : []);
    };
    const report = () => {
      const warnings = [
        ...new Set([
          ...assets.warnings,
          ...ambient.warnings,
          ...cast.warnings,
          ...release.warnings,
        ]),
      ];
      const key = warnings.join("\n");
      if (key !== previousWarnings) {
        previousWarnings = key;
        options.onWarnings(warnings);
      }
    };
    ambient.reset(options.particles ? graph.ambientRoots : []);
    resetCast();
    void assets.ready.then(() => {
      if (closed) return;
      materialMotion = createMaterialMotion(model, assets);
      materialMotion.update(elapsed);
      report();
    });
    return {
      reset() {
        elapsed = 0;
        phase = 0;
        materialMotion?.reset();
        ambient.reset(options.particles ? graph.ambientRoots : []);
        resetCast();
      },
      update(delta) {
        elapsed += delta;
        phase += delta;
        if (options.period > 0 && phase >= options.period) {
          phase %= options.period;
          resetCast();
        }
        if (!released && phase >= options.releaseAt) {
          released = true;
          if (graph.releaseRoots.length) cast.setRoots([]);
          release.reset(options.particles ? graph.releaseRoots : []);
        }
        materialMotion?.update(delta);
        ambient.update(delta, camera);
        cast.update(delta, camera);
        release.update(delta, camera);
        report();
      },
      dispose() {
        closed = true;
        materialMotion?.dispose();
        ambient.dispose();
        cast.dispose();
        release.dispose();
        assets.dispose();
      },
    };
  };
