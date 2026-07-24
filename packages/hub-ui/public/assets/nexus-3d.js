/**
 * Holographic network map — Three.js via CDN (opt-in WebGL panel).
 */

export function initNexus3D(container, data = {}) {
  if (!container || typeof THREE === 'undefined') {
    container.innerHTML = '<div class="meta">WebGL map unavailable</div>';
    return null;
  }

  const w = container.clientWidth || 400;
  const h = 220;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  camera.position.z = 8;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const nodes = [];
  const planes = ['hub', 'lan', 'edge', 'audit', 'genome', 'mesh'];
  const geo = new THREE.SphereGeometry(0.15, 16, 16);

  planes.forEach((p, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: p === 'hub' ? 0x39bae6 : p === 'lan' ? 0x7fd962 : 0xc678dd,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = (i / planes.length) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 3, Math.sin(angle) * 2, 0);
    scene.add(mesh);
    nodes.push(mesh);
  });

  const attacks = (data.feed || []).slice(0, 12);
  const attackMeshes = [];
  attacks.forEach((e, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf07178 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
    const t = i / Math.max(1, attacks.length);
    m.position.set(-4 + t * 8, Math.sin(t * 6) * 1.5, 0.5);
    scene.add(m);
    attackMeshes.push({ mesh: m, t, ip: e.ip });
  });

  let frame = 0;
  function animate() {
    frame++;
    nodes.forEach((n, i) => {
      n.position.y += Math.sin(frame * 0.02 + i) * 0.002;
    });
    attackMeshes.forEach((a) => {
      a.mesh.position.x += 0.02;
      if (a.mesh.position.x > 4) a.mesh.position.x = -4;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  return { scene, renderer, destroy: () => renderer.dispose() };
}