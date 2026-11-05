/* หน้าดูป้าย 3 มิติที่ร้านส่งลิงก์ให้ลูกค้า (/sign/v/<id>)
 * โหลดไฟล์ .glb ของป้าย วางบนพื้นมีเงา หมุนโชว์เองจนกว่าลูกค้าจะลากหมุนเอง */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const data = JSON.parse(document.getElementById('data').textContent);
const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const load = document.getElementById('load');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
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
  const dist = Math.max(fit * 1.05, 0.6);
  const target = new THREE.Vector3(center.x, center.y, center.z);
  const pos = new THREE.Vector3(center.x + dist * Math.sin(0.55), center.y + dist * 0.18, center.z + dist * Math.cos(0.55));
  home = { pos, target };
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.minDistance = r * 0.6;
  controls.maxDistance = dist * 3;
  const gr = Math.max(size.x, size.z) * 1.3 + 0.4;
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

new GLTFLoader().load(
  `/sign/v/${data.id}/model.glb`,
  (gltf) => {
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
    load.hidden = true;
  },
  undefined,
  () => {
    load.textContent = 'โหลดภาพ 3 มิติไม่สำเร็จ ลองเปิดลิงก์ใหม่อีกครั้ง';
  }
);

// ลูกค้าแตะ/ลากเมื่อไหร่ หยุดหมุนอัตโนมัติ
const spin = document.getElementById('spin');
function setSpin(on) {
  controls.autoRotate = on;
  spin.setAttribute('aria-pressed', String(on));
}
controls.addEventListener('start', () => {
  setSpin(false);
  document.getElementById('hint').hidden = true;
});
spin.addEventListener('click', () => setSpin(!controls.autoRotate));
document.getElementById('reset').addEventListener('click', () => {
  if (!home) return;
  camera.position.copy(home.pos);
  controls.target.copy(home.target);
  controls.update();
});
document.getElementById('full').addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
