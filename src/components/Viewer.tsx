import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRow } from "../types";
import { useTheme } from "../theme/ThemeProvider";

const MESH = new Set(["stl", "obj", "3mf"]);
const LIMIT = 150 * 1024 * 1024;

function cssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Missing theme token ${name}`);
  return value;
}

export function Viewer({ file }: { file: FileRow | null }) {
  const { theme } = useTheme();
  const mountRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Select a file");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setMessage("Select a file");
      return;
    }
    const imageExt = new Set(["png", "jpg", "jpeg"]);
    if (imageExt.has(file.ext)) {
      setImageUrl(convertFileSrc(file.absolutePath));
      setMessage("");
      return;
    }
    if (!MESH.has(file.ext)) {
      setImageUrl(file.thumbPath ? convertFileSrc(file.thumbPath) : null);
      setMessage(file.thumbPath ? "" : "Preview unavailable");
      return;
    }
    if (file.sizeBytes > LIMIT) {
      setImageUrl(file.thumbPath ? convertFileSrc(file.thumbPath) : null);
      setMessage(file.thumbPath ? "" : "File is too large to preview");
      return;
    }
    setImageUrl(null);
    setMessage("Loading preview…");
    const host = mountRef.current;
    if (!host) return;

    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const material = new THREE.MeshStandardMaterial({ metalness: 0.05, roughness: 0.62 });
    const light = cssVar("--color-accent-contrast");
    scene.add(new THREE.AmbientLight(light, 0.7));
    const key = new THREE.DirectionalLight(light, 1.05);
    key.position.set(3, 4, 5);
    scene.add(key);
    host.appendChild(renderer.domElement);

    const applyTheme = () => {
      const bg = cssVar("--viewer-bg");
      const mesh = cssVar("--viewer-mesh");
      scene.background = new THREE.Color(bg);
      material.color = new THREE.Color(mesh);
    };
    applyTheme();

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height);
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
    fetch(url)
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
          loaded.traverse((child) => {
            if (child instanceof THREE.Mesh) child.material = material;
          });
          group.add(loaded);
        } else {
          const loaded = new ThreeMFLoader().parse(buffer);
          loaded.traverse((child) => {
            if (child instanceof THREE.Mesh) child.material = material;
          });
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
        setMessage("");
      })
      .catch(() => {
        if (!disposed) setMessage("Preview unavailable");
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [file, theme]);

  return (
    <div className="viewer">
      {imageUrl ? <img src={imageUrl} alt="" /> : <div ref={mountRef} className="viewer-canvas" />}
      {message ? <p className="viewer-message">{message}</p> : null}
    </div>
  );
}
