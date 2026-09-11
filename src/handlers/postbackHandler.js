import { reply } from '../services/lineService.js';
import { addJob, addMoreForCustomer, confirmAddJob, editNewJob, cancelNewJob } from '../actions/addJob.js';
import { attachEvidence } from '../actions/attachEvidence.js';
import { recentJobs } from '../actions/recentJobs.js';
import { todaySummary } from '../actions/todaySummary.js';
import { editLatest } from '../actions/editLatest.js';
import { cancelLatest, confirmCancel, cancelCancel } from '../actions/cancelLatest.js';
import { editJob, deleteJob } from '../actions/jobActions.js';
import { pickCategory } from '../actions/pickCategory.js';
import { createBillAction, billAllForCustomer, billOneJob, billPaymentPrompt, viewReceipt } from '../actions/bill.js';
import { remindPrompt, setReminder, cancelReminderAction, listReminders } from '../actions/reminder.js';
import { openDashboard } from '../actions/dashboard.js';
import { home } from '../actions/home.js';
import { pendingPayment } from '../actions/pendingPayment.js';
import { recordPaymentPrompt } from '../actions/recordPayment.js';
import { searchJobsPrompt } from '../actions/searchJobs.js';
import { reportMenu, report, exportCsv } from '../actions/report.js';
import { help } from '../actions/help.js';
import { nudgeOff, nudgeOn } from '../actions/nudge.js';

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
    case 'add_more':
      return addMoreForCustomer(ctx);
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
    case 'bill_job':
      return billOneJob(ctx);
    case 'create_bill':
      return createBillAction(ctx);
    case 'bill_all':
      return billAllForCustomer(ctx);
    case 'bill_payment':
      return billPaymentPrompt(ctx);
    case 'view_receipt':
      return viewReceipt(ctx);
    case 'home':
      return home(ctx);
    case 'open_dashboard':
      return openDashboard(ctx);
    case 'remind_job':
      return remindPrompt(ctx);
    case 'set_reminder':
      return setReminder(ctx);
    case 'cancel_reminder':
      return cancelReminderAction(ctx);
    case 'nudge_off':
      return nudgeOff(ctx);
    case 'nudge_on':
      return nudgeOn(ctx);
    case 'my_reminders':
      return listReminders(ctx);
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
