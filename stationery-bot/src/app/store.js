// The app bot's window onto the shop's own Supabase project: the same queries the app's Supabase function
// (`line-bot`) runs, written for Node. Uses the service role key, so it must stay on the server.
//
//   createAppStore({ url, key, env, fetch })
//
// The two LINE secrets come from this host's environment (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET) when set;
// every other secret (push_hook_key, gd_url, gd_key, line_notify …) is read from the app_secrets table. Nothing is logged.
import { createClient } from '@supabase/supabase-js';

const must = (res, what) => {
  if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message ?? res.error.code ?? 'failed'}`), { code: res.error.code });
  return res.data;
};

export function createAppStore({ url, key, env = {}, fetch: doFetch = fetch }) {
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: doFetch },
  });
  const fromEnv = {
    line_channel_token: String(env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim(),
    line_channel_secret: String(env.LINE_CHANNEL_SECRET ?? '').trim(),
  };
  const schoolCache = { t: 0, v: null };

  async function recount(docId, lastAt) {
    const { count, error } = await db.from('project_doc_files').select('id', { count: 'exact', head: true }).eq('doc_id', docId);
    if (error) throw new Error(`recount: ${error.message}`);
    const patch = { file_count: count || 0, updated_at: new Date().toISOString() };
    if (lastAt) patch.last_file_at = lastAt;
    const { data } = await db.from('project_docs').update(patch).eq('id', docId).select('*').single();
    return data;
  }

  return {
    async getSecret(k) {
      if (fromEnv[k]) return fromEnv[k];
      return must(await db.from('app_secrets').select('value').eq('key', k).maybeSingle(), `secret ${k}`)?.value ?? null;
    },
    async setSecret(k, v) {
      must(await db.from('app_secrets').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' }), `set secret ${k}`);
    },
    async delSecret(k) {
      await db.from('app_secrets').delete().eq('key', k);
    },
    async getConfig(k) {
      return must(await db.from('app_config').select('value').eq('key', k).maybeSingle(), `config ${k}`)?.value ?? null;
    },
    async getChat(uid) {
      return must(await db.from('line_chat_state').select('mode,admin_ms,last_ms,seen_ms,menu_ms').eq('user_id', uid).maybeSingle(), 'chat state') ?? null;
    },
    async setChat(uid, patch) {
      must(await db.from('line_chat_state').upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }), 'save chat state');
    },
    async isAdmin() {
      return false; // the app's admin screens talk to the Supabase function, not to this server
    },
    async getShop() {
      return must(await db.from('app_config').select('value').eq('key', 'shop').maybeSingle(), 'shop')?.value || {};
    },
    async getOrder(no) {
      const o = must(
        await db.from('orders').select('id,order_no,status,line_user_id,line_notify,orderer_name,org,project,total,school_id').eq('order_no', no).maybeSingle(),
        'order',
      );
      if (!o) return null;
      const its = must(
        await db.from('order_items').select('name,qty,product_id,sort,line_total,set_id,set_name,set_qty,set_unit,set_grp').eq('order_id', o.id).order('sort'),
        'order items',
      );
      let school = '';
      if (o.school_id) {
        const s = must(await db.from('schools').select('name').eq('id', o.school_id).maybeSingle(), 'school');
        school = s?.name || '';
      }
      const bands = {};
      const setIds = [...new Set((its || []).filter((x) => x.set_id).map((x) => String(x.set_id)))];
      if (setIds.length) {
        try {
          const { data: ss } = await db.from('sup_sets').select('id,grade_band').in('id', setIds);
          (ss || []).forEach((r) => {
            bands[r.id] = r.grade_band || '';
          });
        } catch {
          /* the grade bands are a nicety */
        }
      }
      return { ...o, school, items: its || [], bands };
    },
    async setOrderNotify(orderNo, status) {
      await db.from('orders').update({ line_notify: status }).eq('order_no', orderNo);
    },

    // ---- project documents (docs.js) ----
    async getDocState(uid) {
      return must(await db.from('line_doc_state').select('step,data,updated_at').eq('line_user_id', uid).maybeSingle(), 'doc state') ?? null;
    },
    async setDocState(uid, step, data) {
      must(await db.from('line_doc_state').upsert({ line_user_id: uid, step, data, updated_at: new Date().toISOString() }, { onConflict: 'line_user_id' }), 'save doc state');
    },
    async clearDocState(uid) {
      await db.from('line_doc_state').delete().eq('line_user_id', uid);
    },
    async getTeacher(uid) {
      return must(await db.from('project_teachers').select('*').eq('line_user_id', uid).maybeSingle(), 'teacher') ?? null;
    },
    async saveTeacher(row) {
      must(await db.from('project_teachers').upsert(row, { onConflict: 'line_user_id' }), 'save teacher');
    },
    async teacherHints(uid) {
      const out = {};
      const { data: l } = await db.from('line_school_links').select('school_id,line_name,last_at').eq('line_user_id', uid).order('last_at', { ascending: false }).limit(1);
      const link = (l || [])[0];
      if (link) {
        out.line_name = link.line_name || '';
        if (link.school_id) {
          const { data: s } = await db.from('schools').select('id,name').eq('id', link.school_id).maybeSingle();
          if (s) {
            out.school_id = s.id;
            out.school_name = s.name;
          }
        }
      }
      const { data: o } = await db.from('orders').select('orderer_name,phone,school_id,line_name').eq('line_user_id', uid).order('created_at', { ascending: false }).limit(1);
      const od = (o || [])[0];
      if (od) {
        out.name = od.orderer_name || '';
        out.phone = od.phone || '';
        if (!out.line_name) out.line_name = od.line_name || '';
        if (!out.school_id && od.school_id) {
          const { data: s } = await db.from('schools').select('id,name').eq('id', od.school_id).maybeSingle();
          if (s) {
            out.school_id = s.id;
            out.school_name = s.name;
          }
        }
      }
      return out;
    },
    async listSchools() {
      const t = Date.now();
      if (schoolCache.v && t - schoolCache.t < 60000) return schoolCache.v;
      const { data } = await db.from('schools').select('id,name').eq('active', true).order('name');
      schoolCache.v = data || [];
      schoolCache.t = t;
      return schoolCache.v;
    },
    async recentDocs(uid, n) {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { data } = await db.from('project_docs').select('id,doc_no,project_name,status,file_count,sent_at').eq('line_user_id', uid).gte('sent_at', since).order('sent_at', { ascending: false }).limit(n || 5);
      return data || [];
    },
    async getDoc(id) {
      return must(await db.from('project_docs').select('*').eq('id', id).maybeSingle(), 'doc') ?? null;
    },
    async addFile(row) {
      const data = must(await db.from('project_doc_files').insert(row).select('id').single(), 'add file');
      let docId = row.doc_id ?? null;
      if (!docId && row.session_id) {
        const { data: d } = await db.from('project_docs').select('id').eq('session_id', row.session_id).maybeSingle();
        if (d) {
          docId = d.id;
          await db.from('project_doc_files').update({ doc_id: d.id }).eq('id', data.id);
        }
      }
      if (docId) await recount(docId, row.received_at);
      return data;
    },
    async countFiles(q) {
      let b = db.from('project_doc_files').select('id', { count: 'exact', head: true });
      b = q.doc_id ? b.eq('doc_id', q.doc_id) : b.eq('session_id', q.session_id || '-');
      const { count } = await b;
      return count || 0;
    },
    async createDoc(row) {
      const data = must(await db.from('project_docs').insert(row).select('*').single(), 'create doc');
      if (row.session_id) await db.from('project_doc_files').update({ doc_id: data.id }).eq('session_id', row.session_id).is('doc_id', null);
      return await recount(data.id, row.last_file_at);
    },
    async touchDoc(id, patch) {
      return await recount(id, patch.last_file_at);
    },
    async filesOf(docId) {
      const { data } = await db.from('project_doc_files').select('*').eq('doc_id', docId).order('received_at');
      return data || [];
    },
    async putObject(path, bytes, mime) {
      const { error } = await db.storage.from('project-docs').upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: false });
      if (error) throw error;
    },
    async getObject(path) {
      const { data, error } = await db.storage.from('project-docs').download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async setFileDrive(id, driveUrl, err) {
      await db.from('project_doc_files').update({ drive_url: driveUrl, drive_err: err }).eq('id', id);
    },
    async setDocFolder(id, folderUrl) {
      await db.from('project_docs').update({ drive_folder_url: folderUrl }).eq('id', id);
    },
    async docByNo(no) {
      if (!/^PJ-\d{1,6}$/.test(no)) return null;
      return must(await db.from('project_docs').select('*').eq('doc_no', no).maybeSingle(), 'doc by number') ?? null;
    },
    async sharedDocs(uid) {
      const { data } = await db
        .from('project_docs')
        .select('id,doc_no,project_name,school_name,teacher_name,line_user_id,share_token,edit_req_at,edit_req_text')
        .eq('line_user_id', uid)
        .not('shared_at', 'is', null)
        .neq('status', 'cancelled')
        .order('shared_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    async setEditReq(id, patch) {
      const p = { updated_at: new Date().toISOString() };
      if ('edit_req_at' in patch) p.edit_req_at = patch.edit_req_at;
      if ('edit_req_text' in patch) p.edit_req_text = patch.edit_req_text;
      await db.from('project_docs').update(p).eq('id', id);
    },
  };
}
