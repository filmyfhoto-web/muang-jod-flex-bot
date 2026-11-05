/* ตัวดูป้าย 3 มิติ (ใช้ร่วมกัน 2 ที่)
 *   1) หน้าลิงก์ส่งลูกค้า /sign/v/<id> (viewer3d.js โหลดไฟล์ .glb จากเซิร์ฟเวอร์)
 *   2) ไฟล์ HTML พรีวิว 3 มิติ ที่ส่งออกจากแอป (vendor/viewer3d.standalone.js = ไฟล์นี้ + three.js รวมเป็นไฟล์เดียว
 *      ฝังในไฟล์ HTML พร้อมโมเดล เปิดดับเบิลคลิกได้เลย ไม่ต้องใช้เน็ต)
 *      แก้ไฟล์นี้แล้วต้องสร้างใหม่: node sign-mockup/tools/build-viewer.mjs (มีเทสต์เช็กว่าสร้างตรงรุ่น)
 *
 * วางป้ายบนพื้นมีเงา หมุนโชว์เองจนกว่าลูกค้าจะลากหมุนเอง
 * ใช้ element ตาม id: c (canvas) stage load hint · ปุ่ม spin reset full shot (ไม่มีก็ได้) · poster (รูปสำรองเครื่องที่ไม่มี 3 มิติ)
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
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const show = (gltf) => {
    const model = gltf.scene;
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
    if (load) load.hidden = true;
  };
  const err = () => fail('โหลดภาพ 3 มิติไม่สำเร็จ ลองเปิดใหม่อีกครั้ง');
  const loader = new GLTFLoader();
  if (opts && opts.glb) loader.parse(opts.glb, '', show, err);
  else loader.load(opts.url, show, undefined, err);

  // ลูกค้าแตะ/ลากเมื่อไหร่ หยุดหมุนอัตโนมัติ
  const spin = $('spin');
  function setSpin(on) {
    controls.autoRotate = on;
    if (spin) spin.setAttribute('aria-pressed', String(on));
  }
  controls.addEventListener('start', () => {
    setSpin(false);
    const hint = $('hint');
    if (hint) hint.hidden = true;
  });
  if (spin) spin.addEventListener('click', () => setSpin(!controls.autoRotate));
  const reset = $('reset');
  if (reset)
    reset.addEventListener('click', () => {
      if (!home) return;
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

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, controls };
}
