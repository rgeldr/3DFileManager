import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";

function cssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) {
    throw new Error(`Missing theme token ${name}`);
  }
  return value;
}

function fitCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
  const direction = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(direction.multiplyScalar(distance * 1.4));
  camera.near = distance / 100;
  camera.far = distance * 20;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export async function renderMeshStill(url: string, ext: string): Promise<Uint8Array> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(256, 256);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cssVar("--viewer-bg"));
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  const material = new THREE.MeshStandardMaterial({
    color: cssVar("--viewer-mesh"),
    metalness: 0.05,
    roughness: 0.65,
  });
  const light = cssVar("--color-accent-contrast");
  scene.add(new THREE.AmbientLight(light, 0.65));
  const key = new THREE.DirectionalLight(light, 1.1);
  key.position.set(2, 3, 4);
  scene.add(key);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Could not read the file for a thumbnail.");
    }
    const buffer = await response.arrayBuffer();
    const root = new THREE.Group();
    if (ext === "stl") {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      root.add(new THREE.Mesh(geometry, material));
    } else if (ext === "obj") {
      const text = new TextDecoder().decode(buffer);
      const loaded = new OBJLoader().parse(text);
      loaded.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = material;
        }
      });
      root.add(loaded);
    } else if (ext === "3mf") {
      const loaded = new ThreeMFLoader().parse(buffer);
      loaded.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = material;
        }
      });
      root.add(loaded);
    } else {
      throw new Error("Not a mesh.");
    }
    scene.add(root);
    fitCamera(camera, root);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => {
      renderer.domElement.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) {
      throw new Error("Thumbnail render failed.");
    }
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    material.dispose();
    renderer.dispose();
  }
}
