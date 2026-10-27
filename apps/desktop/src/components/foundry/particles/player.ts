import * as THREE from "three";
import type { ParticleBurst } from "./types";
import { cp } from "./values";
import type { ParticleValue } from "@/types/generated/ParticleValue";
import { ModelSurface } from "./model-surface";
import { ParticleAttachments } from "./attachments";
import { ParticleSimulation } from "./simulation";
import { ParticleSprites } from "./sprite-renderer";
import { ParticleRibbon } from "./ribbon-renderer";
import { ParticleModels } from "./model-renderer";
import type { ParticleAssets } from "./assets";
import { fields, list, num, scalar, str, type Fields } from "./values";

interface Renderer {
  root: THREE.Group;
  update(camera: THREE.Camera, frame: THREE.Object3D, fade: number): void;
  dispose(): void;
}
class ParticleLights implements Renderer {
  readonly root = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  constructor(
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
  ) {
    for (
      let i = 0;
      i < Math.min(2, num(simulation.definition.m_nMaxParticles, 1));
      i++
    ) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.lights.push(light);
      this.root.add(light);
    }
  }
  update(_camera: THREE.Camera, frame: THREE.Object3D, fade: number) {
    const scale = frame.getWorldScale(new THREE.Vector3()).x;
    for (const [i, light] of this.lights.entries()) {
      const p = this.simulation.particles[i];
      light.visible = !!p;
      if (!p) continue;
      this.simulation.context.particle = p;
      const color = p.vector(6);
      light.color.setRGB(color.x, color.y, color.z);
      light.position.copy(p.vector(0));
      light.distance = Math.max(
        0.01,
        p.values[3] *
          scalar(this.op.m_flRadiusMultiplier, this.simulation.context, 1) *
          scale,
      );
      // Luminous intensity scales with area when a Source-unit effect becomes a miniature.
      light.intensity =
        p.values[7] *
        p.values[16] *
        scalar(this.op.m_flIntensity, this.simulation.context, 1) *
        fade *
        Math.pow(scale / 0.0254, 2);
    }
    this.simulation.context.particle = undefined;
  }
  dispose() {
    this.root.removeFromParent();
    this.root.clear();
  }
}
interface RunningGraph {
  simulation: ParticleSimulation;
  drivers: ParticleValue[];
  renderers: Renderer[];
  motion?: { speed: number; start: THREE.Vector3 | null };
}
export class SourceParticlePlayer {
  readonly root: THREE.Group;
  readonly warnings = new Set<string>();
  private readonly attachments: ParticleAttachments;
  private readonly graphs: RunningGraph[] = [];
  private current: string[] = [];
  private closed = false;
  private loaded = false;
  private surface: ModelSurface | null = null;
  constructor(
    private readonly assets: ParticleAssets,
    private readonly rig: THREE.Object3D,
    private readonly changed: () => void,
  ) {
    this.attachments = new ParticleAttachments(rig, assets.graph.attachments);
    this.root = this.attachments.root;
    void assets.ready.then(() => {
      if (this.closed) return;
      this.loaded = true;
      this.setRoots(this.current);
      changed();
    });
  }
  reset(roots: string[]) {
    for (const graph of this.graphs)
      for (const renderer of graph.renderers) renderer.dispose();
    this.graphs.length = 0;
    this.current = [];
    this.setRoots(roots);
  }
  setRoots(roots: string[]) {
    if (
      roots.length === this.current.length &&
      roots.every((root, i) => root === this.current[i]) &&
      this.graphs.some((graph) => !graph.simulation.stopped)
    )
      return;
    this.current = roots;
    if (!this.loaded) return;
    for (const graph of this.graphs) graph.simulation.stop();
    for (const path of roots) this.start(path);
    this.changed();
  }
  burst(burst: ParticleBurst) {
    if (!this.loaded) return;
    this.start(burst.root, burst);
  }
  private start(path: string, burst?: ParticleBurst) {
    if (this.graphs.length >= 32) {
      this.warnings.add("Active particle graph limit reached");
      return;
    }
    const data = this.assets.graph.systems[path];
    if (!data) {
      this.warnings.add(`Missing particle root: ${path}`);
      return;
    }
    const definition = fields(data),
      simulation = new ParticleSimulation(
        definition,
        this.assets.graph.systems,
      );
    if (
      simulation
        .all()
        .some((node) =>
          list(node.definition.m_Initializers).some(
            (value) => str(fields(value)["_class"]) === "C_INIT_CreateOnModel",
          ),
        )
    ) {
      this.surface ??= new ModelSurface(this.rig, this.root);
      for (const node of simulation.all())
        node.context.surface = () =>
          this.surface?.sample(node.context.random) ?? null;
    }
    const configurations = list(definition.m_controlPointConfigurations).map(
        fields,
      ),
      configuration =
        configurations.find((c) => str(c.m_name) === "preview") ??
        configurations[0];
    const drivers: ParticleValue[] = burst
      ? [{ m_iControlPoint: 0, m_attachmentName: burst.attachment }]
      : list(configuration?.m_drivers);
    if (!drivers.length) drivers.push({ m_iControlPoint: 0 });
    const renderers: Renderer[] = [];
    for (const node of simulation.all())
      for (const value of list(node.definition.m_Renderers)) {
        const op = fields(value),
          name = str(op["_class"]);
        if (op.m_bDisableOperator === true) continue;
        let renderer: Renderer;
        switch (name) {
          case "C_OP_RenderSprites":
          case "C_OP_RenderTrails":
            renderer = new ParticleSprites(op, node, this.assets);
            break;
          case "C_OP_RenderRopes":
            renderer = new ParticleRibbon(op, node, this.assets);
            break;
          case "C_OP_RenderModels":
            renderer = new ParticleModels(op, node, this.assets);
            break;
          case "C_OP_RenderStandardLight":
            renderer = new ParticleLights(op, node);
            break;
          default:
            this.warnings.add(`Unsupported particle renderer: ${name}`);
            continue;
        }
        renderer.root.name = name;
        renderers.push(renderer);
        this.root.add(renderer.root);
      }
    this.graphs.push({
      simulation,
      drivers,
      renderers,
      motion: burst ? { speed: burst.speed, start: null } : undefined,
    });
  }
  update(dt: number, camera: THREE.Camera, fade = 1) {
    for (const graph of this.graphs) {
      this.attachments.update(graph.simulation.controls, graph.drivers);
      if (graph.motion) {
        const point = cp(graph.simulation.context);
        graph.motion.start ??= point.position.clone();
        point.position
          .copy(graph.motion.start)
          .addScaledVector(
            new THREE.Vector3(1, 0, 0),
            graph.simulation.age * graph.motion.speed,
          );
        if (graph.simulation.age > 0.4) graph.simulation.stop();
      }
      const steps = Math.ceil(Math.max(0, dt) / (1 / 60)),
        step = steps > 0 ? dt / steps : 0;
      for (let i = 0; i < steps; i++) graph.simulation.step(step);
      for (const renderer of graph.renderers)
        renderer.update(camera, this.root, fade);
      for (const node of graph.simulation.all())
        for (const name of node.unsupported) this.warnings.add(name);
    }
    for (const warning of this.assets.warnings) this.warnings.add(warning);
    // Ended graphs retain only their authored particle tails.
    for (let i = this.graphs.length - 1; i >= 0; i--) {
      const graph = this.graphs[i];
      if (
        graph.simulation.stopped &&
        graph.simulation.all().every((node) => !node.particles.length)
      ) {
        for (const renderer of graph.renderers) renderer.dispose();
        this.graphs.splice(i, 1);
      }
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const graph of this.graphs)
      for (const renderer of graph.renderers) renderer.dispose();
    this.graphs.length = 0;
    this.attachments.dispose();
  }
}
