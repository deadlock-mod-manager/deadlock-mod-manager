import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ViewerEffect, ViewerEffectContext } from "../viewer-effects";
import { ParticleAssets, type ParticleModelAsset } from "./assets";
import { createMaterialMotion } from "./material-motion";
import { SourceParticlePlayer } from "./player";
import { projectilePlayback, ProjectileEmission } from "./ability-projectiles";

import {
  mergeParticleSystemsInUse,
  referencedParticleSystems,
  type ParticleSystemInUse,
} from "./systems-in-use";

interface Options {
  modelPath: string;
  particles: boolean;
  period: number;
  releaseAt: number;
  onParticlesInUse?: (systems: ParticleSystemInUse[]) => void;
  onWarnings: (warnings: string[]) => void;
}

export const createSourceViewerEffect =
  (
    graph: FoundryParticleGraph,
    models: ParticleModelAsset[],
    options: Options,
  ) =>
  ({
    model,
    camera,
  }: Pick<ViewerEffectContext, "model" | "camera">): ViewerEffect => {
    const assets = new ParticleAssets(graph, models, {
      path: options.modelPath,
      model,
    });
    const ambient = new SourceParticlePlayer(assets, model, () => {});
    const cast = new SourceParticlePlayer(assets, model, () => {});
    const release = new SourceParticlePlayer(assets, model, () => {});
    const projectiles = new SourceParticlePlayer(assets, model, () => {}, 96);
    const impacts = new SourceParticlePlayer(assets, model, () => {});
    if (options.particles && graph.projectiles?.length)
      assets.warnings.add(
        "Projectile preview uses a straight flight path; gameplay homing and hit targets are not simulated",
      );
    const shots = projectilePlayback(graph).map((shot) =>
      Object.assign(shot, {
        emission: new ProjectileEmission(shot.count, shot.interval),
      }),
    );
    const period = shots.length
      ? Math.max(
          options.period,
          ...shots.map(
            (shot) =>
              options.releaseAt +
              shot.count * shot.interval +
              shot.distance / Math.max(1, shot.speed),
          ),
        )
      : options.period;
    let materialMotion: ReturnType<typeof createMaterialMotion> | null = null;
    let elapsed = 0;
    let phase = 0;
    let released = false;
    let closed = false;
    let previousWarnings = "";
    let previousSystems = "";
    const referencedSystems = referencedParticleSystems(graph);
    const resetCast = () => {
      for (const shot of shots) shot.emission.reset();
      cast.reset(options.particles ? graph.castRoots : []);
      released = options.releaseAt <= 0;
      release.reset(options.particles && released ? graph.releaseRoots : []);
    };
    const report = () => {
      if (options.onParticlesInUse) {
        const systems = mergeParticleSystemsInUse([
          referencedSystems,
          ...[ambient, cast, release, projectiles, impacts].map((player) =>
            player.systemsInUse(),
          ),
        ]);
        const key = JSON.stringify(systems);
        if (key !== previousSystems) {
          previousSystems = key;
          options.onParticlesInUse(systems);
        }
      }
      const warnings = [
        ...new Set([
          ...assets.warnings,
          ...ambient.warnings,
          ...cast.warnings,
          ...release.warnings,
          ...projectiles.warnings,
          ...impacts.warnings,
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
        projectiles.reset([]);
        impacts.reset([]);
      },
      update(delta) {
        elapsed += delta;
        phase += delta;
        if (period > 0 && phase >= period) {
          phase %= period;
          resetCast();
        }
        if (!released && phase >= options.releaseAt) {
          released = true;
          if (graph.releaseRoots.length) cast.setRoots([]);
          release.reset(options.particles ? graph.releaseRoots : []);
        }
        if (options.particles && phase >= options.releaseAt) {
          for (const shot of shots)
            shot.emission.update(phase - options.releaseAt, () =>
              projectiles.burst({
                root: shot.path,
                interval: shot.interval,
                count: shot.count,
                speed: shot.speed,
                attachment: shot.attachment,
                distance: shot.distance,
                spawnRadius: shot.spawnRadius,
                onImpact: (position) => {
                  for (const root of shot.hitParticles)
                    impacts.burst({
                      root,
                      interval: 0,
                      count: 1,
                      speed: 0,
                      attachment: "",
                      distance: 0,
                      position,
                    });
                },
              }),
            );
        }
        materialMotion?.update(delta);
        // Fixed steps update simulation; the viewer's final zero-delta call builds buffers once.
        const draw = delta === 0;
        ambient.update(delta, camera, 1, draw);
        cast.update(delta, camera, 1, draw);
        release.update(delta, camera, 1, draw);
        projectiles.update(delta, camera, 1, draw);
        impacts.update(delta, camera, 1, draw);
        if (draw) report();
      },
      dispose() {
        closed = true;
        materialMotion?.dispose();
        ambient.dispose();
        cast.dispose();
        release.dispose();
        projectiles.dispose();
        impacts.dispose();
        assets.dispose();
      },
    };
  };
