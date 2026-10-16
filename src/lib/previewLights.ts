import * as THREE from "three";

/** Slightly light grey so shaded faces stay readable on both themes. */
export const PREVIEW_MESH_HEX = "#b0b3b6";

const KEY_INTENSITY = 0.85;
const FILL_INTENSITY = 0.34;
const HEMISPHERE_INTENSITY = 0.58;
const GROUND_SCALE = 0.48;

/** Slightly up and left of the view. The camera looks down its local -Z axis. */
const KEY_OFFSET = new THREE.Vector3(-0.7, 0.9, 0.15);
/** Opposite side of the view, softer, so the far edge of the visible face still has shape. */
const FILL_OFFSET = new THREE.Vector3(0.9, -0.45, 0.2);
const VIEW_AIM = new THREE.Vector3(0, 0, -1);

export function previewMeshMaterial(
  color: THREE.ColorRepresentation,
  options?: { vertexColors?: boolean; flatShading?: boolean },
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.02,
    roughness: 0.66,
    vertexColors: options?.vertexColors ?? false,
    flatShading: options?.flatShading ?? false,
  });
}

/**
 * Studio lights that travel with the camera. The key stays up-left of the
 * view, a fill covers the opposite side, and a sky/ground hemisphere keeps
 * undersides from turning into a flat shadow.
 */
export function addPreviewLights(
  scene: THREE.Scene,
  camera: THREE.Camera,
  color: THREE.ColorRepresentation,
): void {
  const sky = new THREE.Color(color);
  const ground = sky.clone().multiplyScalar(GROUND_SCALE);
  scene.add(new THREE.HemisphereLight(sky, ground, HEMISPHERE_INTENSITY));

  const key = new THREE.DirectionalLight(color, KEY_INTENSITY);
  key.position.copy(KEY_OFFSET);
  key.target.position.copy(VIEW_AIM);
  camera.add(key);
  camera.add(key.target);

  const fill = new THREE.DirectionalLight(color, FILL_INTENSITY);
  fill.position.copy(FILL_OFFSET);
  fill.target.position.copy(VIEW_AIM);
  camera.add(fill);
  camera.add(fill.target);

  scene.add(camera);
}
