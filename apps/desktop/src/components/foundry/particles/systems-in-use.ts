import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { fields, list, str } from "./values";
import type { ParticleValue } from "@/types/generated/ParticleValue";
import type { ParticleSimulation } from "./simulation";

export interface ParticleSystemInUse {
  path: string;
  limited: boolean;
  active: boolean;
  missing: boolean;
}

export function mergeParticleSystemsInUse(
  groups: readonly (readonly ParticleSystemInUse[])[],
): ParticleSystemInUse[] {
  const systems = new Map<string, ParticleSystemInUse>();
  for (const group of groups)
    for (const system of group) {
      const previous = systems.get(system.path);
      systems.set(system.path, {
        path: system.path,
        active: system.active || (previous?.active ?? false),
        missing: system.missing || (previous?.missing ?? false),
        limited: system.limited || (previous?.limited ?? false),
      });
    }
  return [...systems.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function particleSystemsInUse(
  roots: readonly ParticleSimulation[],
  definitions: Readonly<Record<string, ParticleValue | undefined>>,
): ParticleSystemInUse[] {
  const paths = new Map(
    Object.entries(definitions).map(([path, definition]) => [definition, path]),
  );
  const systems: ParticleSystemInUse[] = [];
  function visit(node: ParticleSimulation) {
    const path = paths.get(node.definition);
    if (path && (!node.stopped || node.particles.length > 0))
      systems.push({
        path,
        limited: node.unsupported.size > 0,
        active: node.particles.length > 0,
        missing: false,
      });
    for (const child of node.children)
      if (child.simulation.age > 0) visit(child.simulation);
  }
  for (const root of roots) visit(root);
  return mergeParticleSystemsInUse([systems]);
}

export function referencedParticleSystems(
  graph: Pick<FoundryParticleGraph, "roots" | "systems">,
): ParticleSystemInUse[] {
  const references = new Set([
    ...graph.roots,
    ...Object.keys(graph.systems),
    ...Object.values(graph.systems).flatMap((system) =>
      list(fields(system).m_Children)
        .map((child) => str(fields(child).m_ChildRef))
        .filter(Boolean),
    ),
  ]);
  return [...references].map((path) => ({
    path,
    active: false,
    limited: false,
    missing: !graph.systems[path],
  }));
}
