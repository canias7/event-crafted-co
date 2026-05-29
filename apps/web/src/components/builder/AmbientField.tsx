import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * AmbientField — a slow, low-opacity drift of warm bokeh particles rendered
 * with three.js. Pure ambient atmosphere behind the builder's empty /
 * "Designing…" preview states; it mounts only when there's no site to preview,
 * so there's no WebGL cost during normal editing.
 *
 * Written imperatively (no react-three-fiber JSX) to stay fully type-safe under
 * this app's tsconfig, and to keep teardown/resize handling explicit.
 *
 * Lazy-loaded by WebsiteBuilderPage and skipped when the user prefers reduced
 * motion.
 */

const COUNT = 90;
// Warm champagne / gold / wine flecks — echoes the luxury invitation palette.
const PALETTE = ["#c9a86a", "#d4a857", "#f5ead5", "#8b2c2c", "#b9a76d"];

function softCircleTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export default function AmbientField() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 9;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); // transparent
    mount.appendChild(renderer.domElement);

    // Particle geometry
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const col = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
      col.set(PALETTE[(Math.random() * PALETTE.length) | 0]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      speeds[i] = 0.04 + Math.random() * 0.09;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const texture = softCircleTexture();
    const material = new THREE.PointsMaterial({
      size: 0.42,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const clock = new THREE.Clock();
    let raf = 0;
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;

    const tick = () => {
      const delta = clock.getDelta();
      const t = clock.elapsedTime;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] += speeds[i] * delta; // gentle upward drift
        arr[i * 3] += Math.sin(t * 0.2 + i) * 0.0008; // subtle sway
        if (arr[i * 3 + 1] > 5.5) arr[i * 3 + 1] = -5.5; // wrap
      }
      posAttr.needsUpdate = true;
      points.rotation.z += delta * 0.012;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
