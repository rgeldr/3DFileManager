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

self.onmessage = (event: MessageEvent<{ id: number; ext: string; buffer: ArrayBuffer }>) => {
  const { id, ext, buffer } = event.data;
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
    postMessage(payload, transfers);
  } catch (err) {
    const payload: ParseErr = { id, ok: false, error: String(err) };
    self.postMessage(payload);
  }
};
