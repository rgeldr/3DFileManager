import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import { describe, expect, it, vi } from "vitest";
import { PREVIEW_MESH_HEX } from "./previewLights";
import {
  alreadyColored,
  applyBambuFilamentColors,
  applyPreviewMaterials,
  channelUsable,
  childMetadata,
  colorFromMaterial,
  disposeMaterial,
  ensureNormals,
  extruderOf,
  fallbackLinear,
  filamentColor,
  linearHex,
  materialsFor,
  normalsAreZero,
  paintColorState,
  paintMesh,
  parseXml,
  positiveInt,
  prepareLoadedPreview,
  readExtruders,
  readFilaments,
  readPaintRecords,
  triangleCount,
  usableVertexColors,
} from "./previewMaterials";

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

describe("preview material helpers", () => {
  it("accepts a finite color above black and ignores a zero normal", () => {
    expect(channelUsable(0, 0, 0)).toBe(false);
    expect(channelUsable(0.02, 0, 0)).toBe(false);
    expect(channelUsable(0.03, 0, 0)).toBe(true);
    expect(channelUsable(Number.NaN, 1, 1)).toBe(false);
    const zero = new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3);
    const up = new THREE.BufferAttribute(new Float32Array([0, 1, 0]), 3);
    expect(normalsAreZero(zero)).toBe(true);
    expect(normalsAreZero(up)).toBe(false);
  });

  it("reads usable vertex colors and named material colors", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    expect(usableVertexColors(geometry)).toBe(false);
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
    expect(usableVertexColors(geometry)).toBe(false);
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
    expect(usableVertexColors(geometry)).toBe(true);
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0, 0]), 3));
    expect(usableVertexColors(geometry)).toBe(false);

    expect(colorFromMaterial(undefined)).toBeNull();
    expect(colorFromMaterial(new THREE.MeshBasicMaterial({ color: "#ffffff" }))).toBeNull();
    expect(colorFromMaterial(new THREE.MeshBasicMaterial({ color: "#000000", name: "ink" }))).toBeNull();
    expect(colorFromMaterial(new THREE.MeshPhongMaterial({ color: "#ff0000", name: "red" }))?.getHexString()).toBe("ff0000");
  });

  it("parses filament metadata and linear colors", () => {
    const red = new THREE.Color("#ff0000");
    expect(linearHex("#ff0000")).toEqual([red.r, red.g, red.b]);
    expect(linearHex("#000000")).toBeNull();
    expect(linearHex("red")).toBeNull();
    const grey = new THREE.Color(PREVIEW_MESH_HEX);
    expect(fallbackLinear(PREVIEW_MESH_HEX)).toEqual([grey.r, grey.g, grey.b]);
    expect(positiveInt(null)).toBeNull();
    expect(positiveInt("0")).toBeNull();
    expect(positiveInt("1.5")).toBeNull();
    expect(positiveInt("2")).toBe(2);
    expect(parseXml("<root></not-root>")).toBeNull();
    const doc = parseXml(
      `<object id="9"><metadata key="extruder" value="2"/><part id="1"><metadata key="extruder" value="3"/></part></object>`,
    );
    const object = doc?.querySelector("object");
    expect(object).toBeTruthy();
    expect(childMetadata(object!, "extruder")).toBe("2");
    expect(childMetadata(object!, "missing")).toBeNull();
    expect(extruderOf(object!)).toBe(3);
    const many = parseXml(`<object id="4"><metadata key="extruder" value="2"/><part/><part/></object>`);
    expect(extruderOf(many!.querySelector("object")!)).toBe(2);
  });

  it("reads Bambu filaments, extruders, and paint records", () => {
    const entries = {
      "3D/3dmodel.model": strToU8(BAMBU),
      "Metadata/project_settings.config": strToU8(PROJECT_SETTINGS),
      "Metadata/model_settings.config": strToU8(MODEL_SETTINGS),
    };
    expect(readFilaments({})).toEqual([]);
    expect(readFilaments({ "Metadata/project_settings.config": strToU8("{") })).toEqual([]);
    expect(readFilaments(entries)).toEqual(["#E23D28", "#2F6BFF", "#000000"]);
    expect(readExtruders({}).size).toBe(0);
    expect(readExtruders(entries).get("1")).toBe(1);
    expect(filamentColor(["#E23D28", "#2F6BFF"], 1, null)).toEqual(linearHex("#E23D28"));
    expect(filamentColor(["#E23D28", "#2F6BFF"], 0, 2)).toEqual(linearHex("#2F6BFF"));
    expect(filamentColor(["#E23D28"], 0, null)).toBeNull();
    expect(filamentColor(["#000000"], 1, null)).toBeNull();
    const records = readPaintRecords(entries, readFilaments(entries), readExtruders(entries), fallbackLinear(PREVIEW_MESH_HEX));
    expect(records.map((record) => record.name)).toEqual(["Skeleton"]);
    expect(records[0].colors[0]).toEqual(linearHex("#E23D28"));
    expect(records[0].colors[1]).toEqual(linearHex("#2F6BFF"));
    expect(records[0].colors[2]).toEqual(linearHex("#E23D28"));
  });

  it("paints a mesh from triangle colors and builds preview materials", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 3, 4, 5]), 1));
    expect(triangleCount(geometry)).toBe(2);
    const plain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    expect(alreadyColored(plain)).toBe(false);
    const red = linearHex("#ff0000")!;
    const green = linearHex("#00ff00")!;
    paintMesh(plain, [red, red]);
    expect((plain.material as THREE.MeshStandardMaterial).color.r).toBeCloseTo(red[0]);
    expect(plain.geometry.getAttribute("color")).toBeFalsy();

    const varied = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3)),
      new THREE.MeshStandardMaterial(),
    );
    paintMesh(varied, [red, green]);
    expect(varied.geometry.getAttribute("color").count).toBe(6);
    expect(varied.geometry.getIndex()).toBeNull();
    expect(alreadyColored(varied)).toBe(true);

    const colored = new THREE.BufferGeometry();
    colored.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    colored.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
    expect(ensureNormals(colored)).toBe(true);
    const vertexMesh = new THREE.Mesh(colored, new THREE.MeshBasicMaterial());
    const vertexMaterial = materialsFor(vertexMesh, [], PREVIEW_MESH_HEX) as THREE.MeshStandardMaterial;
    expect(vertexMaterial.vertexColors).toBe(true);

    const grouped = new THREE.BufferGeometry();
    grouped.setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3));
    grouped.addGroup(0, 3, 0);
    grouped.addGroup(3, 3, 1);
    const sources = [
      new THREE.MeshPhongMaterial({ color: "#ff0000", name: "red" }),
      new THREE.MeshPhongMaterial({ color: "#0000ff", name: "blue" }),
    ];
    const made = materialsFor(new THREE.Mesh(grouped, sources), sources, PREVIEW_MESH_HEX) as THREE.MeshStandardMaterial[];
    expect(made.map((material) => material.color.getHexString())).toEqual(["ff0000", "0000ff"]);

    const map = new THREE.Texture();
    const mapDispose = vi.spyOn(map, "dispose");
    const material = new THREE.MeshStandardMaterial({ map });
    const materialDispose = vi.spyOn(material, "dispose");
    disposeMaterial(material);
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("applyBambuFilamentColors copies paint onto an uncolored mesh with the same triangle count", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(27), 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = "Skeleton";
    const root = new THREE.Group();
    root.add(mesh);
    const buffer = zip3mf({
      "3D/3dmodel.model": BAMBU,
      "Metadata/project_settings.config": PROJECT_SETTINGS,
      "Metadata/model_settings.config": MODEL_SETTINGS,
    });
    applyBambuFilamentColors(root, buffer, PREVIEW_MESH_HEX);
    expect(mesh.geometry.getAttribute("color").count).toBe(9);
    expect(triangleHexes(mesh)).toEqual(["e23d28", "2f6bff", "e23d28"]);
    applyBambuFilamentColors(root, new ArrayBuffer(4), PREVIEW_MESH_HEX);
    expect(mesh.geometry.getAttribute("color").count).toBe(9);
  });
});
