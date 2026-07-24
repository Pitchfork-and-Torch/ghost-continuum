/**
 * Omega Holographic Intrusion Map — Three.js WebGL with canvas 2D fallback.
 * Performance: instanced-friendly node meshes, LOD by distance, frustum-friendly
 * camera, requestAnimationFrame loop targeting 60fps.
 *
 * Dependency: three@0.160 via importmap CDN (documented fallback below).
 */

const STATE_COLORS = {
  protected: 0x00e5ff,
  healthy: 0x00e5ff,
  threat: 0xb388ff,
  breach: 0xff1744,
  compromised: 0xff1744,
  sentinel: 0x69f0ae,
  guardian: 0x69f0ae,
  morphing: 0xe040fb,
};

function hexCss(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} callbacks
 */
export async function createHoloMap(container, callbacks = {}) {
  if (!container) return null;

  let THREE;
  try {
    // Prefer vendored offline build when present (air-gapped cabins).
    // Place three.module.js at packages/hub-ui/public/vendor/three.module.js
    try {
      THREE = await import('/vendor/three.module.js');
    } catch {
      THREE = await import('three');
    }
  } catch (e) {
    console.warn('[holo-map] Three.js unavailable, canvas fallback', e);
    return createCanvasFallback(container, callbacks);
  }

  const state = {
    scene: null,
    camera: null,
    renderer: null,
    nodes: [],
    nodeMeshes: new Map(),
    linkLines: [],
    particles: [],
    shells: [],
    labels: [],
    grid: null,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    data: null,
    morph: 'research',
    showShells: true,
    scrubT: 1,
    selectedId: null,
    frame: 0,
    animId: null,
    disposed: false,
    orbitPaused: localStorage.getItem('gc-orbit-paused') === '1',
    orbit: { theta: 0.55, phi: 0.85, radius: 14, target: new THREE.Vector3(0, 0.3, 0) },
    drag: null,
    momentum: { dTheta: 0, dPhi: 0 },
    clock: typeof performance !== 'undefined' ? performance.now() : 0,
  };

  const w0 = container.clientWidth || 640;
  const h0 = container.clientHeight || 400;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03040a, 0.045);
  state.scene = scene;

  const camera = new THREE.PerspectiveCamera(48, w0 / h0, 0.1, 120);
  state.camera = camera;
  updateCamera();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w0, h0);
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  state.renderer = renderer;

  // Ambient + key lights for bloom-ish glow (without post stack dep)
  scene.add(new THREE.AmbientLight(0x406080, 0.55));
  const key = new THREE.PointLight(0x00e5ff, 1.2, 40);
  key.position.set(4, 8, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0xe040fb, 0.7, 35);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // Perspective grid plane
  const grid = new THREE.GridHelper(14, 28, 0x00e5ff, 0x123050);
  grid.position.y = 0;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);
  state.grid = grid;

  // Floor disc glow
  const floorGeo = new THREE.CircleGeometry(7, 64);
  const floorMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  scene.add(floor);

  // Axis hint (subtle)
  const axes = new THREE.AxesHelper(1.2);
  axes.position.set(-6.2, 0.05, -6.2);
  axes.material && (axes.material.opacity = 0.3);
  scene.add(axes);

  function updateCamera() {
    const { theta, phi, radius, target } = state.orbit;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    camera.lookAt(target);
  }

  function clearDynamic() {
    for (const m of state.nodeMeshes.values()) {
      scene.remove(m.group);
      m.mesh.geometry?.dispose();
      m.mesh.material?.dispose();
      m.glow?.geometry?.dispose();
      m.glow?.material?.dispose();
    }
    state.nodeMeshes.clear();
    for (const l of state.linkLines) {
      scene.remove(l.line);
      l.line.geometry?.dispose();
      l.line.material?.dispose();
    }
    state.linkLines = [];
    for (const p of state.particles) {
      scene.remove(p.points);
      p.points.geometry?.dispose();
      p.points.material?.dispose();
    }
    state.particles = [];
    for (const s of state.shells) {
      scene.remove(s);
      s.geometry?.dispose();
      s.material?.dispose();
    }
    state.shells = [];
    for (const lab of state.labels) {
      lab.el?.remove();
    }
    state.labels = [];
  }

  function geometryForShape(shape, r, THREE) {
    const s = shape || 'sphere';
    switch (s) {
      case 'icosahedron':
        return new THREE.IcosahedronGeometry(r, 1);
      case 'octahedron':
        return new THREE.OctahedronGeometry(r, 0);
      case 'box':
        return new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6);
      case 'tetrahedron':
        return new THREE.TetrahedronGeometry(r * 1.35, 0);
      case 'torus':
        return new THREE.TorusGeometry(r * 0.85, r * 0.28, 10, 20);
      case 'dodecahedron':
        return new THREE.DodecahedronGeometry(r, 0);
      case 'sphere':
      default:
        return new THREE.SphereGeometry(r, 16, 16);
    }
  }

  function makeNode(node) {
    const color = STATE_COLORS[node.state] || STATE_COLORS.protected;
    const group = new THREE.Group();
    const r = node.radius || 0.18;
    const shape = node.shape || (node.isCore ? 'icosahedron' : 'sphere');
    const geo = geometryForShape(shape, r, THREE);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.65 + (node.glow || 0.5) * 0.4,
      metalness: 0.2,
      roughness: 0.35,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { id: node.id, node };
    group.add(mesh);

    // Outer glow shell
    const glowGeo = new THREE.SphereGeometry(r * 1.55, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12 + (node.glow || 0.5) * 0.08,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);

    // Selection ring (hidden until selected)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.9, 0.02, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const pos = node.position || { x: 0, y: 0.3, z: 0 };
    group.position.set(pos.x, pos.y, pos.z);

    // HTML label overlay
    const el = document.createElement('div');
    el.className = 'holo-node-label';
    el.textContent = node.displayLabel || node.label || node.id;
    el.style.cssText = `
      position:absolute; pointer-events:none; font-family:Orbitron,sans-serif;
      font-size:9px; letter-spacing:0.06em; color:${hexCss(color)};
      text-shadow:0 0 8px ${hexCss(color)}; white-space:nowrap; opacity:0.9;
      transform:translate(-50%,-120%);
    `;
    container.appendChild(el);

    scene.add(group);
    const entry = { group, mesh, glow, ring, node, el, baseY: pos.y, color, shape };
    state.nodeMeshes.set(node.id, entry);
    state.labels.push({ el, group, node });
    if (state.selectedId === node.id) {
      ring.material.opacity = 0.85;
      ring.material.color.set(0xffffff);
    }
    return entry;
  }

  function makeLink(conn) {
    if (!conn.fromPos || !conn.toPos) return;
    const pts = [
      new THREE.Vector3(conn.fromPos.x, conn.fromPos.y, conn.fromPos.z),
      new THREE.Vector3(
        (conn.fromPos.x + conn.toPos.x) / 2,
        Math.max(conn.fromPos.y, conn.toPos.y) + 0.6 + (conn.kind === 'breach' ? 0.4 : 0),
        (conn.fromPos.z + conn.toPos.z) / 2,
      ),
      new THREE.Vector3(conn.toPos.x, conn.toPos.y, conn.toPos.z),
    ];
    const curve = new THREE.QuadraticBezierCurve3(pts[0], pts[1], pts[2]);
    const points = curve.getPoints(24);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const color = parseInt(String(conn.color || '#00e5ff').replace('#', ''), 16) || 0x00e5ff;
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: conn.kind === 'breach' ? 0.95 : 0.55,
      linewidth: 1,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    state.linkLines.push({ line, conn, curve, color, t: Math.random() });

    if (conn.particles) {
      const count = 24;
      const positions = new Float32Array(count * 3);
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pmat = new THREE.PointsMaterial({
        color,
        size: 0.08,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const pointsObj = new THREE.Points(pgeo, pmat);
      scene.add(pointsObj);
      state.particles.push({ points: pointsObj, curve, count, speed: 0.008 + Math.random() * 0.01, phase: Math.random() });
    }
  }

  function makeShells(shells = []) {
    if (!state.showShells) return;
    for (const s of shells) {
      if (s.enabled === false) continue;
      const geo = new THREE.RingGeometry(s.radius - 0.04, s.radius + 0.04, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: parseInt(String(s.color || '#00e5ff').replace('#', ''), 16),
        transparent: true,
        opacity: 0.08 + (s.health || 0.5) * 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02 + (s.radius || 3) * 0.01;
      scene.add(mesh);
      state.shells.push(mesh);
    }
  }

  function makePredictive(cones = []) {
    for (const c of cones) {
      if (!c.fromPos || !c.toPos) continue;
      makeLink({
        fromPos: c.fromPos,
        toPos: c.toPos,
        color: c.color || '#ffab40',
        kind: 'threat',
        particles: true,
        predictive: true,
      });
    }
  }

  function setData(data) {
    if (!data) return;
    state.data = data;
    state.morph = data.morph || state.morph;
    clearDynamic();

    const fog = data.visual?.fogDensity ?? 0.045;
    scene.fog.density = fog;
    if (grid?.material) {
      grid.material.opacity = state.morph === 'stealth' ? 0.2 : 0.35;
    }

    const nodes = data.nodes || [];
    // LOD: if many nodes, skip labels for far ones later
    for (const n of nodes) makeNode(n);
    for (const c of data.connections || []) makeLink(c);
    makeShells(data.shells || []);
    makePredictive(data.predictive || []);
  }

  function projectLabel(entry) {
    const pos = entry.group.position.clone();
    pos.y += 0.35;
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-pos.y * 0.5 + 0.5) * container.clientHeight;
    if (pos.z > 1) {
      entry.el.style.display = 'none';
      return;
    }
    entry.el.style.display = 'block';
    entry.el.style.left = `${x}px`;
    entry.el.style.top = `${y}px`;
    // LOD: hide small/far labels
    const dist = camera.position.distanceTo(entry.group.position);
    entry.el.style.opacity = dist > 18 ? '0' : dist > 12 ? '0.4' : '0.9';
  }

  function animate() {
    if (state.disposed) return;
    state.animId = requestAnimationFrame(animate);
    state.frame++;

    // Momentum orbit (skippable when paused / reduced-motion — manual drag still works)
    const reduceMotion =
      state.reduceMotion ??
      (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    state.reduceMotion = reduceMotion;
    if (reduceMotion) {
      state.momentum.dTheta = 0;
      state.momentum.dPhi = 0;
    } else if (!state.orbitPaused && !state.drag) {
      state.orbit.theta += state.momentum.dTheta;
      state.orbit.phi += state.momentum.dPhi;
      state.momentum.dTheta *= 0.92;
      state.momentum.dPhi *= 0.92;
      // Idle slow spin
      state.orbit.theta += 0.0012;
    } else if (state.orbitPaused && !state.drag) {
      state.momentum.dTheta *= 0.85;
      state.momentum.dPhi *= 0.85;
      state.orbit.theta += state.momentum.dTheta;
      state.orbit.phi += state.momentum.dPhi;
    }
    state.orbit.phi = Math.max(0.25, Math.min(1.35, state.orbit.phi));
    updateCamera();

    const t = state.frame * 0.016;

    // Breathing nodes
    for (const entry of state.nodeMeshes.values()) {
      const breath = entry.node.breathing ? Math.sin(t * 1.4 + entry.baseY * 3) * 0.04 : 0;
      entry.group.position.y = entry.baseY + breath;
      if (entry.node.isCore) {
        entry.group.rotation.y += 0.008;
        entry.group.rotation.x = Math.sin(t * 0.5) * 0.1;
      }
      // Ghost scrub: fade future nodes
      if (state.scrubT < 1 && entry.node.ts) {
        const range = state.data?.timeRange;
        if (range) {
          const norm = (entry.node.ts - range.min) / Math.max(1, range.max - range.min);
          const visible = norm <= state.scrubT + 0.02;
          entry.group.visible = visible;
          entry.el.style.visibility = visible ? 'visible' : 'hidden';
          if (visible && norm > state.scrubT - 0.08) {
            entry.mesh.material.opacity = 0.45;
          } else if (visible) {
            entry.mesh.material.opacity = 0.95;
          }
        }
      } else {
        entry.group.visible = true;
        entry.el.style.visibility = 'visible';
        entry.mesh.material.opacity = 0.95;
      }
      projectLabel(entry);
    }

    // Pulse links
    for (const l of state.linkLines) {
      const pulse = 0.4 + 0.35 * Math.sin(t * (2 + (l.conn.pulse || 1)) + l.t * 10);
      l.line.material.opacity = (l.conn.kind === 'breach' ? 0.55 : 0.3) + pulse * 0.4;
    }

    // Particle trails along curves
    for (const p of state.particles) {
      const pos = p.points.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = (p.phase + t * p.speed * 8 + i / p.count) % 1;
        const pt = p.curve.getPoint(u);
        pos.setXYZ(i, pt.x, pt.y, pt.z);
      }
      pos.needsUpdate = true;
    }

    // Shell spin
    for (let i = 0; i < state.shells.length; i++) {
      state.shells[i].rotation.z = t * 0.05 * (i % 2 === 0 ? 1 : -1);
    }

    renderer.render(scene, camera);
  }

  // Pointer interaction
  function onPointerDown(e) {
    state.drag = { x: e.clientX, y: e.clientY, theta: state.orbit.theta, phi: state.orbit.phi };
    state.momentum.dTheta = 0;
    state.momentum.dPhi = 0;
  }
  function onPointerMove(e) {
    const rect = container.getBoundingClientRect();
    state.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (state.drag) {
      const dx = e.clientX - state.drag.x;
      const dy = e.clientY - state.drag.y;
      state.orbit.theta = state.drag.theta + dx * 0.005;
      state.orbit.phi = state.drag.phi + dy * 0.004;
      state.momentum.dTheta = dx * 0.0003;
      state.momentum.dPhi = dy * 0.0002;
      return;
    }

    // Hover raycast
    state.raycaster.setFromCamera(state.pointer, camera);
    const meshes = [...state.nodeMeshes.values()].map((e) => e.mesh);
    const hits = state.raycaster.intersectObjects(meshes, false);
    const tip = document.getElementById('holoTooltip');
    if (hits.length && tip) {
      const n = hits[0].object.userData.node;
      tip.hidden = false;
      tip.textContent = `${n.displayLabel || n.label || n.id} · ${n.state || ''} · score ${n.score ?? '—'}`;
      tip.style.left = `${e.clientX - rect.left + 12}px`;
      tip.style.top = `${e.clientY - rect.top + 12}px`;
      container.style.cursor = 'pointer';
    } else if (tip) {
      tip.hidden = true;
      container.style.cursor = state.drag ? 'grabbing' : (state.orbitPaused ? 'default' : 'grab');
    }
  }
  function setSelected(id) {
    state.selectedId = id || null;
    for (const e of state.nodeMeshes.values()) {
      if (e.ring?.material) {
        const on = e.node.id === state.selectedId;
        e.ring.material.opacity = on ? 0.9 : 0;
        e.ring.material.color.set(on ? 0xffffff : 0x00e5ff);
      }
    }
  }
  function onPointerUp(e) {
    const wasDrag = state.drag;
    state.drag = null;
    if (!wasDrag) return;
    const moved = Math.hypot(e.clientX - wasDrag.x, e.clientY - wasDrag.y);
    if (moved > 5) return;

    state.raycaster.setFromCamera(state.pointer, camera);
    const meshes = [...state.nodeMeshes.values()].map((x) => x.mesh);
    const hits = state.raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const node = hits[0].object.userData.node;
      setSelected(node.id);
      // Single click opens full glass inspector
      callbacks.onSelect?.(node);
      callbacks.onOpen?.(node);
    }
  }
  function onWheel(e) {
    e.preventDefault();
    state.orbit.radius = Math.max(6, Math.min(28, state.orbit.radius + e.deltaY * 0.01));
  }
  function onDblClick(e) {
    state.raycaster.setFromCamera(state.pointer, camera);
    const meshes = [...state.nodeMeshes.values()].map((x) => x.mesh);
    const hits = state.raycaster.intersectObjects(meshes, false);
    if (hits.length) callbacks.onOpen?.(hits[0].object.userData.node);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('dblclick', onDblClick);

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 400;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  animate();

  return {
    setData,
    setMorph(morph) {
      state.morph = morph;
      if (state.data) {
        state.data.morph = morph;
        setData(state.data);
      }
    },
    setScrub(t) {
      state.scrubT = Math.max(0, Math.min(1, t));
    },
    setOrbitPaused(paused) {
      state.orbitPaused = !!paused;
      localStorage.setItem('gc-orbit-paused', state.orbitPaused ? '1' : '0');
      if (state.orbitPaused) {
        state.momentum.dTheta = 0;
        state.momentum.dPhi = 0;
      }
      return state.orbitPaused;
    },
    toggleOrbitPaused() {
      return this.setOrbitPaused(!state.orbitPaused);
    },
    isOrbitPaused() {
      return !!state.orbitPaused;
    },
    focusThreat() {
      for (const e of state.nodeMeshes.values()) {
        if (e.node.state === 'breach' || e.node.state === 'threat') {
          state.orbit.target.copy(e.group.position);
          state.orbit.radius = 9;
          break;
        }
      }
    },
    focusNode(id) {
      const e = state.nodeMeshes.get(id);
      if (!e) return;
      state.orbit.target.copy(e.group.position);
      state.orbit.radius = Math.min(state.orbit.radius, 10);
      setSelected(id);
    },
    resetCamera() {
      state.orbit = { theta: 0.55, phi: 0.85, radius: 14, target: new THREE.Vector3(0, 0.3, 0) };
    },
    toggleShells(on) {
      state.showShells = on !== false;
      if (state.data) setData(state.data);
    },
    /** Live-update label/shape after operator edit without full scene rebuild when possible */
    updateNodeAppearance(id, { displayLabel, shape } = {}) {
      const e = state.nodeMeshes.get(id);
      if (!e) return false;
      if (displayLabel != null) {
        e.node.displayLabel = displayLabel;
        e.node.label = displayLabel;
        if (e.el) e.el.textContent = displayLabel;
      }
      if (shape && shape !== e.shape) {
        const r = e.node.radius || 0.18;
        const oldGeo = e.mesh.geometry;
        e.mesh.geometry = geometryForShape(shape, r, THREE);
        oldGeo?.dispose();
        e.shape = shape;
        e.node.shape = shape;
      }
      return true;
    },
    getNode(id) {
      return state.nodeMeshes.get(id)?.node || null;
    },
    clearSelection() {
      setSelected(null);
    },
    celebrate(nodeId) {
      const e = state.nodeMeshes.get(nodeId);
      if (!e) return;
      e.mesh.material.emissiveIntensity = 2.5;
      setTimeout(() => {
        if (e.mesh?.material) e.mesh.material.emissiveIntensity = 0.8;
      }, 2000);
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(state.animId);
      clearDynamic();
      ro.disconnect();
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}

/** Canvas 2D fallback when Three.js CDN blocked / WebGL unavailable */
function createCanvasFallback(container, callbacks) {
  const canvas = document.createElement('canvas');
  canvas.className = 'holo-fallback-canvas';
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let data = null;
  let frame = 0;
  let scrubT = 1;
  let animId = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 400;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function project(pos, w, h) {
    // Simple perspective
    const scale = 28;
    const camY = 8;
    const camZ = 14;
    const x = pos.x;
    const y = pos.y;
    const z = pos.z;
    const pz = z + camZ;
    const f = 280 / Math.max(4, pz);
    return {
      x: w / 2 + x * f * (scale / 28),
      y: h * 0.62 - (y * f + camY * 2),
      s: f * 0.12,
    };
  }

  function draw() {
    frame++;
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 400;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      const a = project({ x: i, y: 0, z: -6 }, w, h);
      const b = project({ x: i, y: 0, z: 6 }, w, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const c = project({ x: -6, y: 0, z: i }, w, h);
      const d = project({ x: 6, y: 0, z: i }, w, h);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }

    if (!data?.nodes) {
      animId = requestAnimationFrame(draw);
      return;
    }

    // Links
    for (const c of data.connections || []) {
      if (!c.fromPos || !c.toPos) continue;
      const a = project(c.fromPos, w, h);
      const b = project(c.toPos, w, h);
      ctx.strokeStyle = c.color || '#00e5ff';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(frame * 0.05);
      ctx.lineWidth = c.kind === 'breach' ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 40, b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nodes
    const range = data.timeRange;
    for (const n of data.nodes) {
      if (scrubT < 1 && range && n.ts) {
        const norm = (n.ts - range.min) / Math.max(1, range.max - range.min);
        if (norm > scrubT) continue;
      }
      const p = project(n.position || { x: 0, y: 0.3, z: 0 }, w, h);
      const breath = Math.sin(frame * 0.04 + (n.position?.x || 0)) * 3;
      const color = n.color || '#00e5ff';
      const r = 6 + (n.radius || 0.2) * 20;
      const g = ctx.createRadialGradient(p.x, p.y + breath, 0, p.x, p.y + breath, r * 2);
      g.addColorStop(0, color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y + breath, r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y + breath, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = '600 9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.label || n.id, p.x, p.y + breath - r - 4);
    }

    animId = requestAnimationFrame(draw);
  }
  draw();

  canvas.addEventListener('click', (e) => {
    if (!data?.nodes) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    for (const n of data.nodes) {
      const p = project(n.position || { x: 0, y: 0, z: 0 }, w, h);
      if (Math.hypot(mx - p.x, my - p.y) < 16) {
        callbacks.onSelect?.(n);
        if (e.detail === 2) callbacks.onOpen?.(n);
        break;
      }
    }
  });

  let orbitPaused = localStorage.getItem('gc-orbit-paused') === '1';
  return {
    setData(d) { data = d; },
    setMorph() {},
    setScrub(t) { scrubT = t; },
    setOrbitPaused(p) {
      orbitPaused = !!p;
      localStorage.setItem('gc-orbit-paused', orbitPaused ? '1' : '0');
      return orbitPaused;
    },
    toggleOrbitPaused() {
      return this.setOrbitPaused(!orbitPaused);
    },
    isOrbitPaused() { return orbitPaused; },
    focusThreat() {},
    focusNode() {},
    resetCamera() {},
    toggleShells() {},
    updateNodeAppearance() { return false; },
    getNode() { return null; },
    clearSelection() {},
    celebrate() {},
    dispose() {
      cancelAnimationFrame(animId);
      container.innerHTML = '';
    },
  };
}
