/// <reference lib="webworker" />
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";

export interface PackedMesh {
  position: ArrayBuffer;
  normal?: ArrayBuffer;
  index?: ArrayBuffer;
}

interface ParseOk {
  id: number;
  ok: true;
  meshes: PackedMesh[];
}

interface ParseErr {
  id: number;
  ok: false;
  error: string;
}

function copyAttribute(attr: THREE.BufferAttribute): ArrayBuffer {
  const view = attr.array;
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return bytes.slice().buffer;
}

function packGeometry(geometry: THREE.BufferGeometry): PackedMesh {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!position) {
    throw new Error("Mesh has no position attribute.");
  }
  const packed: PackedMesh = { position: copyAttribute(position) };
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (normal) packed.normal = copyAttribute(normal);
  const index = geometry.getIndex();
  if (index) packed.index = copyAttribute(index);
  return packed;
}

function collectMeshes(object: THREE.Object3D, out: PackedMesh[]) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geometry = child.geometry;
      if (!geometry.getAttribute("normal")) {
        geometry.computeVertexNormals();
      }
      out.push(packGeometry(geometry));
    }
  });
}

function parseMeshes(ext: string, buffer: ArrayBuffer): PackedMesh[] {
  const meshes: PackedMesh[] = [];
  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    meshes.push(packGeometry(geometry));
    geometry.dispose();
    return meshes;
  }
  if (ext === "obj") {
    const text = new TextDecoder().decode(buffer);
    const loaded = new OBJLoader().parse(text);
    collectMeshes(loaded, meshes);
    return meshes;
  }
  if (ext === "3mf") {
    const loaded = new ThreeMFLoader().parse(buffer);
    collectMeshes(loaded, meshes);
    return meshes;
  }
  throw new Error("Not a mesh.");
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

function parsedObject(ext: string, buffer: ArrayBuffer): THREE.Object3D {
  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry);
  }
  if (ext === "obj") {
    const text = new TextDecoder().decode(buffer);
    return new OBJLoader().parse(text);
  }
  if (ext === "3mf") {
    return new ThreeMFLoader().parse(buffer);
  }
  throw new Error("Not a mesh.");
}

async function renderThumbnail(
  ext: string,
  buffer: ArrayBuffer,
  colors: { background: string; mesh: string; light: string },
): Promise<ArrayBuffer> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas is unavailable.");
  }
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(256, 256, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.background);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  const material = new THREE.MeshStandardMaterial({
    color: colors.mesh,
    metalness: 0.05,
    roughness: 0.65,
  });
  const object = parsedObject(ext, buffer);
  let meshes = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    meshes += 1;
    child.material = material;
    if (!child.geometry.getAttribute("normal")) child.geometry.computeVertexNormals();
  });
  if (meshes === 0) throw new Error("No mesh geometry found.");
  scene.add(object);
  scene.add(new THREE.AmbientLight(colors.light, 0.65));
  const key = new THREE.DirectionalLight(colors.light, 1.1);
  key.position.set(2, 3, 4);
  scene.add(key);
  fitCamera(camera, object);
  renderer.render(scene, camera);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  renderer.dispose();
  material.dispose();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry?.dispose();
  });
  return blob.arrayBuffer();
}

type WorkerRequest =
  | { kind?: "parse"; id: number; ext: string; buffer: ArrayBuffer }
  | {
      kind: "render";
      id: number;
      ext: string;
      buffer: ArrayBuffer;
      background: string;
      mesh: string;
      light: string;
    };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (data.kind === "render") {
    const { id, ext, buffer, background, mesh, light } = data;
    void renderThumbnail(ext, buffer, { background, mesh, light })
      .then((png) => {
        self.postMessage({ id, ok: true, png }, [png]);
      })
      .catch((err: unknown) => {
        self.postMessage({ id, ok: false, error: String(err) });
      });
    return;
  }
  const { id, ext, buffer } = data;
  try {
    const meshes = parseMeshes(ext, buffer);
    if (meshes.length === 0) {
      throw new Error("No mesh geometry found.");
    }
    const payload: ParseOk = { id, ok: true, meshes };
    const transfers = meshes.flatMap((mesh) => [
      mesh.position,
      ...(mesh.normal ? [mesh.normal] : []),
      ...(mesh.index ? [mesh.index] : []),
    ]);
    self.postMessage(payload, transfers);
  } catch (err) {
    const payload: ParseErr = { id, ok: false, error: String(err) };
    self.postMessage(payload);
  }
};
