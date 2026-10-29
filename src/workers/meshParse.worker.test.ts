import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  collectMeshes,
  copyAttribute,
  discardWorkerRenderer,
  fitCamera,
  loseContext,
  packGeometry,
  parseMeshes,
  parsedObject,
  renderThumbnail,
  workerRenderer,
} from "./meshParse.worker";

function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

const STL = `solid t
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid t
`;

const OBJ = `v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;

describe("mesh parse worker", () => {
  it("copyAttribute and packGeometry copy position, normal, and index", () => {
    const position = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3);
    const copied = copyAttribute(position);
    position.setX(0, 9);
    expect(Array.from(new Float32Array(copied))).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);

    const geometry = new THREE.BufferGeometry();
    expect(() => packGeometry(geometry)).toThrow("Mesh has no position attribute.");
    geometry.setAttribute("position", position);
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    const packed = packGeometry(geometry);
    expect(new Float32Array(packed.position)[3]).toBe(1);
    expect(packed.normal && new Float32Array(packed.normal)[2]).toBe(1);
    expect(packed.index && new Uint16Array(packed.index)).toEqual(new Uint16Array([0, 1, 2]));
  });

  it("collectMeshes, parseMeshes, and parsedObject read a triangle", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry));
    const collected: ReturnType<typeof packGeometry>[] = [];
    collectMeshes(group, collected);
    expect(collected).toHaveLength(1);
    expect(collected[0].normal?.byteLength).toBeGreaterThan(0);

    const stl = parseMeshes("stl", bytes(STL));
    expect(stl).toHaveLength(1);
    expect(new Float32Array(stl[0].position).length).toBe(9);
    const obj = parseMeshes("obj", bytes(OBJ));
    expect(obj).toHaveLength(1);
    expect(new Float32Array(obj[0].position).length).toBe(9);
    expect(() => parseMeshes("ply", bytes("nope"))).toThrow("Not a mesh.");

    const parsedStl = parsedObject("stl", bytes(STL));
    expect(parsedStl).toBeInstanceOf(THREE.Mesh);
    expect((parsedStl as THREE.Mesh).geometry.getAttribute("position").count).toBe(3);
    const parsedObj = parsedObject("obj", bytes(OBJ));
    let meshes = 0;
    parsedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBe(1);
    expect(() => parsedObject("ply", bytes("nope"))).toThrow("Not a mesh.");
  });

  it("fitCamera frames the object", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    mesh.position.set(5, 0, 0);
    fitCamera(camera, mesh);
    expect(mesh.position.x).toBeCloseTo(0);
    const distance = 2 / Math.sin((35 * Math.PI) / 360);
    expect(camera.position.length()).toBeCloseTo(distance * 1.4);
    expect(camera.near).toBeCloseTo(distance / 100);
    expect(camera.far).toBeCloseTo(distance * 20);
  });

  it("loseContext drops the context, and the renderer helpers report webgl-unavailable", async () => {
    const calls: string[] = [];
    loseContext({
      dispose: () => calls.push("dispose"),
      getContext: () => ({ forceContextLoss: () => calls.push("loss") }),
    } as unknown as THREE.WebGLRenderer);
    expect(calls).toEqual(["dispose", "loss"]);

    expect(discardWorkerRenderer()).toBeUndefined();
    expect(() => workerRenderer()).toThrow("webgl-unavailable");
    expect(() => discardWorkerRenderer()).not.toThrow();
    await expect(
      renderThumbnail("stl", bytes(STL), { background: "#111111", mesh: "#b0b3b6", light: "#ffffff" }),
    ).rejects.toThrow("webgl-unavailable");
  });
});
