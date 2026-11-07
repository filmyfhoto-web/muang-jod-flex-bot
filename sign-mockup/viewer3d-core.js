/* ตัวดูป้าย 3 มิติ (ใช้ร่วมกัน 2 ที่)
 *   1) หน้าลิงก์ส่งลูกค้า /sign/v/<id> (viewer3d.js โหลดไฟล์ .glb จากเซิร์ฟเวอร์)
 *   2) ไฟล์ HTML พรีวิว 3 มิติ ที่ส่งออกจากแอป (vendor/viewer3d.standalone.js = ไฟล์นี้ + three.js รวมเป็นไฟล์เดียว
 *      ฝังในไฟล์ HTML พร้อมโมเดล เปิดดับเบิลคลิกได้เลย ไม่ต้องใช้เน็ต)
 *      แก้ไฟล์นี้แล้วต้องสร้างใหม่: node sign-mockup/tools/build-viewer.mjs (มีเทสต์เช็กว่าสร้างตรงรุ่น)
 *
 * วางป้ายบนพื้นมีเงา หมุนโชว์เองจนกว่าลูกค้าจะลากหมุนเอง
 * ใช้ element ตาม id: c (canvas) stage load hint · ปุ่ม spin reset zoom full shot (ไม่มีก็ได้) · poster (รูปสำรองเครื่องที่ไม่มี 3 มิติ)
 * ไฟล์ที่มีรูปหน้างาน (extras npPhoto) → เปิดมาเห็นเหมือนรูปถ่าย ขยับมุมได้ช่วงหนึ่ง ซูมดูป้ายได้ (ปุ่ม zoom / แตะสองครั้ง)
 * opts: { url } หรือ { glb: ArrayBuffer } · name = ชื่อไฟล์ตอนบันทึกรูป */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';

export function mountViewer(opts) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const stage = $('stage');
  const load = $('load');
  const fail = (msg) => {
    if (load) {
      load.hidden = false;
      load.textContent = msg;
    }
    const poster = $('poster');
    if (poster) poster.hidden = false;
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    fail('เครื่องนี้เปิดภาพ 3 มิติไม่ได้ — ดูรูปตัวอย่างแทน');
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495; // ไม่มุดใต้พื้น
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ca, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2.5, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1, 96),
    new THREE.MeshBasicMaterial({ color: 0x1f2a4d, transparent: true, opacity: 0.12, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  scene.add(ring);

  let home = null;
  let photo = null; // ฉากรูปหน้างาน (ไฟล์มีรูปถ่าย + ข้อมูลกล้องของรูป)
  let focus = null; // จุดซูมดูป้าย { target, size:[w,h], normal }
  let tween = null;
  let zoomed = false;
  let sway = null; // ฉากรูปหน้างาน: ส่ายกล้องซ้าย-ขวาเบา ๆ แทนหมุนรอบ
  function frame(box) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z * 1.5) * 0.5;
    const fov = (camera.fov * Math.PI) / 180;
    const fit = r / Math.sin(fov / 2) / Math.min(1, camera.aspect * 0.95);
    const dist = Math.max(fit * 1.05, Math.min(0.6, r * 4));
    const target = new THREE.Vector3(center.x, center.y, center.z);
    const pos = new THREE.Vector3(center.x + dist * Math.sin(0.55), center.y + dist * 0.18, center.z + dist * Math.cos(0.55));
    home = { pos, target };
    camera.position.copy(pos);
    camera.near = Math.max(0.005, dist / 200);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = r * 0.6;
    controls.maxDistance = dist * 3;
    const gr = Math.max(size.x, size.z) * 1.3 + Math.min(0.4, r);
    ground.scale.setScalar(gr);
    ring.scale.setScalar(gr);
    ground.position.set(center.x, 0, center.z);
    ring.position.set(center.x, 0.001, center.z);
    sun.target.position.copy(target);
    const s = sun.shadow.camera;
    s.left = s.bottom = -gr;
    s.right = s.top = gr;
    s.near = 0.1;
    s.far = 30;
    s.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    if (photo) fitPhoto();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const show = (gltf) => {
    const model = gltf.scene;
    let info = null;
    let holder = null;
    model.traverse((o) => {
      if (!info && o.userData && o.userData.npPhoto) {
        info = o.userData.npPhoto;
        holder = o;
      }
    });
    if (info) {
      showPhoto(model, holder, info);
      if (load) load.hidden = true;
      return;
    }
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    // วางป้ายตรงกลางวง ขอบล่างแตะพื้น
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    box.setFromObject(model);
    frame(box);
    const fc = box.getCenter(new THREE.Vector3());
    const fs = box.getSize(new THREE.Vector3());
    focus = { target: new THREE.Vector3(fc.x, fc.y, box.max.z), size: [fs.x, fs.y], normal: new THREE.Vector3(0, 0.12, 1).normalize() };
    if (load) load.hidden = true;
  };

  /* ฉากรูปหน้างาน: เปิดมาเห็นเหมือนรูปถ่าย (กล้องตำแหน่งเดียวกับตอนถ่าย) ขยับมุมได้ช่วงหนึ่ง ซูมเข้าไปดูป้ายได้
   * กล้องหันหาป้ายเสมอ — เลื่อนจุดกึ่งกลางภาพ (principal point) ให้ป้ายอยู่ตำแหน่งเดิมในรูป ซูมเข้าค่อย ๆ เลื่อนป้ายมากลางจอ */
  function showPhoto(model, holder, info) {
    // หมุนทั้งฉากให้ "ด้านบน" ของกล้องตอนถ่าย = ด้านบนของจอ (รูปไม่เอียง ถึงถือมือถือเอียงนิด ๆ ตอนถ่าย)
    model.updateMatrixWorld(true);
    const q00 = new THREE.Quaternion().fromArray(info.quat).premultiply(new THREE.Quaternion().setFromRotationMatrix(holder.matrixWorld));
    const pivot = new THREE.Group();
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0).applyQuaternion(q00), new THREE.Vector3(0, 1, 0));
    pivot.add(model);
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const bg = /^NadponPhoto/.test(o.name);
      o.castShadow = !bg;
      o.receiveShadow = false;
      if (bg) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.toneMapped = false));
    });
    ground.visible = ring.visible = false;
    stage.classList.add('v-photo');
    const m = holder.matrixWorld;
    const pos = new THREE.Vector3().fromArray(info.pos).applyMatrix4(m);
    const target = new THREE.Vector3().fromArray(info.target).applyMatrix4(m);
    const q0 = new THREE.Quaternion().fromArray(info.quat).premultiply(new THREE.Quaternion().setFromRotationMatrix(m));
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const d0 = pos.distanceTo(target);
    photo = { pos, target, q0, d0, fov: info.fov, aspect: info.aspect, ndc: new THREE.Vector2(), dMin: 0 };
    focus = { target: target.clone(), size: info.size, normal };
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.target.copy(target);
    camera.position.copy(pos);
    camera.near = Math.max(0.01, d0 / 300);
    camera.far = d0 * 12 + 30;
    fitPhoto();
    camera.updateProjectionMatrix();
    photo.dMin = Math.min(d0 * 0.9, closeDist(info.size) * 0.55);
    controls.minDistance = photo.dMin;
    controls.maxDistance = d0 * 1.02;
    const sph = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    // ขยับได้ซ้าย-ขวา ±23° ขึ้น-ลง ±13° (รูปถ่ายเป็นแผ่นเรียบ หมุนมากกว่านี้เห็นขอบรูปเยอะ)
    controls.minAzimuthAngle = sph.theta - 0.4;
    controls.maxAzimuthAngle = sph.theta + 0.4;
    controls.minPolarAngle = Math.max(0.12, sph.phi - 0.22);
    controls.maxPolarAngle = Math.min(Math.PI * 0.8, sph.phi + 0.22);
    controls.update();
    home = { pos: pos.clone(), target: target.clone() };
    sun.position.copy(target).add(new THREE.Vector3(1.5, 4, 3));
    sun.target.position.copy(target);
    const hint = $('hint');
    if (hint) hint.textContent = 'ลากเพื่อขยับมุม · ถ่างนิ้ว/แตะสองครั้งเพื่อซูมดูป้าย';
    setSpin(true);
  }
  // มุมกล้องของจอให้เห็นทั้งรูป (ไม่ครอป) + ตำแหน่งป้ายในรูป (NDC) สำหรับเลื่อนจุดกึ่งกลางภาพ
  function fitPhoto() {
    const tp = Math.tan((photo.fov * Math.PI) / 360);
    const tv = Math.max(tp, (tp * photo.aspect) / camera.aspect) * 1.06; // เผื่อขอบ (กล้องหันหาป้าย รูปเบี้ยวนิดหน่อย)
    camera.fov = (2 * Math.atan(tv) * 180) / Math.PI;
    const c = photo.target.clone().sub(photo.pos).applyQuaternion(photo.q0.clone().invert());
    photo.ndc.set(c.x / -c.z / (tv * camera.aspect), c.y / -c.z / tv);
  }
  function applyOffset() {
    const d = camera.position.distanceTo(controls.target);
    let k = (d - photo.dMin) / Math.max(1e-6, photo.d0 - photo.dMin);
    k = Math.max(0, Math.min(1, k));
    k = k * k * (3 - 2 * k);
    const e = camera.projectionMatrix.elements;
    e[8] = -photo.ndc.x * k;
    e[9] = -photo.ndc.y * k;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  // ระยะกล้องที่ป้ายเต็มจอราว 80%
  function closeDist(size) {
    const t = Math.tan((camera.fov * Math.PI) / 360);
    return Math.max(size[1] / 2 / t, size[0] / 2 / (t * camera.aspect)) / 0.8;
  }

  // ซูมดูป้ายใกล้ ๆ / กลับไปดูทั้งภาพ (ปุ่ม + แตะสองครั้ง)
  const zoomBtn = $('zoom');
  function setZoomLabel() {
    if (zoomBtn) {
      zoomBtn.textContent = zoomed ? 'ดูทั้งภาพ' : 'ซูมดูป้าย';
      zoomBtn.setAttribute('aria-pressed', String(zoomed));
    }
  }
  function flyTo(p1, c1) {
    tween = { t0: performance.now(), ms: 800, p0: camera.position.clone(), c0: controls.target.clone(), p1, c1 };
  }
  function toggleZoom() {
    if (!home || !focus) return;
    setSpin(false);
    zoomed = !zoomed;
    if (zoomed) {
      const dir = camera.position.clone().sub(focus.target).normalize().lerp(focus.normal, 0.55).normalize();
      const d = Math.max(controls.minDistance * 1.05, closeDist(focus.size));
      flyTo(focus.target.clone().add(dir.multiplyScalar(d)), focus.target.clone());
    } else flyTo(home.pos.clone(), home.target.clone());
    setZoomLabel();
  }
  if (zoomBtn) zoomBtn.addEventListener('click', toggleZoom);
  let tap = null;
  let lastTap = 0;
  canvas.addEventListener('pointerdown', (e) => {
    tap = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!tap || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12 || performance.now() - tap.t > 300) return;
    const now = performance.now();
    if (now - lastTap < 340) {
      lastTap = 0;
      toggleZoom();
    } else lastTap = now;
  });
  const err = () => fail('โหลดภาพ 3 มิติไม่สำเร็จ ลองเปิดใหม่อีกครั้ง');
  const loader = new GLTFLoader();
  if (opts && opts.glb) loader.parse(opts.glb, '', show, err);
  else loader.load(opts.url, show, undefined, err);

  // ลูกค้าแตะ/ลากเมื่อไหร่ หยุดหมุนอัตโนมัติ
  const spin = $('spin');
  function setSpin(on) {
    if (photo) {
      sway = on ? { t0: performance.now(), theta0: new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).theta } : null;
    } else controls.autoRotate = on;
    if (spin) spin.setAttribute('aria-pressed', String(on));
  }
  controls.addEventListener('start', () => {
    setSpin(false);
    const hint = $('hint');
    if (hint) hint.hidden = true;
  });
  if (spin) spin.addEventListener('click', () => setSpin(!(photo ? sway : controls.autoRotate)));
  const reset = $('reset');
  if (reset)
    reset.addEventListener('click', () => {
      if (!home) return;
      tween = null;
      zoomed = false;
      setZoomLabel();
      camera.position.copy(home.pos);
      controls.target.copy(home.target);
      controls.update();
    });
  const full = $('full');
  if (full)
    full.addEventListener('click', () => {
      const el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    });
  // บันทึกรูปมุมที่ดูอยู่ (PNG)
  const shot = $('shot');
  if (shot)
    shot.addEventListener('click', () => {
      renderer.render(scene, camera);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = ((opts && opts.name) || 'sign-3d') + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1500);
      }, 'image/png');
    });

  const sph = new THREE.Spherical();
  renderer.setAnimationLoop((now) => {
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.c0, tween.c1, e);
      if (k >= 1) tween = null;
    } else if (sway) {
      // ส่ายกล้องซ้าย-ขวา ±8° รอบป้าย เริ่มจากมุมเดิมแบบนุ่ม ๆ
      const off = camera.position.clone().sub(controls.target);
      sph.setFromVector3(off);
      sph.theta = sway.theta0 + 0.14 * Math.sin(((now - sway.t0) / 1000) * 0.75);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    }
    controls.update();
    if (photo) applyOffset();
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, controls };
}
