/* หน้าดูป้าย 3 มิติที่ร้านส่งลิงก์ให้ลูกค้า (/sign/v/<id>) — โหลดไฟล์ .glb ของป้ายจากเซิร์ฟเวอร์ (ตัวดูอยู่ใน viewer3d-core.js) */
import { mountViewer } from './viewer3d-core.js';

const data = JSON.parse(document.getElementById('data').textContent);
mountViewer({ url: `/sign/v/${data.id}/model.glb`, name: 'sign-3d-' + data.id });
