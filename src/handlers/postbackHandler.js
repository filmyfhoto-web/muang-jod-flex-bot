import { reply } from '../services/lineService.js';
import { addJob, confirmAddJob, editNewJob, cancelNewJob } from '../actions/addJob.js';
import { attachEvidence } from '../actions/attachEvidence.js';
import { recentJobs } from '../actions/recentJobs.js';
import { todaySummary } from '../actions/todaySummary.js';
import { editLatest } from '../actions/editLatest.js';
import { cancelLatest, confirmCancel, cancelCancel } from '../actions/cancelLatest.js';
import { editJob, deleteJob } from '../actions/jobActions.js';
import { pickCategory } from '../actions/pickCategory.js';
import { createBillAction, billPaymentPrompt, viewReceipt } from '../actions/bill.js';
import { pendingPayment } from '../actions/pendingPayment.js';
import { recordPaymentPrompt } from '../actions/recordPayment.js';
import { searchJobsPrompt } from '../actions/searchJobs.js';
import { reportMenu, report, exportCsv } from '../actions/report.js';
import { help } from '../actions/help.js';

// Parse LINE postback data (querystring form) into { action, ...params }.
function parsePostbackData(data) {
  const params = {};
  const sp = new URLSearchParams(data || '');
  for (const [k, v] of sp.entries()) params[k] = v;
  return params;
}

export async function handlePostback(event, profile) {
  const { replyToken } = event;
  const params = parsePostbackData(event.postback?.data);
  const action = params.action;
  const ctx = { replyToken, profile, params, event };

  console.log(`[postback] user=${profile.id} action=${action}`);

  switch (action) {
    case 'add_job':
      return addJob(ctx);
    case 'confirm_add_job':
      return confirmAddJob(ctx);
    case 'edit_new_job':
      return editNewJob(ctx);
    case 'cancel_new_job':
      return cancelNewJob(ctx);
    case 'attach_evidence':
      return attachEvidence(ctx);
    case 'recent_jobs':
      return recentJobs(ctx);
    case 'today_summary':
      return todaySummary(ctx);
    case 'edit_latest':
      return editLatest(ctx);
    case 'cancel_latest':
      return cancelLatest(ctx);
    case 'edit_job':
      return editJob(ctx);
    case 'delete_job':
      return deleteJob(ctx);
    case 'pick_category':
      return pickCategory(ctx);
    case 'create_bill':
      return createBillAction(ctx);
    case 'bill_payment':
      return billPaymentPrompt(ctx);
    case 'view_receipt':
      return viewReceipt(ctx);
    case 'confirm_cancel':
      return confirmCancel(ctx);
    case 'cancel_cancel':
      return cancelCancel(ctx);
    case 'pending_payment':
      return pendingPayment(ctx);
    case 'record_payment':
      return recordPaymentPrompt(ctx);
    case 'search_jobs':
      return searchJobsPrompt(ctx);
    case 'report_menu':
      return reportMenu(ctx);
    case 'report_daily':
      return report(ctx, 'daily');
    case 'report_weekly':
      return report(ctx, 'weekly');
    case 'report_monthly':
      return report(ctx, 'monthly');
    case 'export_csv':
      return exportCsv(ctx);
    case 'help':
      return help(ctx);
    default:
      console.warn(`[postback] unknown action: ${action}`);
      return reply(replyToken, {
        type: 'text',
        text: 'ขออภัยค่ะ ไม่เข้าใจคำสั่งนี้ ลองกดเมนูด้านล่างดูนะคะ 💜',
      });
  }
}
