import { z } from 'zod';

export const PAYMENT_STATUSES = ['pending', 'paid', 'partial'];
export const JOB_STATUSES = ['active', 'completed', 'cancelled'];

// Known postback actions. Kept in sync with postbackHandler's router.
export const POSTBACK_ACTIONS = [
  'add_job',
  'confirm_add_job',
  'edit_new_job',
  'cancel_new_job',
  'attach_evidence',
  'recent_jobs',
  'today_summary',
  'edit_latest',
  'cancel_latest',
  'confirm_cancel',
  'cancel_cancel',
  'pending_payment',
  'record_payment',
  'search_jobs',
  'help',
];

// A single parsed job item.
export const jobItemSchema = z.object({
  item_name: z.string().trim().min(1, 'ต้องมีชื่อรายการ').max(200),
  size: z.string().trim().max(100).nullable().optional(),
  quantity: z.coerce.number().positive('จำนวนต้องมากกว่า 0'),
  unit: z.string().trim().max(50).nullable().optional(),
  unit_price: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ'),
  total: z.coerce.number().min(0).optional(),
});

// A job draft ready to be saved.
export const jobDraftSchema = z.object({
  jobName: z.string().trim().min(1, 'ต้องมีชื่องาน').max(200),
  customerName: z.string().trim().max(200).nullable().optional(),
  items: z.array(jobItemSchema).min(1, 'ต้องมีอย่างน้อย 1 รายการ'),
  subtotal: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  paymentStatus: z.enum(PAYMENT_STATUSES).default('pending'),
  note: z.string().trim().max(500).nullable().optional(),
});

// A payment amount entered by the user.
export const paymentAmountSchema = z.coerce
  .number({ invalid_type_error: 'กรุณาพิมพ์เป็นตัวเลขค่ะ' })
  .positive('จำนวนเงินต้องมากกว่า 0')
  .finite();

// A free-text search query.
export const searchQuerySchema = z.string().trim().min(1, 'พิมพ์คำค้นก่อนนะคะ').max(100);

export const postbackActionSchema = z.enum(POSTBACK_ACTIONS);

// Convenience: return { ok, data } | { ok:false, error } instead of throwing.
export function safe(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  return { ok: false, error: first?.message || 'ข้อมูลไม่ถูกต้อง' };
}
