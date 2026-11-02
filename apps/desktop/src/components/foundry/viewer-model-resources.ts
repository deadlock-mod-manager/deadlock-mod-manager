import * as THREE from "three";

export const disposeObject = (root: THREE.Object3D) => {
  const textures = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          for (const texture of [
            material.map,
            material.normalMap,
            material.roughnessMap,
            material.metalnessMap,
            material.aoMap,
            material.emissiveMap,
          ]) {
            if (texture) textures.add(texture);
          }
        }
        material.dispose();
      }
      if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    }
  });
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    texture.dispose();
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      bitmaps.add(image);
    }
  }
  for (const bitmap of bitmaps) bitmap.close();
};
