import { expect, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";
import { ParticleModels } from "./model-renderer";
import { particleModelTransform } from "./model-transform";
import { ParticleSimulation } from "./simulation";
import { Particle } from "./values";

test("captures the owner's skinned pose for an animated model afterimage", () => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    attachments: {},
    textures: [],
    models: [],
    materials: {},
    warnings: [],
  };
  const owner = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(new Uint16Array(12), 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial(),
  );
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  const outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  outline.userData.previewOutline = true;
  mesh.add(outline);
  geometry.computeBoundingBox();
  owner.add(mesh);
  const assets = new ParticleAssets(graph, [], {
    path: "owner.vmdl_c",
    model: owner,
  });
  const raw = new THREE.Group();
  raw.add(new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial()));
  assets.models.set("owner.vmdl", raw);
  const simulation = new ParticleSimulation({}, {});
  const first = new Particle(1, 0, new THREE.Vector3(1, 1, 1), 1, 1);
  first.values[7] = 0.3;
  simulation.particles.push(first);
  const renderer = new ParticleModels(
    {
      m_ModelList: [{ m_model: "owner.vmdl" }],
      m_bAnimated: true,
      m_bManualAnimFrame: true,
    },
    simulation,
    assets,
  );
  bone.position.y = 2;
  owner.updateMatrixWorld(true);
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  const rendered: THREE.Mesh[] = [];
  renderer.root.traverse((object) => {
    if (object instanceof THREE.Mesh) rendered.push(object);
  });
  expect(rendered[0].geometry.getAttribute("position").getZ(0)).toBeCloseTo(2);
  expect(rendered).toHaveLength(1);
  expect(rendered[0].geometry.boundingBox?.max.z).toBeCloseTo(3);
  const material = rendered[0].material;
  if (Array.isArray(material)) throw Error("Expected a single pose material");
  expect(material.transparent).toBe(true);
  expect(material.opacity).toBeCloseTo(0.3);
  bone.position.y = 4;
  owner.updateMatrixWorld(true);
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  expect(rendered[0].geometry.getAttribute("position").getZ(0)).toBeCloseTo(2);
  let poseDisposed = false;
  rendered[0].geometry.addEventListener("dispose", () => {
    poseDisposed = true;
  });
  simulation.particles.length = 0;
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  expect(poseDisposed).toBe(true);
  expect(rendered[0].parent?.parent).toBeNull();
  renderer.dispose();
  assets.dispose();
  geometry.dispose();
  mesh.material.dispose();
  outline.material.dispose();
  mesh.skeleton.dispose();
});

test("keeps pitched model particles upright in their normal frame", () => {
  const simulation = new ParticleSimulation({}, {});
  const particle = new Particle(0, 0, new THREE.Vector3(1, 1, 1), 1, 1);
  particle.values[20] = Math.PI / 2;
  const matrix = particleModelTransform({}, particle, simulation.context);
  const up = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
  expect(up.x).toBeCloseTo(0);
  expect(up.y).toBeCloseTo(0);
  expect(up.z).toBeCloseTo(1);
});

test("keeps particle model textures and disposes only its material copies", () => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    attachments: {},
    textures: [],
    models: [],
    materials: {},
    warnings: [],
  };
  const assets = new ParticleAssets(graph, []);
  const texture = new THREE.Texture();
  const original = new THREE.MeshStandardMaterial({ map: texture });
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), original));
  assets.models.set("dagger.vmdl", model);
  let originalDisposed = false;
  original.addEventListener("dispose", () => {
    originalDisposed = true;
  });
  const simulation = new ParticleSimulation({}, {});
  const particle = new Particle(0, 0, new THREE.Vector3(1, 0.5, 0.25), 1, 1);
  particle.values[7] = 0.3;
  simulation.particles.push(particle);
  const renderer = new ParticleModels(
    {
      m_ModelList: [{ m_model: "dagger.vmdl" }],
      m_flAlphaScale: 0.5,
      m_nColorBlendType: "PARTICLE_COLOR_BLEND_MOD2X",
    },
    simulation,
    assets,
  );
  const mesh = renderer.root.children[0];
  expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  if (!(mesh instanceof THREE.InstancedMesh))
    throw Error("Missing particle mesh");
  const material = mesh.material;
  expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
  if (!(material instanceof THREE.MeshStandardMaterial))
    throw Error("Missing model material");
  expect(material).not.toBe(original);
  expect(material.map).toBe(texture);
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  expect(mesh.geometry.getAttribute("particleModelAlpha").getX(0)).toBeCloseTo(
    0.15,
  );
  const tint = new THREE.Color();
  mesh.getColorAt(0, tint);
  expect(tint.r).toBeCloseTo(1);
  expect(tint.g).toBeCloseTo(1);
  expect(tint.b).toBeCloseTo(0.5);
  let cloneDisposed = false;
  material.addEventListener("dispose", () => {
    cloneDisposed = true;
  });
  renderer.dispose();
  expect(cloneDisposed).toBe(true);
  expect(originalDisposed).toBe(false);
  assets.dispose();
  expect(originalDisposed).toBe(true);
});
