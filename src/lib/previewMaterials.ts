import * as THREE from "three";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { previewMeshMaterial } from "./previewLights";

/**
 * 3MFLoader builds triangle soups and flat-shaded Phong materials with no
 * vertex normals. Replacing those with a smooth MeshStandardMaterial lights a
 * zero normal, so the whole mesh renders black. Usable 3MF and Bambu colors
 * are copied onto the lit preview material; missing or black colors become
 * the shared grey instead.
 */
const BLACK_MAX = 0.02;

type Rgb = [number, number, number];

type PaintRecord = { name: string; colors: Rgb[] };

export function paintColorState(paint: string): number | null {
  const nibbles: number[] = [];
  for (const char of paint.trim().toUpperCase()) {
    const value = Number.parseInt(char, 16);
    if (!Number.isInteger(value) || value < 0 || value > 15) return null;
    nibbles.push(value);
  }
  if (nibbles.length === 0) return null;
  nibbles.reverse();
  let index = 0;
  const next = () => (index < nibbles.length ? nibbles[index++] : null);
  const node = (): number | null => {
    const token = next();
    if (token == null) return null;
    const split = token & 3;
    if (split === 0) {
      const high = token >> 2;
      if (high !== 3) return high;
      const extra = next();
      return extra == null ? null : 3 + extra;
    }
    let first: number | null = null;
    for (let child = 0; child < split + 1; child += 1) {
      const state = node();
      if (first == null) first = state;
    }
    return first;
  };
  return node();
}

function channelUsable(r: number, g: number, b: number): boolean {
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && Math.max(r, g, b) > BLACK_MAX;
}

function usableVertexColors(geometry: THREE.BufferGeometry): boolean {
  const color = geometry.getAttribute("color");
  const position = geometry.getAttribute("position");
  if (!color || !position || color.count !== position.count || color.itemSize < 3) return false;
  for (let i = 0; i < color.count; i += 1) {
    if (channelUsable(color.getX(i), color.getY(i), color.getZ(i))) return true;
  }
  return false;
}

function normalsAreZero(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): boolean {
  const values = attr.array;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== 0) return false;
  }
  return true;
}

function colorFromMaterial(material: THREE.Material | undefined): THREE.Color | null {
  if (!material || !("color" in material)) return null;
  const color = (material as { color?: unknown }).color;
  if (!(color instanceof THREE.Color) || !channelUsable(color.r, color.g, color.b)) return null;
  const unnamed = material.name === "" || material.name === "__DEFAULT";
  if (unnamed && color.getHexString() === "ffffff") return null;
  return color;
}

function disposeMaterial(material: THREE.Material) {
  const textured = material as THREE.MeshStandardMaterial;
  textured.map?.dispose();
  textured.normalMap?.dispose();
  textured.roughnessMap?.dispose();
  textured.metalnessMap?.dispose();
  textured.aoMap?.dispose();
  textured.emissiveMap?.dispose();
  material.dispose();
}

function materialsFor(mesh: THREE.Mesh, sources: THREE.Material[], fallbackHex: string): THREE.Material | THREE.Material[] {
  const geometry = mesh.geometry;
  const flatShading = !ensureNormals(geometry);
  if (usableVertexColors(geometry)) {
    return previewMeshMaterial("#ffffff", { vertexColors: true, flatShading });
  }
  if (geometry.getAttribute("color")) geometry.deleteAttribute("color");
  const needsArray = sources.length > 1 || geometry.groups.some((group) => (group.materialIndex ?? 0) > 0);
  if (!needsArray) {
    return previewMeshMaterial(colorFromMaterial(sources[0]) ?? fallbackHex, { flatShading });
  }
  const maxIndex = geometry.groups.reduce((max, group) => Math.max(max, group.materialIndex ?? 0), sources.length - 1);
  const next: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i <= maxIndex; i += 1) {
    next.push(previewMeshMaterial(colorFromMaterial(sources[i]) ?? fallbackHex, { flatShading }));
  }
  return next;
}

function ensureNormals(geometry: THREE.BufferGeometry): boolean {
  const existing = geometry.getAttribute("normal");
  if (!existing || normalsAreZero(existing)) geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  return !!normal && !normalsAreZero(normal);
}

export function applyPreviewMaterials(root: THREE.Object3D, fallbackHex: string) {
  const retired = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.getAttribute("position")) return;
    const previous = Array.isArray(child.material) ? child.material : [child.material];
    const sources = previous.filter((item): item is THREE.Material => !!item);
    for (const item of sources) retired.add(item);
    child.material = materialsFor(child, sources, fallbackHex);
  });
  const live = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const current = Array.isArray(child.material) ? child.material : [child.material];
    for (const item of current) if (item) live.add(item);
  });
  for (const item of retired) {
    if (!live.has(item)) disposeMaterial(item);
  }
}

function parseXml(text: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  return doc;
}

function linearHex(hex: string): Rgb | null {
  const match = hex.trim().match(/^#([0-9a-fA-F]{6})/);
  if (!match) return null;
  const color = new THREE.Color(`#${match[1]}`);
  if (!channelUsable(color.r, color.g, color.b)) return null;
  return [color.r, color.g, color.b];
}

function fallbackLinear(hex: string): Rgb {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

function childMetadata(element: Element, key: string): string | null {
  for (const child of element.children) {
    if (child.tagName.toLowerCase() !== "metadata") continue;
    if (child.getAttribute("key") === key) return child.getAttribute("value");
  }
  return null;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function extruderOf(object: Element): number | null {
  const own = positiveInt(childMetadata(object, "extruder"));
  const parts = [...object.children].filter((child) => child.tagName.toLowerCase() === "part");
  if (parts.length === 1) return positiveInt(childMetadata(parts[0], "extruder")) ?? own;
  return own;
}

function readFilaments(entries: Record<string, Uint8Array>): string[] {
  const name = Object.keys(entries).find((key) => key.toLowerCase().endsWith("project_settings.config"));
  if (!name) return [];
  try {
    const data = JSON.parse(strFromU8(entries[name])) as { filament_colour?: unknown };
    if (!Array.isArray(data.filament_colour)) return [];
    return data.filament_colour.filter((color): color is string => typeof color === "string");
  } catch {
    return [];
  }
}

function readExtruders(entries: Record<string, Uint8Array>): Map<string, number> {
  const map = new Map<string, number>();
  const name = Object.keys(entries).find((key) => key.toLowerCase().endsWith("model_settings.config"));
  if (!name) return map;
  const doc = parseXml(strFromU8(entries[name]));
  if (!doc) return map;
  for (const object of doc.querySelectorAll("object")) {
    const id = object.getAttribute("id");
    const extruder = extruderOf(object);
    if (id && extruder) map.set(id, extruder);
  }
  return map;
}

function filamentColor(filaments: string[], state: number, extruder: number | null): Rgb | null {
  const index = state > 0 ? state - 1 : extruder == null ? -1 : extruder - 1;
  if (index < 0 || index >= filaments.length) return null;
  return linearHex(filaments[index]);
}

function readPaintRecords(entries: Record<string, Uint8Array>, filaments: string[], extruders: Map<string, number>, grey: Rgb): PaintRecord[] {
  const records: PaintRecord[] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.toLowerCase().endsWith(".model")) continue;
    const doc = parseXml(strFromU8(bytes));
    if (!doc) continue;
    for (const object of doc.querySelectorAll("object")) {
      const triangles = [...object.querySelectorAll("mesh triangles triangle")];
      if (triangles.length === 0) continue;
      const extruder = extruders.get(object.getAttribute("id") ?? "") ?? null;
      const colors: Rgb[] = [];
      let any = false;
      for (const triangle of triangles) {
        const paint = triangle.getAttribute("paint_color");
        const state = paint ? paintColorState(paint) : 0;
        const color = state == null ? null : filamentColor(filaments, state, extruder);
        if (color) any = true;
        colors.push(color ?? grey);
      }
      if (any) records.push({ name: object.getAttribute("name") ?? "", colors });
    }
  }
  return records;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const position = geometry.getAttribute("position");
  return position ? Math.floor(position.count / 3) : 0;
}

function alreadyColored(mesh: THREE.Mesh): boolean {
  if (usableVertexColors(mesh.geometry)) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => colorFromMaterial(material) != null);
}

function paintMesh(mesh: THREE.Mesh, colors: Rgb[]) {
  const first = colors[0];
  const uniform = colors.every((color) => color[0] === first[0] && color[1] === first[1] && color[2] === first[2]);
  if (uniform) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material && "color" in material) (material as THREE.MeshStandardMaterial).color.setRGB(first[0], first[1], first[2]);
    }
    return;
  }
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const nextPos = new Float32Array(colors.length * 9);
  const nextCol = new Float32Array(colors.length * 9);
  for (let triangle = 0; triangle < colors.length; triangle += 1) {
    const [r, g, b] = colors[triangle];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      const dst = (triangle * 3 + corner) * 3;
      nextPos[dst] = position.getX(vertex);
      nextPos[dst + 1] = position.getY(vertex);
      nextPos[dst + 2] = position.getZ(vertex);
      nextCol[dst] = r;
      nextCol[dst + 1] = g;
      nextCol[dst + 2] = b;
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(nextPos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(nextCol, 3));
  geometry.setIndex(null);
  geometry.deleteAttribute("normal");
}

function applyBambuFilamentColors(root: THREE.Object3D, buffer: ArrayBuffer, fallbackHex: string) {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buffer)) as Record<string, Uint8Array>;
  } catch {
    return;
  }
  const filaments = readFilaments(entries);
  if (filaments.length === 0) return;
  const records = readPaintRecords(entries, filaments, readExtruders(entries), fallbackLinear(fallbackHex));
  const used = new Set<number>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry || alreadyColored(child)) return;
    const count = triangleCount(child.geometry);
    const named = records.findIndex((record, index) => !used.has(index) && record.name !== "" && record.name === child.name && record.colors.length === count);
    const match = named >= 0 ? named : records.findIndex((record, index) => !used.has(index) && record.colors.length === count);
    if (match < 0) return;
    used.add(match);
    paintMesh(child, records[match].colors);
  });
}

export function prepareLoadedPreview(root: THREE.Object3D, buffer: ArrayBuffer, fallbackHex: string) {
  try {
    applyBambuFilamentColors(root, buffer, fallbackHex);
  } catch {
    // A damaged zip still gets the grey lit material below.
  }
  applyPreviewMaterials(root, fallbackHex);
}
