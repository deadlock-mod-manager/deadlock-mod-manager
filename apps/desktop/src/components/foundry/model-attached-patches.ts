import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  ModelPatchEntry,
  ModelPatchImage,
  ModelPatchRuntime,
} from "@/lib/model-patch-runtime";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import {
  createModelPatchGeometry,
  modelPatchFrames,
  modelPatchPose,
} from "@/lib/model-patch-geometry";
import { fitModelPatchContour } from "@/lib/model-patch-contour";
import { modelPaintFrameAt } from "@/lib/model-paint-animation";

interface PatchRecord {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  texture: THREE.DataTexture;
  entry: ModelPatchEntry;
  shape: string;
  pixels: string;
  image: ModelPatchImage | undefined;
  frames: ReturnType<typeof modelPatchFrames>;
  frame: number;
  started: number;
}

function remove(record: PatchRecord) {
  record.mesh.removeFromParent();
  record.mesh.geometry.dispose();
  record.mesh.material.dispose();
  record.texture.dispose();
}

function visible(object: THREE.Object3D) {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  )
    if (!current.visible) return false;
  return true;
}

function anchor(root: THREE.Object3D, hit: THREE.Intersection<THREE.Mesh>) {
  if (!(hit.object instanceof THREE.SkinnedMesh) || !hit.face) return root;
  const mesh = hit.object,
    skin = mesh.geometry.getAttribute("skinIndex"),
    weights = mesh.geometry.getAttribute("skinWeight");
  if (!skin || !weights) return root;
  const vertex = new THREE.Vector3();
  let closest = hit.face.a,
    distance = Infinity;
  for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
    mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
    const next = vertex.distanceToSquared(hit.point);
    if (next < distance) {
      closest = index;
      distance = next;
    }
  }
  let slot = 0;
  for (let i = 1; i < 4; i++)
    if (weights.getComponent(closest, i) > weights.getComponent(closest, slot))
      slot = i;
  return mesh.skeleton.bones[skin.getComponent(closest, slot)] ?? root;
}

export function installModelAttachedPatches(
  root: THREE.Object3D,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  orbit: OrbitControls,
  dirty: () => void,
) {
  const records = new Map<string, PatchRecord>(),
    bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if (object instanceof THREE.Bone) bones.set(object.name, object);
  });
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSpace("local");
  gizmo.setSize(0.8);
  const helper = gizmo.getHelper();
  scene.add(helper);
  helper.visible = false;
  let runtime: ModelPatchRuntime | null = null,
    previous: ModelPatchRuntime | null = null,
    dragging = false;
  const changed = () => dirty();
  gizmo.addEventListener("change", changed);
  const drag = () => {
    dragging = gizmo.dragging;
    orbit.enabled = !dragging;
    runtime?.onManipulating(dragging);
    if (!dragging && runtime?.selection?.kind === "selected") {
      const record = records.get(runtime.selection.id);
      if (record) {
        const p = record.mesh;
        const position: [number, number, number] = [
          p.position.x,
          p.position.y,
          p.position.z,
        ];
        const rotation: [number, number, number, number] = [
          p.quaternion.x,
          p.quaternion.y,
          p.quaternion.z,
          p.quaternion.w,
        ];
        const patch: ModdingModelPatch = {
          ...record.entry.patch,
          position,
          rotation,
          size: [
            Math.max(
              0.01,
              Math.min(1000, record.entry.patch.size[0] * Math.abs(p.scale.x)),
            ),
            Math.max(
              0.01,
              Math.min(1000, record.entry.patch.size[1] * Math.abs(p.scale.y)),
            ),
          ],
        };
        const parent = record.mesh.parent;
        runtime.onChange(
          record.entry.material,
          parent
            ? fitModelPatchContour(
                root,
                record.entry.material,
                patch,
                parent.matrixWorld,
              )
            : patch,
        );
        p.scale.set(1, 1, 1);
      }
    }
    dirty();
  };
  gizmo.addEventListener("dragging-changed", drag);
  let lastFit: ModelPatchRuntime["fitRequest"] = null;
  let down: { x: number; y: number; pointer: number } | null = null;
  const start = (event: PointerEvent) => {
    if (runtime?.selection?.kind !== "placing" || event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    orbit.enabled = false;
    event.stopImmediatePropagation();
    canvas.setPointerCapture(event.pointerId);
  };
  const end = (event: PointerEvent) => {
    const began = down;
    down = null;
    if (!began) return;
    orbit.enabled = true;
    event.stopImmediatePropagation();
    if (canvas.hasPointerCapture(began.pointer))
      canvas.releasePointerCapture(began.pointer);
    const selected = runtime?.selection;
    if (
      selected?.kind !== "placing" ||
      Math.hypot(event.clientX - began.x, event.clientY - began.y) > 5
    )
      return;
    const rect = canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    root.updateMatrixWorld(true);
    const surfaces: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object.userData.attachedPatch ||
        object.userData.previewOutline ||
        !visible(object)
      )
        return;
      if (
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).some(
          (material) =>
            material.visible &&
            material.userData.sourceMaterial === selected.material,
        )
      )
        surfaces.push(object);
    });
    const hit = ray.intersectObjects<THREE.Mesh>(surfaces, false)[0];
    if (!hit?.face) return;
    const parent = anchor(root, hit);
    const a = hit.object
      .getVertexPosition(hit.face.a, new THREE.Vector3())
      .applyMatrix4(hit.object.matrixWorld);
    const b = hit.object
      .getVertexPosition(hit.face.b, new THREE.Vector3())
      .applyMatrix4(hit.object.matrixWorld);
    const c = hit.object
      .getVertexPosition(hit.face.c, new THREE.Vector3())
      .applyMatrix4(hit.object.matrixWorld);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    if (normal.dot(ray.ray.direction) > 0) normal.negate();
    const placed = {
      ...selected.patch,
      bone: parent === root ? "" : parent.name,
      ...modelPatchPose(hit.point, normal, parent.matrixWorld),
    };
    runtime?.onPlace(
      selected.material,
      fitModelPatchContour(root, selected.material, placed, parent.matrixWorld),
    );
    dirty();
  };
  const cancel = () => {
    down = null;
    orbit.enabled = true;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !runtime?.selection) return;
    event.preventDefault();
    if (gizmo.dragging) {
      gizmo.reset();
      gizmo.pointerUp(null);
    }
    cancel();
    runtime.onCancel();
    dirty();
  };
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("pointerdown", start, true);
  canvas.addEventListener("pointerup", end, true);
  canvas.addEventListener("pointercancel", cancel);

  return {
    update(next: ModelPatchRuntime | null, now: number) {
      runtime = next;
      let changed = false;
      if (next !== previous && !dragging) {
        previous = next;
        changed = true;
        const entries = next?.entries ?? [];
        const present = new Set(entries.map((e) => e.patch.id));
        for (const [id, record] of records)
          if (!present.has(id)) {
            if (gizmo.object === record.mesh) gizmo.detach();
            remove(record);
            records.delete(id);
          }
        for (const entry of entries) {
          const p = entry.patch,
            image = next?.images.get(p.image);
          const shape = JSON.stringify([
            p.shape,
            p.size,
            p.curvature,
            p.thickness,
            p.offset,
            p.contour,
            p.conformity,
          ]);
          const pixels = JSON.stringify([p.background, p.crop]);
          let record = records.get(p.id);
          if (!record) {
            const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            texture.generateMipmaps = false;
            texture.minFilter = texture.magFilter = THREE.LinearFilter;
            const material = new THREE.MeshStandardMaterial({
              map: texture,
              metalness: 0,
              roughness: p.roughness,
              alphaTest: 0.1,
              emissive: new THREE.Color(1, 1, 1),
              emissiveMap: texture,
              emissiveIntensity: p.glow,
            });
            const mesh = new THREE.Mesh(createModelPatchGeometry(p), material);
            mesh.name = `dmm-patch-${p.id}`;
            mesh.userData.attachedPatch = true;
            record = {
              mesh,
              texture,
              entry,
              shape,
              pixels: "",
              image: undefined,
              frames: [],
              frame: -1,
              started: now,
            };
            records.set(p.id, record);
          }
          if (record.shape !== shape) {
            record.mesh.geometry.dispose();
            record.mesh.geometry = createModelPatchGeometry(p);
            record.shape = shape;
          }
          const parent = p.bone ? bones.get(p.bone) : root;
          record.mesh.visible = !entry.hidden && Boolean(parent);
          if (parent && record.mesh.parent !== parent) parent.add(record.mesh);
          record.mesh.position.fromArray(p.position);
          record.mesh.quaternion.fromArray(p.rotation);
          record.mesh.scale.set(1, 1, 1);
          record.mesh.material.roughness = p.roughness;
          record.mesh.material.emissiveIntensity = p.glow;
          if (record.image !== image || record.pixels !== pixels) {
            record.frames = image ? modelPatchFrames(image.frames, p) : [];
            record.image = image;
            record.pixels = pixels;
            record.frame = -1;
          }
          record.entry = entry;
        }
        const selection = next?.selection,
          selected =
            selection?.kind === "selected"
              ? records.get(selection.id)
              : undefined;
        if (
          selected &&
          selection?.kind === "selected" &&
          selected.mesh.visible
        ) {
          if (gizmo.object !== selected.mesh) gizmo.attach(selected.mesh);
          gizmo.setMode(selection.mode);
          gizmo.showZ = selection.mode !== "scale";
          helper.visible = true;
        } else {
          gizmo.detach();
          helper.visible = false;
        }
        canvas.style.cursor = selection?.kind === "placing" ? "crosshair" : "";
        if (next?.fitRequest && next.fitRequest !== lastFit) {
          lastFit = next.fitRequest;
          const record = records.get(next.fitRequest.id);
          if (record?.mesh.parent)
            next.onChange(
              record.entry.material,
              fitModelPatchContour(
                root,
                record.entry.material,
                record.entry.patch,
                record.mesh.parent.matrixWorld,
              ),
            );
        }
      }
      for (const record of records.values()) {
        if (!record.frames.length || !record.mesh.visible) continue;
        const frameIndex = modelPaintFrameAt(
          { frames: record.frames, plays: record.image?.plays ?? 0 },
          (now - record.started) / 1000,
        );
        if (record.frame === frameIndex) continue;
        const frame = record.frames[frameIndex];
        if (
          record.texture.image.width !== frame.width ||
          record.texture.image.height !== frame.height
        )
          record.texture.dispose();
        record.texture.image = {
          width: frame.width,
          height: frame.height,
          data: frame.rgba,
        };
        record.texture.needsUpdate = true;
        record.frame = frameIndex;
        changed = true;
      }
      return changed;
    },
    dispose() {
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("pointerdown", start, true);
      canvas.removeEventListener("pointerup", end, true);
      canvas.removeEventListener("pointercancel", cancel);
      gizmo.removeEventListener("change", changed);
      gizmo.removeEventListener("dragging-changed", drag);
      gizmo.detach();
      gizmo.dispose();
      helper.removeFromParent();
      for (const record of records.values()) remove(record);
      orbit.enabled = true;
      canvas.style.cursor = "";
    },
  };
}
