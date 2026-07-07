import { Progress } from "@deadlock-mods/ui/components/progress";
import { CubeIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface FoundryModelViewerProps {
  dataUrl: string;
  label: string;
}

const disposeObject = (root: THREE.Object3D) => {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
};

export const FoundryModelViewer = ({
  dataUrl,
  label,
}: FoundryModelViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setFailed(false);
    setProgress(5);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0d);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
    camera.position.set(0, 1.2, 8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    container.appendChild(renderer.domElement);

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmremGenerator.fromScene(environment);
    scene.environment = environmentMap.texture;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.enablePan = false;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 0.5;
    controls.maxDistance = 500;

    scene.add(new THREE.HemisphereLight(0xe9eef9, 0x242022, 2.6));
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.5);
    keyLight.position.set(2.8, 4.2, 3.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xff4965, 1.1);
    rimLight.position.set(-3.5, 2.4, -2.4);
    scene.add(rimLight);

    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;
    let frame = 0;

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const frameModel = (root: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;

      const center = new THREE.Vector3();
      const sphere = new THREE.Sphere();
      box.getCenter(center);
      box.getBoundingSphere(sphere);
      root.position.sub(center);

      const radius = Math.max(sphere.radius, 1);
      const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      let fitDistance = radius / Math.sin(halfFov);
      if (camera.aspect < 1) {
        fitDistance /= camera.aspect;
      }

      const startDistance = fitDistance * 2.1;
      camera.near = Math.max(startDistance / 2000, 0.01);
      camera.far = Math.max(startDistance * 120, 5000);
      camera.position.set(
        startDistance * 0.18,
        startDistance * 0.08,
        startDistance,
      );
      camera.updateProjectionMatrix();

      controls.target.set(0, 0, 0);
      controls.minDistance = Math.max(radius * 0.12, 0.05);
      controls.maxDistance = Math.max(startDistance * 16, radius * 80);
      controls.update();
    };

    const loader = new GLTFLoader();
    loader.load(
      dataUrl,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        loadedRoot = gltf.scene;
        scene.add(gltf.scene);

        frameModel(gltf.scene);
        setProgress(null);
      },
      (event) => {
        if (event.total > 0) {
          setProgress(Math.min(95, (event.loaded / event.total) * 100));
        }
      },
      () => {
        if (disposed) return;
        setProgress(null);
        setFailed(true);
      },
    );

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObject(loadedRoot);
      }
      environmentMap.dispose();
      pmremGenerator.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [dataUrl]);

  return (
    <div className='relative h-full w-full overflow-hidden rounded-lg border bg-background'>
      <div ref={containerRef} className='h-full w-full' title={label} />
      {progress !== null && (
        <div className='absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/90 to-transparent p-4'>
          <div className='flex items-center justify-between text-muted-foreground text-xs'>
            <span>{t("foundry.preview.loading")}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}
      {failed && (
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground'>
          <CubeIcon className='h-14 w-14 opacity-40' weight='duotone' />
          <p className='text-sm'>{t("foundry.preview.modelDecodeFailed")}</p>
        </div>
      )}
    </div>
  );
};
