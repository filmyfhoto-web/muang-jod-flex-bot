/* จุดเริ่มของ vendor/viewer3d.standalone.js — ตัวดู 3 มิติ + three.js รวมเป็นสคริปต์ธรรมดาไฟล์เดียว
 * ใช้ฝังในไฟล์ "HTML พรีวิว 3 มิติ" ที่แอปส่งออก: NTPViewer.mount({ glb: ArrayBuffer, name })
 * สร้างใหม่: node sign-mockup/tools/build-viewer.mjs */
import { mountViewer } from './viewer3d-core.js';

window.NTPViewer = { mount: mountViewer };
