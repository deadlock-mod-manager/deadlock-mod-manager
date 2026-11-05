import * as THREE from "three";
import { ParticleSprites } from "./sprite-renderer";
import { fields, list, str, type Fields } from "./values";
import type { ParticleAssets } from "./assets";
import type { ParticleSimulation } from "./simulation";

/** Floor receiver for editor previews; scene-depth projection needs a depth-decal render pass. */
export class ParticleProjected {
  readonly root: THREE.Group;
  private readonly sprites: ParticleSprites;
  constructor(
    op: Fields,
    simulation: ParticleSimulation,
    assets: ParticleAssets,
  ) {
    const path = str(fields(list(op.m_vecProjectedMaterials)[0]).m_hMaterial);
    const material = fields(assets.graph.materials[path]);
    const textures = list(material.m_textureParams).map(fields);
    const color = textures.find(
      (texture) => str(texture.m_name) === "g_tColor",
    );
    assets.warnings.add(
      "Projected particles use the preview floor; mesh and wall depth projection is unavailable",
    );
    this.sprites = new ParticleSprites(
      {
        ...op,
        _class: "C_OP_RenderSprites",
        m_hTexture: str(color?.m_pValue),
        m_nOrientationType: "PARTICLE_ORIENTATION_WORLD_Z_ALIGNED",
      },
      simulation,
      assets,
      true,
    );
    this.root = this.sprites.root;
  }
  update(camera: THREE.Camera, frame: THREE.Object3D, fade: number) {
    this.sprites.update(camera, frame, fade);
  }
  dispose() {
    this.sprites.dispose();
  }
}
