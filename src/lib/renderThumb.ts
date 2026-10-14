import * as THREE from "three";
import { debugLog } from "../debugLog";
import { parseMeshInWorker, renderMeshInWorker } from "./meshParseClient";
import type { PackedMesh } from "../workers/meshParse.worker";

export const MESH_BYTE_LIMIT = 150 * 1024 * 1024;

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

let sharedRenderer: THREE.WebGLRenderer | null = null;
let renderQueue: Promise<void> = Promise.resolve();

function enqueueRender<T>(work: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(work, work);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function rendererForThumbs(): THREE.WebGLRenderer {
  if (sharedRenderer && !sharedRenderer.getContext().isContextLost()) return sharedRenderer;
  sharedRenderer?.dispose();
  sharedRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  sharedRenderer.setSize(256, 256);
  return sharedRenderer;
}

function groupFromPackedMeshes(meshes: PackedMesh[], material: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  for (const mesh of meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.position), 3));
    if (mesh.normal) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(mesh.normal), 3));
    }
    if (mesh.index) {
      const index = mesh.index.byteLength % 4 === 0
        ? new Uint32Array(mesh.index)
        : new Uint16Array(mesh.index);
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    } else if (!mesh.normal) {
      geometry.computeVertexNormals();
    }
    root.add(new THREE.Mesh(geometry, material));
  }
  return root;
}

function disposeMeshTree(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
  });
}

async function renderMeshStillInner(url: string, ext: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not read the file for a thumbnail.");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MESH_BYTE_LIMIT) {
    throw new Error("Mesh is over the thumbnail size limit.");
  }
  const started = performance.now();
  const thread = typeof OffscreenCanvas === "undefined" ? "main" : "worker";
  debugLog("thumb-parse-start", { ext, bytes: buffer.byteLength, thread });
  try {
    const png = thread === "worker"
      ? await renderMeshInWorker(ext, buffer, {
          background: cssVar("--viewer-bg"),
          mesh: cssVar("--viewer-mesh"),
          light: cssVar("--color-accent-contrast"),
        })
      : await enqueueRender(() => renderOnMainThread(buffer, ext));
    debugLog("thumb-parse-end", { ext, ms: Math.round(performance.now() - started), thread });
    return png;
  } catch (err) {
    debugLog("thumb-parse-fail", { ext, ms: Math.round(performance.now() - started), error: String(err), thread });
    throw err;
  }
}

async function renderOnMainThread(buffer: ArrayBuffer, ext: string): Promise<Uint8Array> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const renderer = rendererForThumbs();
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

  let parsed: THREE.Group | null = null;
  try {
    const meshes = await parseMeshInWorker(ext, buffer);
    parsed = groupFromPackedMeshes(meshes, material);
    scene.add(parsed);
    fitCamera(camera, parsed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => {
      renderer.domElement.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) {
      throw new Error("Thumbnail render failed.");
    }
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    if (parsed) disposeMeshTree(parsed);
    material.dispose();
    scene.clear();
  }
}

export function renderMeshStill(url: string, ext: string): Promise<Uint8Array> {
  return enqueueRender(() => renderMeshStillInner(url, ext));
}
