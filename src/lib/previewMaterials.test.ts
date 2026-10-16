import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import { describe, expect, it } from "vitest";
import { PREVIEW_MESH_HEX } from "./previewLights";
import { applyPreviewMaterials, paintColorState, prepareLoadedPreview } from "./previewMaterials";

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

function zip3mf(files: Record<string, string>): ArrayBuffer {
  const encoded: Record<string, Uint8Array> = { "_rels/.rels": strToU8(RELS, true) };
  for (const [name, text] of Object.entries(files)) encoded[name] = strToU8(text, true);
  const zipped = zipSync(encoded);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
}

function model(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
${body}
</model>`;
}

const MULTI_MATERIAL = model(`
  <resources>
    <basematerials id="1">
      <base name="red" displaycolor="#FF0000"/>
      <base name="blue" displaycolor="#0000FF"/>
    </basematerials>
    <colorgroup id="2">
      <color color="#00AA00"/>
      <color color="#000000"/>
    </colorgroup>
    <object id="10" type="model" name="plates">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="1" y="1" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="1" p1="0"/>
          <triangle v1="3" v2="4" v3="5" pid="1" p1="1"/>
        </triangles>
      </mesh>
    </object>
    <object id="11" type="model" name="green">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="0" z="1"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="2" p1="0"/>
        </triangles>
      </mesh>
    </object>
    <object id="12" type="model" name="black">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
          <vertex x="0" y="0" z="1"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="2" p1="1"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="10"/>
    <item objectid="11"/>
    <item objectid="12"/>
  </build>`);

const BAMBU = model(`
  <resources>
    <object id="1" type="model" name="Skeleton">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
          <vertex x="0" y="0" z="1"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" paint_color="4"/>
          <triangle v1="0" v2="2" v3="3" paint_color="8"/>
          <triangle v1="0" v2="3" v3="1"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>`);

const PROJECT_SETTINGS = JSON.stringify({
  filament_colour: ["#E23D28", "#2F6BFF", "#000000"],
});

const MODEL_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="extruder" value="1"/>
    <part id="1" subtype="normal_part">
      <metadata key="extruder" value="1"/>
    </part>
  </object>
</config>`;

function materialsOf(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) materials.push(material as THREE.MeshStandardMaterial);
  });
  return materials;
}

function assertNeverBlack(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const normal = child.geometry.getAttribute("normal");
    expect(normal).toBeTruthy();
    expect(Array.from(normal.array).some((value) => value !== 0)).toBe(true);
    const list = Array.isArray(child.material) ? child.material : [child.material];
    expect(list.length).toBeGreaterThan(0);
    for (const material of list) {
      expect(material).toBeTruthy();
      const standard = material as THREE.MeshStandardMaterial;
      expect(standard).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(standard.color.getHexString()).not.toBe("000000");
      expect(standard.metalness).toBeLessThan(0.15);
      if (standard.vertexColors) {
        const color = child.geometry.getAttribute("color");
        expect(color).toBeTruthy();
        expect(color.count).toBe(child.geometry.getAttribute("position").count);
      }
    }
  });
}

function triangleHexes(mesh: THREE.Mesh): string[] {
  const color = mesh.geometry.getAttribute("color");
  const scratch = new THREE.Color();
  const hexes: string[] = [];
  for (let i = 0; i < color.count; i += 3) {
    scratch.setRGB(color.getX(i), color.getY(i), color.getZ(i));
    hexes.push(scratch.getHexString());
  }
  return hexes;
}

function meshesNamed(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name === name) found.push(child);
  });
  if (found.length === 0) throw new Error(`Missing mesh ${name}`);
  return found;
}

describe("3MF preview colors", () => {
  it("decodes Bambu paint_color nibbles to filament slots", () => {
    expect(paintColorState("4")).toBe(1);
    expect(paintColorState("8")).toBe(2);
    expect(paintColorState("0C")).toBe(3);
    expect(paintColorState("1C")).toBe(4);
    expect(paintColorState("")).toBeNull();
  });

  it("maps basematerials and vertex colors, and replaces black with grey", () => {
    const buffer = zip3mf({ "3D/3dmodel.model": MULTI_MATERIAL });
    const root = new ThreeMFLoader().parse(buffer);
    prepareLoadedPreview(root, buffer, PREVIEW_MESH_HEX);
    assertNeverBlack(root);

    const plates = meshesNamed(root, "plates").flatMap((mesh) => materialsOf(mesh).map((material) => material.color.getHexString())).sort();
    expect(plates).toEqual(["0000ff", "ff0000"]);
    for (const mesh of meshesNamed(root, "plates")) {
      for (const material of materialsOf(mesh)) expect(material.vertexColors).toBe(false);
    }

    const green = meshesNamed(root, "green")[0];
    expect((green.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect((green.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    expect(triangleHexes(green)).toEqual(["00aa00"]);

    const black = meshesNamed(root, "black")[0];
    expect((black.material as THREE.MeshStandardMaterial).vertexColors).toBe(false);
    expect((black.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(PREVIEW_MESH_HEX.slice(1));
    expect(black.geometry.getAttribute("color")).toBeFalsy();
  });

  it("colors a Bambu project from paint_color and the object extruder", () => {
    const buffer = zip3mf({
      "3D/3dmodel.model": BAMBU,
      "Metadata/project_settings.config": PROJECT_SETTINGS,
      "Metadata/model_settings.config": MODEL_SETTINGS,
    });
    const root = new ThreeMFLoader().parse(buffer);
    prepareLoadedPreview(root, buffer, PREVIEW_MESH_HEX);
    assertNeverBlack(root);
    const mesh = meshesNamed(root, "Skeleton")[0];
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHexString()).not.toBe("000000");
    expect(triangleHexes(mesh)).toEqual(["e23d28", "2f6bff", "e23d28"]);
  });

  it("fills a missing material-group slot with grey", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
    ]), 3));
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshPhongMaterial({ color: "#ff0000", name: "red" }),
      undefined as unknown as THREE.Material,
    ]);
    applyPreviewMaterials(mesh, PREVIEW_MESH_HEX);
    const materials = mesh.material as THREE.MeshStandardMaterial[];
    expect(materials.map((material) => material.color.getHexString())).toEqual(["ff0000", PREVIEW_MESH_HEX.slice(1)]);
    expect(materials.every((material) => material.vertexColors === false)).toBe(true);
    assertNeverBlack(mesh);
  });

  it("prepares the inspector and both thumbnail paths the same way", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of ["components/Viewer.tsx", "workers/meshParse.worker.ts", "lib/renderThumb.ts"]) {
      expect(readFileSync(join(root, file), "utf8")).toContain("prepareLoadedPreview");
    }
  });
});
