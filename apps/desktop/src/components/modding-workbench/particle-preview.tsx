import { Button } from "@deadlock-mods/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParticleAssets } from "@/components/foundry/particles/assets";
import { SourceParticlePlayer } from "@/components/foundry/particles/player";
import {
  useSourceParticles,
  type ParticleDraftSources,
} from "@/hooks/use-source-particles";
import type { PreviewSource } from "@/lib/preview-animation";

const NO_EXTRA_ROOTS: string[] = [];

export function ParticlePreview({
  source,
  drafts,
}: {
  source: PreviewSource;
  drafts?: ParticleDraftSources;
}) {
  const { t } = useTranslation();
  const { graph, models } = useSourceParticles(
    source,
    null,
    NO_EXTRA_ROOTS,
    drafts,
  );
  const host = useRef<HTMLDivElement>(null);
  const running = useRef(true);
  const restart = useRef(() => {});
  const [playing, setPlaying] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    const element = host.current;
    if (!element || !graph.data) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
    camera.position.set(5, 3, 5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      t("workbenchExplorer.particleCanvas"),
    );
    element.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    const rig = new THREE.Group();
    rig.scale.setScalar(0.0254);
    scene.add(rig);
    scene.add(new THREE.HemisphereLight(0xf4ead4, 0x454342, 2));
    const light = new THREE.DirectionalLight(0xfff3df, 3);
    light.position.set(4, 6, 3);
    scene.add(light);
    const grid = new THREE.GridHelper(10, 20, 0x6d6554, 0x3e3d37);
    scene.add(grid);
    const assets = new ParticleAssets(graph.data, models);
    const player = new SourceParticlePlayer(assets, rig, () => {});
    player.reset(graph.data.roots);
    let elapsed = 0;
    restart.current = () => {
      elapsed = 0;
      player.reset(assets.graph.roots);
    };
    const observer = new ResizeObserver(() => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(element);
    let previous = performance.now();
    let report = "";
    renderer.setAnimationLoop((now) => {
      const delta = running.current
        ? Math.min(0.05, (now - previous) / 1000)
        : 0;
      previous = now;
      elapsed += delta;
      if (elapsed >= 8) restart.current();
      scene.updateMatrixWorld(true);
      player.update(delta, camera);
      controls.update();
      renderer.render(scene, camera);
      const issues = [...new Set([...assets.warnings, ...player.warnings])];
      if (issues.join("\n") !== report) {
        report = issues.join("\n");
        setWarnings(issues);
      }
    });
    return () => {
      renderer.setAnimationLoop(null);
      restart.current = () => {};
      observer.disconnect();
      controls.dispose();
      player.dispose();
      assets.dispose();
      grid.geometry.dispose();
      for (const material of Array.isArray(grid.material)
        ? grid.material
        : [grid.material])
        material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [graph.data, models, t]);
  if (!graph.data)
    return (
      <p
        role={graph.error ? "alert" : "status"}
        className='p-4 text-sm text-muted-foreground'>
        {graph.error?.message ?? t("common.loading")}
      </p>
    );
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div ref={host} className='min-h-40 flex-1 overflow-hidden bg-muted/20' />
      <div className='flex gap-2 border-t p-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            running.current = !playing;
            setPlaying(!playing);
          }}>
          {t(playing ? "modelPreview.pause" : "modelPreview.play")}
        </Button>
        <Button size='sm' variant='outline' onClick={() => restart.current()}>
          {t("modelPreview.restart")}
        </Button>
      </div>
      <p className='px-2 pb-2 text-xs text-muted-foreground'>
        {t("workbenchExplorer.particlePreviewHint")}
      </p>
      {warnings.length ? (
        <details className='max-h-32 overflow-auto border-t p-2 text-xs text-muted-foreground'>
          <summary>{t("modelPreview.effectsLimited")}</summary>
          {warnings.map((warning) => (
            <p key={warning} className='break-words pt-1'>
              {warning}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
