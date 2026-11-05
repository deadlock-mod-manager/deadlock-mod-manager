import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { fields, list, str } from "./values";

function property(
  ability: FoundryParticleGraph["ability"],
  name: string,
  fallback: number,
) {
  const properties = fields(fields(ability).m_mapAbilityProperties);
  const value = str(fields(properties[name]).m_strValue);
  const number = Number.parseFloat(value);
  return Number.isFinite(number)
    ? number * (value.trim().endsWith("m") ? 1 / 0.0254 : 1)
    : fallback;
}

export function projectilePlayback(graph: FoundryParticleGraph) {
  const properties = fields(fields(graph.ability).m_mapAbilityProperties);
  const rateName = Object.keys(properties).find(
    (key) =>
      key.endsWith("PerSecond") &&
      `${key.slice(0, -"PerSecond".length)}Count` in properties,
  );
  const stem = rateName?.slice(0, -"PerSecond".length) ?? "Projectile";
  const rate = rateName ? Math.max(0, property(graph.ability, rateName, 0)) : 0;
  const count = Math.round(
    Math.max(1, Math.min(256, property(graph.ability, `${stem}Count`, 1))),
  );
  const range = Math.max(
    32,
    Math.min(8192, property(graph.ability, "AbilityCastRange", 512)),
  );
  const radius = Math.max(
    0,
    Math.min(128, property(graph.ability, `${stem}SpawnRadius`, 0)),
  );
  const attachment =
    graph.castRoots
      .flatMap((root) =>
        list(fields(graph.systems[root]).m_controlPointConfigurations),
      )
      .flatMap((configuration) => list(fields(configuration).m_drivers))
      .map((driver) => str(fields(driver).m_attachmentName))
      .find(Boolean) ?? "";
  return (graph.projectiles ?? []).map((projectile) => ({
    path: projectile.path,
    speed: projectile.speed,
    hitParticles: projectile.hitParticles,
    count,
    interval: rate > 0 ? 1 / Math.min(60, rate) : 0,
    distance: range,
    spawnRadius: radius,
    attachment,
  }));
}

export class ProjectileEmission {
  private emitted = 0;
  constructor(
    private readonly count: number,
    private readonly interval: number,
  ) {}
  reset() {
    this.emitted = 0;
  }
  update(time: number, emit: () => boolean) {
    for (
      let budget = 0;
      budget < 8 &&
      this.emitted < this.count &&
      time + 1e-6 >= this.emitted * this.interval;
      budget++
    ) {
      if (!emit()) break;
      this.emitted++;
    }
  }
}
