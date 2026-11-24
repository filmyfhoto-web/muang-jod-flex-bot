// Preloaded before test files (see the "test" script). Provides dummy env so
// modules that construct the Supabase / LINE clients at import time can load.
// No network happens — service tests pass a mock client explicitly.
/* ชี้ไปพอร์ตปิดบนเครื่องเอง: โค้ดที่เผลอยิงฐานข้อมูลจริงในเทสต์จะตายทันที
 * (ECONNREFUSED) ไม่ใช่แอบรอโดเมนจำลองตอบจน suite อืด — เจอครั้งแรกตอน
 * ด่านทีม (findTeamFor) ทำให้ suite ช้าขึ้นสามเท่าแบบเงียบ ๆ */
process.env.SUPABASE_URL ||= 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';
process.env.LOG_LEVEL ||= 'error'; // keep test output quiet

// การโหลดหมวดงานของร้านจากฐานข้อมูลปลอมใช้เวลาหลายวินาทีกว่าจะล้ม — ปิดไว้ในทุกเทสต์
// เทสต์ที่อยากลองของจริงส่ง client ปลอมของตัวเองเข้าไป
const { setTaxonomyLoading } = await import('../src/services/categoryService.js');
setTaxonomyLoading(false);
