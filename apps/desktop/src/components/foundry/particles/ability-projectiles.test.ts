import { expect, test } from "bun:test";
import { ProjectileEmission, projectilePlayback } from "./ability-projectiles";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";

test("uses an ability's authored swarm count, rate and source-unit spawn radius", () => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: ["channel"],
    releaseRoots: [],
    models: [],
    textures: [],
    attachments: {},
    materials: {},
    warnings: [],
    abilityEffects: [],
    ability: {
      m_mapAbilityProperties: {
        BatCount: { m_strValue: "75" },
        BatPerSecond: { m_strValue: "30" },
        BatSpawnRadius: { m_strValue: "1.5m" },
        AbilityCastRange: { m_strValue: "40m" },
      },
    },
    projectiles: [{ path: "bat", speed: 1800, hitParticles: ["hit"] }],
    systems: {
      channel: {
        m_controlPointConfigurations: [
          { m_drivers: [{ m_attachmentName: "umbrella_top_fx" }] },
        ],
      },
    },
  };
  const [shot] = projectilePlayback(graph);
  expect(shot.count).toBe(75);
  expect(shot.interval).toBeCloseTo(1 / 30);
  expect(shot.spawnRadius).toBeCloseTo(1.5 / 0.0254);
  expect(shot.attachment).toBe("umbrella_top_fx");
});

test("emission is frame-rate independent and does not consume shots before assets are ready", () => {
  for (const fps of [30, 60, 120]) {
    const emission = new ProjectileEmission(75, 1 / 30);
    let count = 0;
    emission.update(0, () => false);
    for (let i = 0; i <= 3 * fps; i++)
      emission.update(i / fps, () => {
        count++;
        return true;
      });
    expect(count).toBe(75);
    emission.reset();
    emission.update(0, () => {
      count++;
      return true;
    });
    expect(count).toBe(76);
  }
});
