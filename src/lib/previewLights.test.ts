import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PREVIEW_MESH_HEX, addPreviewLights, previewMeshMaterial } from "./previewLights";

const tokensCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles/tokens.css"),
  "utf8",
);

function rig() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  addPreviewLights(scene, camera, "#ffffff");
  const lights: THREE.Light[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Light).isLight) lights.push(child as THREE.Light);
  });
  return { scene, camera, lights };
}

describe("preview lights", () => {
  it("keeps the key and fill on the camera and the hemisphere in the scene", () => {
    const { scene, camera, lights } = rig();
    const hemispheres = lights.filter((light) => light instanceof THREE.HemisphereLight);
    const directionals = lights.filter((light) => light instanceof THREE.DirectionalLight);
    const ambients = lights.filter((light) => light instanceof THREE.AmbientLight);
    expect(hemispheres).toHaveLength(1);
    expect(directionals).toHaveLength(2);
    expect(ambients).toHaveLength(0);
    expect(camera.parent).toBe(scene);
    for (const light of directionals) {
      expect(light.parent).toBe(camera);
      expect(light.target.parent).toBe(camera);
      const aim = light.target.position.clone().sub(light.position);
      expect(aim.z).toBeLessThan(0);
    }
    const key = directionals.reduce((brighter, light) => (light.intensity > brighter.intensity ? light : brighter));
    const fill = directionals.find((light) => light !== key)!;
    expect(key.position.x).toBeLessThan(0);
    expect(key.position.y).toBeGreaterThan(0);
    expect(fill.position.x).toBeGreaterThan(0);
    expect(fill.position.y).toBeLessThan(0);
    expect(key.intensity).toBeGreaterThan(fill.intensity * 1.5);
    const hemisphere = hemispheres[0] as THREE.HemisphereLight;
    expect(hemisphere.groundColor.r).toBeLessThan(hemisphere.color.r);
    expect(hemisphere.intensity).toBeGreaterThan(0.4);
    expect(hemisphere.intensity).toBeLessThan(0.9);
  });

  it("uses a slightly lighter grey standard material", () => {
    const material = previewMeshMaterial(PREVIEW_MESH_HEX);
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHexString()).toBe(PREVIEW_MESH_HEX.slice(1));
    expect(material.metalness).toBeLessThan(0.15);
    expect(material.roughness).toBeGreaterThan(0.5);
    expect(material.roughness).toBeLessThan(0.85);
    const match = tokensCss.match(/--viewer-mesh:\s*(#[0-9a-fA-F]{6})/);
    expect(match?.[1]?.toLowerCase()).toBe(PREVIEW_MESH_HEX);
    material.dispose();
  });
});