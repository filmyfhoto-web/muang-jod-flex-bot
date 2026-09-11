import { z } from 'zod';

export const PAYMENT_STATUSES = ['pending', 'paid', 'partial'];
export const JOB_STATUSES = ['active', 'completed', 'cancelled'];

// Known postback actions. Kept in sync with postbackHandler's router.
export const POSTBACK_ACTIONS = [
  'home',
  'add_job',
  'confirm_add_job',
  'edit_new_job',
  'cancel_new_job',
  'attach_evidence',
  'recent_jobs',
  'today_summary',
  'edit_latest',
  'cancel_latest',
  'edit_job',
  'delete_job',
  'pick_category',
  'create_bill',
  'bill_all',
  'bill_job',
  'bill_payment',
  'view_receipt',
  'open_dashboard',
  'remind_job',
  'set_reminder',
  'cancel_reminder',
  'my_reminders',
  'confirm_cancel',
  'cancel_cancel',
  'pending_payment',
  'record_payment',
  'search_jobs',
  'report_menu',
  'report_daily',
  'report_weekly',
  'report_monthly',
  'export_csv',
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

// A job the LIFF form asks the server to create. Deliberately NOT the same as
// jobDraftSchema: the browser sends what the person typed (items, customer,
// deposit) and the server does the arithmetic itself — a total that arrived
// over the wire is a number nobody checked.
export const jobCreateSchema = z.object({
  jobName: z.string().trim().max(200).nullable().optional(),
  customerName: z.string().trim().max(200).nullable().optional(),
  jobDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .optional(),
  // วันนัดรับ/ส่งงาน — คนละอย่างกับ jobDate ซึ่งคือวันที่จด ว่างได้
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .nullable()
    .optional(),
  items: z.array(jobItemSchema).min(1, 'ต้องมีอย่างน้อย 1 รายการ').max(50, 'รายการเยอะเกินไป'),
  discount: z.coerce.number().min(0).default(0),
  paidAmount: z.coerce.number().min(0).default(0),
  note: z.string().trim().max(500).nullable().optional(),
});

// Fields the LIFF edit form may change on an existing job.
export const jobPatchSchema = z
  .object({
    job_name: z.string().trim().min(1, 'ต้องมีชื่องาน').max(200),
    customer_name: z.string().trim().max(200).nullable(),
    total: z.coerce.number().min(0, 'ยอดต้องไม่ติดลบ').finite(),
    paid_amount: z.coerce.number().min(0, 'ยอดต้องไม่ติดลบ').finite(),
    payment_status: z.enum(PAYMENT_STATUSES),
    job_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
      .nullable(),
    category: z.string().trim().max(40).nullable(),
    category_type: z.string().trim().max(40).nullable(),
    note: z.string().trim().max(500).nullable(),
    // The lines inside the job. Sent whole or not at all: a job of two items
    // edited down to one is expressed by sending the one that is left, so
    // there is no way to say "patch the second row" and no way to half-apply
    // it. The money is recomputed from these rather than trusted.
    items: z.array(jobItemSchema).min(1, 'ต้องมีอย่างน้อย 1 รายการ').max(50, 'รายการเยอะเกินไป'),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'ไม่มีข้อมูลที่จะแก้ไข' });

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
