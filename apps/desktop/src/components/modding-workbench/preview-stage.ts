import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ParticleAssets,
  type ParticleModelAsset,
} from "@/components/foundry/particles/assets";
import { SourceParticlePlayer } from "@/components/foundry/particles/player";
import { loadPreviewModel } from "@/components/foundry/workbench-model-loader";
import { installAnimatedAlbedo } from "@/lib/animated-albedo";
import { viewerDrawBudget } from "@/components/foundry/viewer-render-budget";
import {
  applySource2DrawState,
  installSource2Color,
  sceneMaterials,
} from "@/components/foundry/source2-material";
import { retainFoundryModel, type PreviewModel } from "@/lib/model-assets";
import { previewPixel, previewPixelHex } from "@/lib/preview-color";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";

interface Callbacks {
  snapshot?: (image: string | null) => void;
  warnings?: (issues: string[]) => void;
}

export class PreviewStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
  callbacks: Callbacks = {};
  private readonly controls: OrbitControls;
  private readonly rig = new THREE.Group();
  private readonly grid = new THREE.GridHelper(10, 20, 0x6d6554, 0x3e3d37);
  private readonly resize: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private visible = true;
  private playing = true;
  private closed = false;
  private frame: number | null = null;
  private readonly drawSlot = viewerDrawBudget.createSlot();
  private previous = performance.now();
  private elapsed = 0;
  private captured = false;
  private generation = 0;
  private ready = false;
  private assets: ParticleAssets | null = null;
  private player: SourceParticlePlayer | null = null;
  private model: THREE.Group | null = null;
  private releaseModel: (() => void) | null = null;
  private load: AbortController | null = null;
  private report = "";
  private reportedAt = 0;

  constructor(
    host: HTMLDivElement,
    private readonly thumbnail = false,
  ) {
    this.camera.position.set(5, 3, 5);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(
      thumbnail ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = !thumbnail;
    this.controls.enabled = !thumbnail;
    this.controls.addEventListener("change", this.invalidate);
    this.rig.scale.setScalar(0.0254);
    this.scene.add(
      this.rig,
      this.grid,
      new THREE.HemisphereLight(0xf4ead4, 0x454342, 2),
    );
    const light = new THREE.DirectionalLight(0xfff3df, 3);
    light.position.set(4, 6, 3);
    this.scene.add(light);
    this.resize = new ResizeObserver(() => {
      const width = Math.max(1, host.clientWidth),
        height = Math.max(1, host.clientHeight);
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.invalidate();
    });
    this.resize.observe(host);
    this.visibility = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      this.previous = performance.now();
      this.invalidate();
    });
    this.visibility.observe(host);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private readonly onVisibility = () => {
    this.previous = performance.now();
    this.invalidate();
  };

  readonly invalidate = () => {
    if (!this.closed && this.frame === null)
      this.frame = requestAnimationFrame(this.render);
  };

  private readonly render = (now: number) => {
    this.frame = null;
    const delta = Math.min(0.05, Math.max(0, (now - this.previous) / 1000));
    this.previous = now;
    if (
      document.hidden ||
      (!this.visible && !this.thumbnail) ||
      (this.thumbnail && this.captured)
    ) {
      this.drawSlot.idle();
      return;
    }
    if (this.ready && this.player) {
      this.scene.updateMatrixWorld(true);
      if (this.thumbnail) {
        const deadline = performance.now() + 4;
        while (this.elapsed < 1 && performance.now() < deadline) {
          this.player.update(1 / 60, this.camera, 1, false);
          this.elapsed += 1 / 60;
        }
        if (this.elapsed < 1) {
          this.drawSlot.idle();
          this.invalidate();
          return;
        }
      } else if (this.playing) {
        this.elapsed += delta;
        if (this.elapsed >= 8) this.restart();
      }
      this.player.update(
        this.thumbnail || !this.playing ? 0 : delta,
        this.camera,
      );
    }
    const moving = this.controls.update();
    if (!this.drawSlot.ready(now)) {
      this.invalidate();
      return;
    }
    this.renderer.render(this.scene, this.camera);
    if (
      this.thumbnail &&
      this.ready &&
      !this.captured &&
      this.callbacks.snapshot
    ) {
      this.captured = true;
      const generation = this.generation;
      const snapshot = this.callbacks.snapshot;
      this.renderer.domElement.toBlob((blob) => {
        if (this.closed || generation !== this.generation) return;
        if (!blob) {
          snapshot(null);
          return;
        }
        const reader = new FileReader();
        reader.addEventListener(
          "load",
          () => {
            if (!this.closed && generation === this.generation)
              snapshot(String(reader.result));
          },
          { once: true },
        );
        reader.addEventListener(
          "error",
          () => {
            if (!this.closed && generation === this.generation) snapshot(null);
          },
          { once: true },
        );
        reader.readAsDataURL(blob);
      }, "image/png");
    }
    if (now - this.reportedAt >= 250 && this.assets && this.player) {
      this.reportedAt = now;
      const issues = [
        ...new Set([...this.assets.warnings, ...this.player.warnings]),
      ];
      const report = issues.join("\n");
      if (report !== this.report) {
        this.report = report;
        this.callbacks.warnings?.(issues);
      }
    }
    if (
      !this.thumbnail &&
      ((this.playing && !!this.player && this.ready) || moving)
    )
      this.invalidate();
  };

  setGraph(graph: FoundryParticleGraph, models: ParticleModelAsset[]) {
    this.generation++;
    this.releaseModel?.();
    this.releaseModel = null;
    const resetCamera = !this.assets || !!this.model;
    this.load?.abort();
    this.load = null;
    if (this.model) {
      this.model.removeFromParent();
      this.model = null;
    }
    this.player?.dispose();
    const previous = this.assets;
    const assets = new ParticleAssets(
      graph,
      models,
      undefined,
      previous ?? undefined,
    );
    this.assets = assets;
    previous?.dispose();
    this.player = new SourceParticlePlayer(assets, this.rig, this.invalidate);
    this.ready = false;
    this.elapsed = 0;
    this.captured = false;
    this.report = "";
    this.callbacks.warnings?.([]);
    this.grid.visible = true;
    if (resetCamera) {
      this.camera.position.set(5, 3, 5);
      this.camera.far = 500;
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 1, 0);
    }
    void assets.ready.then(() => {
      if (this.closed || this.assets !== assets) return;
      this.player?.reset(graph.roots);
      this.ready = true;
      this.previous = performance.now();
      this.invalidate();
    });
    this.invalidate();
  }

  setModel(model: PreviewModel) {
    this.clear();
    const load = new AbortController();
    this.load = load;
    const release = retainFoundryModel(model);
    void loadPreviewModel(model, load.signal, this.thumbnail)
      .then((loaded) => {
        const { scene, source2Textures } = loaded;
        if (this.closed || load.signal.aborted) {
          loaded.dispose();
          return;
        }
        this.model = scene;
        const atlas = installAnimatedAlbedo(scene);
        atlas.update(0);
        this.releaseModel = () => {
          atlas.dispose();
          loaded.dispose();
        };
        for (const material of sceneMaterials(scene)) {
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
          )
            installSource2Color(material, source2Textures);
        }
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              applySource2DrawState(object, material);
          }
        });
        this.scene.add(scene);
        this.grid.visible = false;
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const radius = Math.max(
            0.01,
            box.getSize(new THREE.Vector3()).length() / 2,
          );
          scene.position.sub(center);
          this.controls.target.set(0, 0, 0);
          const distance =
            (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) *
            Math.max(1, 1 / this.camera.aspect);
          this.camera.position
            .set(0.6, 0.3, 1)
            .normalize()
            .multiplyScalar(distance * 1.1);
          this.camera.far = Math.max(500, distance * 4);
          this.camera.updateProjectionMatrix();
        }
        this.ready = true;
        this.invalidate();
      })
      .catch(() => {
        if (!load.signal.aborted && !this.closed)
          this.callbacks.snapshot?.(null);
      })
      .finally(release);
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.previous = performance.now();
    this.invalidate();
  }

  restart() {
    this.elapsed = 0;
    if (this.assets) this.player?.reset(this.assets.graph.roots);
    this.invalidate();
  }

  colorAt(clientX: number, clientY: number) {
    const canvas = this.renderer.domElement;
    const point = previewPixel(
      clientX,
      clientY,
      canvas.getBoundingClientRect(),
      canvas.width,
      canvas.height,
    );
    if (!point) return null;
    this.renderer.render(this.scene, this.camera);
    const gl = this.renderer.getContext();
    const rgba = new Uint8Array(4);
    gl.readPixels(point.x, point.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return gl.getError() === gl.NO_ERROR ? previewPixelHex(rgba) : null;
  }

  clear() {
    this.generation++;
    this.releaseModel?.();
    this.releaseModel = null;
    this.load?.abort();
    this.load = null;
    this.player?.dispose();
    this.player = null;
    this.assets?.dispose();
    this.assets = null;
    if (this.model) {
      this.model.removeFromParent();
      this.model = null;
    }
    this.ready = false;
    this.elapsed = 0;
    this.captured = false;
  }

  dispose() {
    this.closed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.drawSlot.idle();
    this.clear();
    this.resize.disconnect();
    this.visibility.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.controls.dispose();
    this.grid.geometry.dispose();
    const materials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    for (const material of materials) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
