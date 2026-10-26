import * as THREE from "three";

const LOOK = {
  /** Top and bottom of the backdrop gradient. */
  backdrop: ["#16171b", "#0a0b0d"],
  sky: 0xe9eef9,
  ground: 0x242022,
  ambient: 2.4,
  key: { color: 0xfff1dc, intensity: 2.6, position: [2.8, 4.2, 3.6] },
  rim: { color: 0xff4965, intensity: 1.2, position: [-3.5, 2.4, -2.4] },
  floor: "rgba(231, 213, 163, 0.10)",
} as const;

const gradientTexture = (stops: string[], radial: boolean) => {
  const size = radial ? 256 : 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = radial ? size : 256;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = radial
      ? context.createRadialGradient(
          size / 2,
          size / 2,
          0,
          size / 2,
          size / 2,
          size / 2,
        )
      : context.createLinearGradient(0, 0, 0, canvas.height);
    stops.forEach((color, index) =>
      gradient.addColorStop(index / (stops.length - 1), color),
    );
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const createViewerScene = (scene: THREE.Scene) => {
  const hemisphere = new THREE.HemisphereLight(
    LOOK.sky,
    LOOK.ground,
    LOOK.ambient,
  );
  const key = new THREE.DirectionalLight(LOOK.key.color, LOOK.key.intensity);
  key.position.set(...LOOK.key.position);
  const rim = new THREE.DirectionalLight(LOOK.rim.color, LOOK.rim.intensity);
  rim.position.set(...LOOK.rim.position);
  scene.add(hemisphere, key, rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      map: gradientTexture([LOOK.floor, "rgba(0, 0, 0, 0)"], true),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -1;
  floor.visible = false;
  scene.add(floor);
  const backdrop = gradientTexture([...LOOK.backdrop], false);
  scene.background = backdrop;
  let customBackdrop: THREE.CanvasTexture | null = null;
  let customImage: HTMLCanvasElement | null = null;
  let viewportAspect = 1;

  const cropBackground = () => {
    if (!customBackdrop || !customImage) return;
    const imageAspect = customImage.width / customImage.height;
    const width = Math.min(1, viewportAspect / imageAspect);
    const height = Math.min(1, imageAspect / viewportAspect);
    customBackdrop.repeat.set(width, height);
    customBackdrop.offset.set((1 - width) / 2, (1 - height) / 2);
  };

  const setBackground = (image: HTMLCanvasElement | null) => {
    if (customImage === image) return;
    customBackdrop?.dispose();
    customImage = image;
    customBackdrop = image ? new THREE.CanvasTexture(image) : null;
    if (customBackdrop) customBackdrop.colorSpace = THREE.SRGBColorSpace;
    cropBackground();
    scene.background = customBackdrop ?? backdrop;
  };

  const resize = (width: number, height: number) => {
    viewportAspect = width / Math.max(height, 1);
    cropBackground();
  };

  /** Put the floor glow under a model framed at the origin. */
  const placeFloor = (box: THREE.Box3) => {
    const size = box.getSize(new THREE.Vector3());
    floor.position.set(0, -size.y / 2, 0);
    floor.scale.setScalar(Math.max(size.x, size.z) * 1.4);
    floor.visible = true;
  };

  const dispose = () => {
    scene.remove(hemisphere, key, rim, floor);
    floor.geometry.dispose();
    floor.material.map?.dispose();
    floor.material.dispose();
    backdrop.dispose();
    customBackdrop?.dispose();
  };

  return { placeFloor, setBackground, resize, dispose };
};
