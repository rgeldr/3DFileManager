import { useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";
import type { FileRow } from "../types";
import { prepareLoadedPreview } from "../lib/previewMaterials";
import { addPreviewLights, previewMeshMaterial } from "../lib/previewLights";
import { useTheme } from "../theme/ThemeProvider";

const MESH = new Set(["stl", "obj", "3mf"]);
const IMAGE = new Set(["png", "jpg", "jpeg"]);
const TEXT_PREVIEW = new Set(["txt", "md", "scad"]);
const LIMIT = 150 * 1024 * 1024;

export function isMeshPreview(file: FileRow | null): file is FileRow {
  return !!file && MESH.has(file.ext) && file.sizeBytes <= LIMIT;
}

export function previewImage(file: FileRow): string | null {
  if (IMAGE.has(file.ext)) return convertFileSrc(file.absolutePath);
  if (file.thumbPath) return convertFileSrc(file.thumbPath);
  return null;
}

export function staticMessage(file: FileRow): string {
  if (file.ext === "pdf") return "PDF document";
  if (IMAGE.has(file.ext) || file.thumbPath) return "";
  if (!MESH.has(file.ext)) return "Preview unavailable";
  return "File is too large to preview";
}

export function disposeMaterial(material: THREE.Material) {
  const textured = material as THREE.MeshStandardMaterial;
  textured.map?.dispose();
  textured.normalMap?.dispose();
  textured.roughnessMap?.dispose();
  textured.metalnessMap?.dispose();
  textured.aoMap?.dispose();
  textured.emissiveMap?.dispose();
  material.dispose();
}

export function assignSharedMaterial(root: THREE.Object3D, material: THREE.Material) {
  const previous = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const current = child.material;
    child.material = material;
    if (Array.isArray(current)) current.forEach((item) => previous.add(item));
    else previous.add(current);
  });
  for (const item of previous) {
    if (item !== material) disposeMaterial(item);
  }
}

export function releaseScene(root: THREE.Object3D, shared: THREE.Material) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material && material !== shared) disposeMaterial(material);
    }
  });
  shared.dispose();
  root.clear();
}

export function cssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Missing theme token ${name}`);
  return value;
}

type MeshPhase = "loading" | "ready" | "error";

export function TextPreview({ fileId }: { fileId: number }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    void api
      .textPreview(fileId)
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setText("");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  if (!text?.trim()) {
    return <p className="viewer-message">Text file</p>;
  }
  return <pre className="text-preview">{text}</pre>;
}

export function Viewer({ file }: { file: FileRow | null }) {
  const { theme } = useTheme();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const mesh = isMeshPreview(file);
  const loadKey = mesh ? `${file.id}:${file.absolutePath}:${theme}` : "";
  const [load, setLoad] = useState<{ key: string; phase: MeshPhase }>({ key: "", phase: "loading" });
  if (load.key !== loadKey) {
    setLoad({ key: loadKey, phase: "loading" });
  }
  const phase = load.key === loadKey ? load.phase : "loading";

  useEffect(() => {
    if (!mesh || !file || !host) return;

    let disposed = false;
    const controller = new AbortController();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const material = previewMeshMaterial(cssVar("--viewer-mesh"));
    addPreviewLights(scene, camera, cssVar("--color-accent-contrast"));
    const canvas = renderer.domElement;
    canvas.draggable = false;
    const blockCanvasDrag = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    canvas.addEventListener("dragstart", blockCanvasDrag);
    host.replaceChildren(canvas);

    scene.background = new THREE.Color(cssVar("--viewer-bg"));

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const url = convertFileSrc(file.absolutePath);
    const activeKey = loadKey;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not read the file.");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (disposed) return;
        const group = new THREE.Group();
        if (file.ext === "stl") {
          const geometry = new STLLoader().parse(buffer);
          geometry.computeVertexNormals();
          group.add(new THREE.Mesh(geometry, material));
        } else if (file.ext === "obj") {
          const loaded = new OBJLoader().parse(new TextDecoder().decode(buffer));
          assignSharedMaterial(loaded, material);
          group.add(loaded);
        } else {
          const loaded = new ThreeMFLoader().parse(buffer);
          prepareLoadedPreview(loaded, buffer, cssVar("--viewer-mesh"));
          group.add(loaded);
        }
        scene.add(group);
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        const radius = Math.max(size.x, size.y, size.z, 1) * 0.6;
        camera.position.set(radius, radius * 0.75, radius);
        camera.near = radius / 100;
        camera.far = radius * 40;
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
        setLoad({ key: activeKey, phase: "ready" });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoad({ key: activeKey, phase: "error" });
      });

    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      releaseScene(scene, material);
      renderer.forceContextLoss();
      renderer.dispose();
      canvas.removeEventListener("dragstart", blockCanvasDrag);
      canvas.remove();
    };
  }, [file, host, loadKey, mesh]);

  const imageUrl = file && !mesh ? previewImage(file) : null;
  const message = !file
    ? "Select a file"
    : mesh
      ? phase === "error"
        ? "Preview unavailable"
        : phase === "loading"
          ? "Loading preview…"
          : ""
      : staticMessage(file);

  if (file && TEXT_PREVIEW.has(file.ext)) {
    return (
      <div className="viewer">
        <TextPreview fileId={file.id} />
      </div>
    );
  }

  return (
    <div className="viewer">
      <div ref={setHost} className="viewer-canvas" hidden={!mesh} />
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          onDragStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ) : null}
      {message ? <p className="viewer-message">{message}</p> : null}
    </div>
  );
}
