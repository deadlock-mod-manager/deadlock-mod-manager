import * as THREE from "three";
import { z } from "zod";

/** `material.userData.outline`, written by our GLB exporter's material extras. */
const outlineExtras = z.object({
  tint: z.tuple([z.number(), z.number(), z.number()]).nullable(),
});

const OUTLINE_PIXELS = 1.6;
/** Solid outline tints are read as a shaded edge, not a bright halo. */
const OUTLINE_TINT_SHADE = 0.35;
/** How much of the surface colour an untinted outline keeps. */
const UNTINTED_SHADE = 0.22;

const outlineOf = (material: THREE.Material) => {
  const parsed = outlineExtras.safeParse(material.userData.outline);
  return parsed.success ? parsed.data : null;
};

/**
 * Deadlock's toon silhouette: a back-face shell around each NPR material,
 * pushed out along the skinned normal by a fixed number of screen pixels so it
 * keeps its weight at any zoom and follows every animated pose.
 */
export const attachNprOutlines = (root: THREE.Object3D) => {
  const width = { value: 0 };
  const shells: THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  const masked: {
    material: THREE.Material;
    write: boolean;
    ref: number;
    func: THREE.StencilFunc;
    zpass: THREE.StencilOp;
  }[] = [];
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    const source = mesh.material;
    if (
      Array.isArray(source) ||
      source.transparent ||
      source.alphaTest > 0 ||
      !mesh.geometry.getAttribute("normal")
    )
      continue;
    const outline = outlineOf(source);
    if (!outline) continue;
    const map =
      source instanceof THREE.MeshStandardMaterial ? source.map : null;
    masked.push({
      material: source,
      write: source.stencilWrite,
      ref: source.stencilRef,
      func: source.stencilFunc,
      zpass: source.stencilZPass,
    });
    source.stencilWrite = true;
    source.stencilRef = 1;
    source.stencilFunc = THREE.AlwaysStencilFunc;
    source.stencilZPass = THREE.ReplaceStencilOp;
    const material = new THREE.MeshBasicMaterial({
      color: outline.tint
        ? new THREE.Color(...outline.tint).multiplyScalar(OUTLINE_TINT_SHADE)
        : new THREE.Color(UNTINTED_SHADE, UNTINTED_SHADE, UNTINTED_SHADE),
      map: outline.tint ? null : map,
      side: THREE.BackSide,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOutlineWidth = width;
      shader.vertexShader =
        `uniform float uOutlineWidth;\n${shader.vertexShader}`.replace(
          "#include <project_vertex>",
          `#include <project_vertex>
        // Sit the shell a little behind the surface so it only shows past the
        // silhouette, never through creases like eye sockets or folds.
        float outlineViewWidth = uOutlineWidth * -mvPosition.z / projectionMatrix[1][1];
        vec4 pushed = mvPosition;
        pushed.z -= outlineViewWidth * 6.0;
        gl_Position = projectionMatrix * pushed;
        vec4 outlineNormal = projectionMatrix * modelViewMatrix * vec4(objectNormal, 0.0);
        if (dot(outlineNormal.xy, outlineNormal.xy) > 0.0) {
          gl_Position.xy += normalize(outlineNormal.xy) * uOutlineWidth * gl_Position.w;
        }`,
        );
    };
    const shell = new THREE.SkinnedMesh(mesh.geometry, material);
    shell.name = `${mesh.name} outline`;
    shell.userData.previewOutline = true;
    shell.bind(mesh.skeleton, mesh.bindMatrix);
    shell.frustumCulled = false;
    // The silhouette cannot paint over pixels already occupied by the model.
    shell.renderOrder = 1;
    mesh.add(shell);
    shells.push(shell);
  }
  return {
    /** Keep the outline a constant pixel width as the viewport resizes. */
    setViewportHeight(height: number) {
      // Clip space spans 2 units across the viewport's CSS height.
      width.value = (OUTLINE_PIXELS * 2) / Math.max(height, 1);
    },
    setVisible(visible: boolean) {
      for (const shell of shells) shell.visible = visible;
    },
    dispose() {
      for (const { material, write, ref, func, zpass } of masked) {
        material.stencilWrite = write;
        material.stencilRef = ref;
        material.stencilFunc = func;
        material.stencilZPass = zpass;
      }
      for (const shell of shells) {
        shell.removeFromParent();
        // The geometry and skeleton belong to the source mesh.
        shell.material.dispose();
      }
    },
  };
};
