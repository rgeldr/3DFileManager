import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { PackedMesh } from "../workers/meshParse.worker";
import {
  MESH_BYTE_LIMIT,
  cssVar,
  discardMainRenderer,
  disposeMeshTree,
  enqueueRender,
  fitCamera,
  groupFromPackedMeshes,
  renderMeshStillInner,
  renderOnMainThread,
  rendererForThumbs,
  webglUnavailable,
} from "./renderThumb";

vi.mock("../debugLog", () => ({
  debugLog: vi.fn(),
}));

function themeTokens() {
  document.documentElement.style.setProperty("--viewer-bg", "#112233");
  document.documentElement.style.setProperty("--viewer-mesh", "#b0b3b6");
  document.documentElement.style.setProperty("--color-accent-contrast", "#ffffff");
}

function expectWebglFailure(error: unknown) {
  expect(webglUnavailable(error)).toBe(false);
  expect(String(error).toLowerCase()).toMatch(/webgl|context/);
}

describe("thumbnail helpers", () => {
  it("cssVar reads a token and webglUnavailable matches the worker error", () => {
    themeTokens();
    expect(cssVar("--viewer-bg")).toBe("#112233");
    expect(() => cssVar("--missing-thumb-token")).toThrow("Missing theme token --missing-thumb-token");
    expect(webglUnavailable(new Error("Error: webgl-unavailable"))).toBe(true);
    expect(webglUnavailable("WEBGL-UNAVAILABLE")).toBe(true);
    expect(webglUnavailable(new Error("Could not read the file for a thumbnail."))).toBe(false);
  });

  it("fitCamera frames a mesh and groupFromPackedMeshes builds geometry", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    mesh.position.set(5, 0, 0);
    fitCamera(camera, mesh);
    expect(mesh.position.x).toBeCloseTo(0);
    expect(mesh.position.y).toBeCloseTo(0);
    const radius = 2;
    const distance = radius / Math.sin((35 * Math.PI) / 360);
    expect(camera.position.length()).toBeCloseTo(distance * 1.4);
    expect(camera.near).toBeCloseTo(distance / 100);
    expect(camera.far).toBeCloseTo(distance * 20);

    const material = new THREE.MeshStandardMaterial();
    const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer;
    const packed: PackedMesh[] = [
      {
        position,
        normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer,
        index: new Uint16Array([0, 1, 2]).buffer,
      },
      { position },
    ];
    const group = groupFromPackedMeshes(packed, material);
    const indexed = group.children[0] as THREE.Mesh;
    const plain = group.children[1] as THREE.Mesh;
    expect(indexed.geometry.getIndex()?.array).toBeInstanceOf(Uint16Array);
    expect(indexed.geometry.getAttribute("normal").count).toBe(3);
    expect(plain.geometry.getAttribute("normal").count).toBe(3);
    expect(plain.material).toBe(material);
  });

  it("disposeMeshTree releases geometry and leaves the shared material", () => {
    const shared = new THREE.MeshStandardMaterial();
    const own = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const ownDispose = vi.spyOn(own, "dispose");
    const sharedDispose = vi.spyOn(shared, "dispose");
    disposeMeshTree(new THREE.Mesh(geometry, own), shared);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(ownDispose).toHaveBeenCalledOnce();
    expect(sharedDispose).not.toHaveBeenCalled();
  });

  it("enqueueRender runs work in order even after a failure", async () => {
    const order: string[] = [];
    const first = enqueueRender(async () => {
      order.push("first");
      throw new Error("fail");
    });
    const second = enqueueRender(async () => {
      order.push("second");
      return 2;
    });
    await expect(first).rejects.toThrow("fail");
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(["first", "second"]);
  });

  it("rendererForThumbs, renderOnMainThread, and renderMeshStillInner fail without WebGL", async () => {
    themeTokens();
    expect(() => discardMainRenderer()).not.toThrow();
    let caught: unknown;
    try {
      rendererForThumbs();
    } catch (error) {
      caught = error;
    }
    expectWebglFailure(caught);
    expect(() => discardMainRenderer()).not.toThrow();

    await expect(renderOnMainThread(new ArrayBuffer(8), "stl")).rejects.toSatisfy((error: unknown) => {
      expectWebglFailure(error);
      return true;
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
    await expect(renderMeshStillInner("https://example.test/missing.stl", "stl")).rejects.toThrow(
      "Could not read the file for a thumbnail.",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => ({ byteLength: MESH_BYTE_LIMIT + 1 }) as ArrayBuffer,
      })),
    );
    await expect(renderMeshStillInner("https://example.test/huge.stl", "stl")).rejects.toThrow(
      "Mesh is over the thumbnail size limit.",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    await expect(renderMeshStillInner("https://example.test/part.stl", "stl")).rejects.toSatisfy((error: unknown) => {
      expectWebglFailure(error);
      return true;
    });
    vi.unstubAllGlobals();
  });
});
