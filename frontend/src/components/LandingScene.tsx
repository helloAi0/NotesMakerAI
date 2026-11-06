import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** Decorative 3D scene: a wireframe knowledge-crystal, orbiting rings and a drifting star field that reacts to the pointer. */
export default function LandingScene({ onFail }: { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { onFail(); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100); cam.position.set(0, 0, 7);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.85 }));
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: 0xfde68a }));
    const rings = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(2.3 + i * 0.55, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: [0x38bdf8, 0xa78bfa, 0x34d399][i], transparent: true, opacity: 0.7 })); m.rotation.set(Math.PI / 2.6 * (i + 1), i, 0); return m; });
    const N = 700, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const r = 4 + Math.random() * 9, a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1); pos[i * 3] = r * Math.sin(b) * Math.cos(a); pos[i * 3 + 1] = r * Math.sin(b) * Math.sin(a); pos[i * 3 + 2] = r * Math.cos(b) - 2; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.8, sizeAttenuation: true }));
    const group = new THREE.Group(); group.add(core, inner, ...rings); scene.add(group, stars);
    const size = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h); cam.aspect = w / h; cam.position.z = w < 600 ? 9.5 : 7; cam.updateProjectionMatrix(); group.position.x = w < 800 ? 0 : 2.2; };
    size(); const ro = new ResizeObserver(size); ro.observe(el);
    const mouse = { x: 0, y: 0 }; const mv = (e: PointerEvent) => { mouse.x = (e.clientX / window.innerWidth - 0.5) * 2; mouse.y = (e.clientY / window.innerHeight - 0.5) * 2; }; window.addEventListener('pointermove', mv);
    let raf = 0, t0 = performance.now(), visible = !document.hidden; const vis = () => { visible = !document.hidden; if (visible && !raf && !reduce) raf = requestAnimationFrame(loop); }; document.addEventListener('visibilitychange', vis);
    function frame(t: number) { group.rotation.y = t * 0.12; group.rotation.x = Math.sin(t * 0.2) * 0.2; inner.rotation.y = -t * 0.5; rings.forEach((r, i) => { r.rotation.z = t * (0.15 + i * 0.07); }); stars.rotation.y = t * 0.015; cam.position.x += (mouse.x * 0.6 - cam.position.x) * 0.04; cam.position.y += (-mouse.y * 0.4 - cam.position.y) * 0.04; cam.lookAt(0, 0, 0); renderer.render(scene, cam); }
    function loop(now: number) { raf = 0; if (!visible) return; frame((now - t0) / 1000); raf = requestAnimationFrame(loop); }
    if (reduce) frame(1.2); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', mv); document.removeEventListener('visibilitychange', vis); scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | undefined; mat?.dispose(); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [onFail]);
  return <div ref={host} className="absolute inset-0" data-testid="landing-canvas" />;
}
