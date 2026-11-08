/* ตัวดูป้าย 3 มิติ (ใช้ร่วมกัน 2 ที่)
 *   1) หน้าลิงก์ส่งลูกค้า /sign/v/<id> (viewer3d.js โหลดไฟล์ .glb จากเซิร์ฟเวอร์)
 *   2) ไฟล์ HTML พรีวิว 3 มิติ ที่ส่งออกจากแอป (vendor/viewer3d.standalone.js = ไฟล์นี้ + three.js รวมเป็นไฟล์เดียว
 *      ฝังในไฟล์ HTML พร้อมโมเดล เปิดดับเบิลคลิกได้เลย ไม่ต้องใช้เน็ต)
 *      แก้ไฟล์นี้แล้วต้องสร้างใหม่: node sign-mockup/tools/build-viewer.mjs (มีเทสต์เช็กว่าสร้างตรงรุ่น)
 *
 * วางป้ายบนพื้นมีเงา หมุนโชว์เองจนกว่าลูกค้าจะลากหมุนเอง
 * ใช้ element ตาม id: c (canvas) stage load hint · ปุ่ม spin reset zoom full shot (ไม่มีก็ได้) · poster (รูปสำรองเครื่องที่ไม่มี 3 มิติ)
 * ไฟล์ที่มีรูปหน้างาน (extras npPhoto) → เปิดมาเห็นเหมือนรูปถ่าย ขยับมุมได้ช่วงหนึ่ง ซูมดูป้ายได้ (ปุ่ม zoom / แตะสองครั้ง)
 * ไฟล์ป้าย + ฉาก (extras npScene) → เปิดมามุมเดียวกับในแอป หมุนดูรอบ ๆ ได้ ซูมดูป้ายได้
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

  /* ลูกศรโค้งวนรอบป้าย (แบบโปรแกรม 3D อย่าง Blender): บอกว่าหมุนรอบได้ · แตะลูกศรซ้าย/ขวา = หมุนไปทางนั้น
   * ป้ายติดผนัง: ลูกศรอยู่หน้าผนังทั้งสองข้าง · ป้ายตั้งอิสระ: ลูกศรวนรอบข้างซ้าย-ขวา · ซูมเข้าใกล้ ลูกศรจางหายไม่บังป้าย */
  const orbitG = new THREE.Group();
  orbitG.visible = false;
  scene.add(orbitG);
  const ARC_A = 0.32; // ลูกศรจาง ๆ ไม่แย่งสายตาจากป้าย
  const arcMat = new THREE.MeshBasicMaterial({ color: 0x1f2a4d, transparent: true, opacity: ARC_A, depthWrite: false, toneMapped: false });
  let orbitR = 1;
  /* วงรีรอบป้าย (rx ตามความกว้าง · rz ตามความหนา) ลูกศรโค้ง 2 เส้นด้านหน้าซ้าย-ขวา หัวลูกศรชี้วนทางเดียวกัน
   * กล้องอยู่ระดับเดียวกับวง (มองแล้วเป็นเส้นตรง) → เอียงวงให้ด้านหน้าต่ำลง เห็นเป็นวงรีชัด ๆ แบบภาพโปรแกรม 3D */
  let orbitPts = []; // จุดบนลูกศร (ในวง) ไว้เช็กว่าแตะโดนลูกศรไหน
  function buildOrbit(center, rx, rz, front) {
    orbitG.clear();
    orbitPts = [];
    orbitG.position.copy(center);
    // แกนวงตามหน้าป้าย (ป้ายยื่นหันหน้าออกด้านข้าง ตั้งฉากกับผนัง)
    orbitG.rotation.set(0, front ? Math.atan2(front.x, front.z) : 0, 0);
    orbitR = Math.max(rx, rz);
    const tube = orbitR * 0.005; // เส้นบาง ๆ ตามขนาดชิ้นงาน (บัตรเล็กก็เส้นเล็ก)
    const make = (a0, a1, side) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = a0 + ((a1 - a0) * i) / 40;
        pts.push(new THREE.Vector3(rx * Math.sin(a), 0, rz * Math.cos(a)));
      }
      orbitPts.push(...pts.map((v) => [v, side]));
      const curve = new THREE.CatmullRomCurve3(pts);
      const arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, tube, 8), arcMat);
      arc.userData.side = side;
      const tip = pts[pts.length - 1];
      const tan = tip.clone().sub(pts[pts.length - 2]).normalize();
      const head = new THREE.Mesh(new THREE.ConeGeometry(tube * 3, tube * 8, 16), arcMat);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      head.position.copy(tip).addScaledVector(tan, tube * 3);
      head.userData.side = side;
      orbitG.add(arc, head);
    };
    // หน้าป้าย = มุม 0 (แกน +z) · ซ้ายวนลง ขวาวนขึ้น (เหมือนลูกศรวนรอบตัวในภาพตัวอย่าง)
    make(-0.25, -1.45, 'left');
    make(0.25, 1.45, 'right');
    // มุมเงยของกล้องเทียบวง: ต่ำกว่า ~22° เอียงวงเข้าหากล้อง
    const off = camera.position.clone().sub(center);
    const el = Math.atan2(off.y, Math.hypot(off.x, off.z));
    const tilt = Math.max(0, Math.min(0.42, 0.38 - el));
    const th = Math.atan2(off.x, off.z);
    orbitG.rotateOnWorldAxis(new THREE.Vector3(Math.cos(th), 0, -Math.sin(th)), tilt);
    // หน้าป้ายหันไปอีกฝั่ง (ป้ายยื่นมองจากด้านหลัง) ลูกศรด้านหน้าจะอยู่หลังป้าย → กลับด้านวง
    if (front && front.x * off.x + front.z * off.z < 0) orbitG.rotateY(Math.PI);
    orbitG.visible = true;
  }
  // พื้นตาราง + เส้นแกน X (กว้าง) Y (สูง) Z (หนา) — สีเดียวกับกล่องขนาดในแอป (แดง/เขียว/น้ำเงิน)
  function axisLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = '600 40px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = color;
    x.fillText(text, 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    return sp;
  }
  function buildGrid(box) {
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 0.3);
    const step = r > 2 ? 0.5 : r > 0.6 ? 0.1 : r > 0.15 ? 0.05 : 0.01;
    const half = Math.ceil((r * 1.4) / step) * step;
    const grid = new THREE.GridHelper(half * 2, Math.round((half * 2) / step), 0x8e97aa, 0xc7ccd6);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.material.depthWrite = false;
    grid.position.y = 0.0006;
    scene.add(grid);
    const L = Math.max(size.x, size.z) / 2 + Math.max(0.03, r * 0.3);
    const H = size.y * 1.15 + 0.1;
    const axes = [
      ['X', '#d9534f', [-L, 0.001, 0], [L, 0.001, 0]],
      ['Y', '#3a9d5d', [0, 0, 0], [0, H, 0]],
      ['Z', '#3d6fd1', [0, 0.001, -L], [0, 0.001, L]],
    ];
    const ls = Math.max(0.008, r * 0.09); // ป้ายอักษรแกนตามขนาดชิ้นงาน (บัตรเล็กไม่ใช่ตัว Z ยักษ์)
    for (const [t, col, a, b] of axes) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
      scene.add(line);
      const lab = axisLabel(t, col);
      lab.scale.setScalar(ls);
      lab.position.set(b[0] * 1.04, b[1] + (t === 'Y' ? ls * 0.6 : ls * 0.4), b[2] * 1.04);
      scene.add(lab);
    }
    ring.visible = false;
  }

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
      if (!info && o.userData && o.userData.npScene) {
        info = o.userData.npScene;
        holder = o;
      }
    });
    if (info) {
      showScene(model, holder, info);
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
    buildGrid(box);
    buildOrbit(new THREE.Vector3(fc.x, box.min.y + fs.y * 0.3, fc.z), fs.x / 2 + Math.max(0.01, fs.x * 0.12), Math.max(fs.z / 2 + fs.x * 0.1, fs.x * 0.28));
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
    photo = { kind: 'photo', pos, target, q0, d0, fov: info.fov, aspect: info.aspect, ndc: new THREE.Vector2(), dMin: 0 };
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
    // จอแคบกว่ารูป (มือถือแนวตั้ง) รูปเต็มจอจะเล็ก → เริ่มใกล้เข้าไปหน่อย (ถอยออกดูทั้งรูปได้)
    const near0 = Math.min(1, Math.max(0.55, Math.sqrt(camera.aspect / photo.aspect) * 1.1));
    camera.position.copy(target).add(pos.clone().sub(target).multiplyScalar(near0));
    controls.update();
    home = { pos: camera.position.clone(), target: target.clone() };
    sun.position.copy(target).add(new THREE.Vector3(1.5, 4, 3));
    sun.target.position.copy(target);
    // ป้ายติดผนัง: วงลูกศรอยู่ใต้ขอบล่างป้าย ไม่พาดทับหน้าป้าย
    buildOrbit(target.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -info.size[1] / 2 - Math.min(0.04, info.size[1] * 0.08)), info.size[0] / 2 + Math.max(0.02, info.size[0] * 0.1), Math.max(0.04, info.size[0] * 0.28));
    const hint = $('hint');
    if (hint) hint.textContent = 'ลากเพื่อขยับมุม · ถ่างนิ้ว/แตะสองครั้งเพื่อซูมดูป้าย';
    setSpin(true);
  }
  /* ป้าย + ฉาก (หน้าร้าน ผนัง ประตู ฯลฯ): เปิดมามุมเดียวกับในแอป ส่ายกล้องโชว์ ลากหมุนดูรอบ ๆ ได้ ซูมดูป้ายได้
   * คนยืนเทียบหันหากล้องเสมอ */
  let personCard = null;
  function showScene(model, holder, info) {
    scene.add(model);
    model.updateMatrixWorld(true);
    const envRoot = model.getObjectByName('NadponEnv');
    model.traverse((o) => {
      if (!o.isMesh) return;
      let inEnv = false;
      for (let p = o; p; p = p.parent) if (p === envRoot) inEnv = true;
      o.castShadow = !inEnv;
      o.receiveShadow = true;
    });
    personCard = model.getObjectByName('NadponPersonCard') || null;
    ground.visible = ring.visible = false;
    if (info.bg) {
      scene.background = new THREE.Color(info.bg);
      if (info.fog) scene.fog = new THREE.Fog(info.bg, info.fog[0], info.fog[1]);
    }
    const m = holder.matrixWorld;
    const pos = new THREE.Vector3().fromArray(info.pos).applyMatrix4(m);
    const target = new THREE.Vector3().fromArray(info.target).applyMatrix4(m);
    const d0 = pos.distanceTo(target);
    photo = { kind: 'scene', pos, target, q0: null, d0, fov: info.fov, aspect: info.aspect || camera.aspect, ndc: new THREE.Vector2(), dMin: 0 };
    const nv = new THREE.Vector3().fromArray(info.normal || [0, 0, 1]);
    nv.y += 0.08;
    focus = { target: new THREE.Vector3().fromArray(info.focus).applyMatrix4(m), size: info.size, normal: nv.transformDirection(m).normalize() };
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.target.copy(target);
    camera.position.copy(pos);
    camera.near = Math.max(0.01, d0 / 300);
    camera.far = 300;
    fitPhoto();
    camera.updateProjectionMatrix();
    photo.dMin = closeDist(info.size) * 0.45;
    controls.minDistance = photo.dMin;
    controls.maxDistance = d0 * 2.2;
    const az = info.az || [];
    controls.minAzimuthAngle = az[0] == null ? -Infinity : az[0];
    controls.maxAzimuthAngle = az[1] == null ? Infinity : az[1];
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI * 0.6;
    // ระยะเริ่มต้น: ป้าย + คนยืนเทียบพอดีจอนี้ (มุมมองเดียวกับในแอป) — ไม่ไกลเกินบนมือถือแนวตั้ง
    const fb = new THREE.Box3();
    ['NadponSignRoot', 'NadponPerson'].forEach((n) => {
      const o = model.getObjectByName(n);
      if (o) fb.union(new THREE.Box3().setFromObject(o));
    });
    if (!fb.isEmpty()) {
      const fsz = fb.getSize(new THREE.Vector3());
      const t = Math.tan((camera.fov * Math.PI) / 360);
      const fit = Math.max(fsz.y / 2 / t, Math.max(fsz.x, fsz.z) / 2 / (t * camera.aspect)) * 1.3 + Math.min(fsz.x, fsz.z) / 2;
      const d = Math.min(d0 * 1.8, Math.max(photo.dMin * 1.5, fit));
      camera.position.copy(target).add(pos.clone().sub(target).setLength(d));
    }
    controls.update();
    home = { pos: camera.position.clone(), target: target.clone() };
    sun.position.copy(focus.target).add(new THREE.Vector3(3, 6, 5));
    sun.target.position.copy(focus.target);
    const r = Math.max(4, info.size[0] * 1.5, info.size[1] * 1.5);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -r;
    sc.right = sc.top = r;
    sc.near = 0.1;
    sc.far = 40;
    sc.updateProjectionMatrix();
    const fr = new THREE.Vector3(focus.normal.x, 0, focus.normal.z).normalize();
    buildOrbit(focus.target.clone().add(new THREE.Vector3(0, -info.size[1] / 2 - Math.min(0.04, info.size[1] * 0.08), 0)), info.size[0] / 2 + Math.max(0.02, info.size[0] * 0.1), Math.max(0.04, info.size[0] * 0.28), fr);
    const hint = $('hint');
    if (hint) hint.textContent = 'ลากเพื่อหมุนดู · ถ่างนิ้ว/แตะสองครั้งเพื่อซูมดูป้าย';
    setSpin(true);
  }
  // มุมกล้องของจอ: รูปหน้างาน = เห็นทั้งรูป (ไม่ครอป) · ฉาก = กว้างเท่ามุมในแอป (จอแคบ/มือถือแนวตั้งขยายมุมให้ป้ายไม่ล้นข้าง)
  // + ตำแหน่งป้ายในรูป (NDC) สำหรับเลื่อนจุดกึ่งกลางภาพ (เฉพาะรูปหน้างาน)
  function fitPhoto() {
    const tp = Math.tan((photo.fov * Math.PI) / 360);
    // ฉาก: ใช้มุมกล้องเดียวกับแอป (ระยะกล้องคิดใหม่ให้ป้าย + คนพอดีจอ) · รูปหน้างาน: เห็นทั้งรูป เผื่อขอบ (กล้องหันหาป้าย รูปเบี้ยวนิดหน่อย)
    const tv = photo.q0 ? Math.max(tp, (tp * photo.aspect) / camera.aspect) * 1.06 : tp;
    camera.fov = (2 * Math.atan(tv) * 180) / Math.PI;
    if (!photo.q0) {
      photo.ndc.set(0, 0);
      return;
    }
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
  // แตะใกล้ลูกศร (ระยะบนจอไม่เกิน ~30 px) นับว่าแตะโดน — นิ้วไม่ต้องโดนเส้นพอดี
  function orbitHit(e) {
    if (!orbitG.visible || arcMat.opacity < 0.08) return '';
    const r = canvas.getBoundingClientRect();
    orbitG.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let best = 30;
    let side = '';
    for (const [p, sd] of orbitPts) {
      v.copy(p).applyMatrix4(orbitG.matrixWorld).project(camera);
      if (v.z > 1) continue;
      const d = Math.hypot(r.left + ((v.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - v.y) / 2) * r.height - e.clientY);
      if (d < best) {
        best = d;
        side = sd;
      }
    }
    return side;
  }
  // แตะลูกศรโค้ง: หมุนรอบป้ายไปทางนั้น ~35°
  function turn(side) {
    userMoved();
    const off = camera.position.clone().sub(controls.target);
    const sp = new THREE.Spherical().setFromVector3(off);
    sp.theta += side === 'right' ? 0.6 : -0.6;
    const lo = controls.minAzimuthAngle;
    const hi = controls.maxAzimuthAngle;
    if (isFinite(lo) && isFinite(hi) && lo <= hi) sp.theta = Math.max(lo, Math.min(hi, sp.theta));
    flyTo(controls.target.clone().add(new THREE.Vector3().setFromSpherical(sp)), controls.target.clone());
  }
  canvas.addEventListener('pointerup', (e) => {
    if (!tap || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12 || performance.now() - tap.t > 300) return;
    const side = orbitHit(e);
    if (side) {
      lastTap = 0;
      turn(side);
      return;
    }
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

  /* ปุ่มลูกศรโค้งบนจอ (กดค้างได้): ↺ ↻ หมุน · มุมสูง/ต่ำ · แว่นขยาย ซูมเข้า/ออก — คอมใช้ปุ่มลูกศรบนคีย์บอร์ด และ + − ได้ */
  const held = {};
  const STEP = { left: [0.9, 0, 0], right: [-0.9, 0, 0], up: [0, -0.6, 0], down: [0, 0.6, 0], in: [0, 0, -1.1], out: [0, 0, 1.1] };
  function nudge(k, dt) {
    const v = STEP[k];
    const off = camera.position.clone().sub(controls.target);
    const sp = new THREE.Spherical().setFromVector3(off);
    sp.theta += v[0] * dt;
    sp.phi += v[1] * dt;
    sp.radius *= Math.exp(v[2] * dt);
    sp.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
  }
  function userMoved() {
    tween = null;
    setSpin(false);
    const hint = $('hint');
    if (hint) hint.hidden = true;
  }
  // กันหน้าเว็บทั้งหน้าซูม (นิ้วนึงอยู่นอกภาพตอนถ่างนิ้ว / แตะสองครั้ง) — หน้ากว้างเกินจอ ปุ่มหลุดขอบ · ซูมภาพ 3 มิติยังใช้ได้
  ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  const pad = document.createElement('div');
  pad.className = 'v-pad';
  const ico = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  pad.innerHTML =
    '<div class="v-dpad">' +
    '<button type="button" data-k="up" aria-label="มุมสูงขึ้น" title="มุมสูงขึ้น">' + ico('<path d="M8 20c-3-4-3-10 2-14"/><path d="M6.5 6.5 10 5.5l1 3.5"/><path d="M15 20c3-4 3-10-2-14"/>') + '</button>' +
    '<button type="button" data-k="left" aria-label="หมุนซ้าย" title="หมุนซ้าย">' + ico('<path d="M5.5 13a7 7 0 1 0 2.2-6.2"/><path d="M4.5 4v4.5H9"/>') + '</button>' +
    '<button type="button" data-k="right" aria-label="หมุนขวา" title="หมุนขวา">' + ico('<path d="M18.5 13a7 7 0 1 1-2.2-6.2"/><path d="M19.5 4v4.5H15"/>') + '</button>' +
    '<button type="button" data-k="down" aria-label="มุมต่ำลง" title="มุมต่ำลง">' + ico('<path d="M8 4c-3 4-3 10 2 14"/><path d="M6.5 17.5 10 18.5l1-3.5"/><path d="M15 4c3 4 3 10-2 14"/>') + '</button>' +
    '</div><div class="v-zoom">' +
    '<button type="button" data-k="in" aria-label="ซูมเข้า" title="ซูมเข้า">' + ico('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/>') + '</button>' +
    '<button type="button" data-k="out" aria-label="ซูมออก" title="ซูมออก">' + ico('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/>') + '</button>' +
    '</div>';
  stage.appendChild(pad);
  pad.querySelectorAll('button').forEach((b) => {
    const k = b.dataset.k;
    const stop = () => {
      delete held[k];
      b.classList.remove('on');
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      userMoved();
      held[k] = performance.now();
      b.classList.add('on');
      try {
        b.setPointerCapture(e.pointerId);
      } catch (x) {}
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
    b.addEventListener('click', (e) => {
      // กดด้วยคีย์บอร์ด (Enter/Space) ขยับทีละนิด
      if (e.detail === 0) {
        userMoved();
        nudge(k, 0.18);
      }
    });
  });
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', _: 'out' };
  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.key];
    if (!k || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    userMoved();
    nudge(k, 0.12);
  });
  let lastT = 0;

  const sph = new THREE.Spherical();
  const pw = new THREE.Vector3();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    for (const k in held) nudge(k, dt);
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.c0, tween.c1, e);
      if (k >= 1) tween = null;
    } else if (sway) {
      // ส่ายกล้องซ้าย-ขวารอบป้าย (รูปหน้างาน ±8° · ฉาก ±18°) เริ่มจากมุมเดิมแบบนุ่ม ๆ
      const off = camera.position.clone().sub(controls.target);
      sph.setFromVector3(off);
      sph.theta = sway.theta0 + (photo.kind === 'scene' ? 0.32 : 0.14) * Math.sin(((now - sway.t0) / 1000) * (photo.kind === 'scene' ? 0.55 : 0.75));
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    }
    controls.update();
    if (orbitG.visible) {
      // ใกล้ป้ายมาก (ซูมดู) ลูกศรค่อย ๆ จางหาย
      const d = camera.position.distanceTo(controls.target);
      arcMat.opacity = ARC_A * Math.max(0, Math.min(1, (d / orbitR - 1.5) / 1.2));
    }
    if (photo && photo.q0) applyOffset();
    if (personCard) {
      personCard.getWorldPosition(pw);
      personCard.rotation.y = Math.atan2(camera.position.x - pw.x, camera.position.z - pw.z);
    }
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, controls };
}
