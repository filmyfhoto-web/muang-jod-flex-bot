// Supabase Edge Function entry (Deno). Deploy with verify_jwt = false: LINE and line-bot do not send a
// Supabase login — the request is checked inside (signature or shared key, see handler.js).
import { createHandler } from './handler.js'
import { createRestStore } from './store.js'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const store = createRestStore({ url, key: serviceKey, fetch })
const waitUntil = (p: Promise<unknown>) => {
  try {
    ;(globalThis as any).EdgeRuntime?.waitUntil(p)
  } catch (_e) {
    /* ignore */
  }
}

Deno.serve(
  createHandler({
    store,
    fetch,
    waitUntil,
    env: (k: string) => Deno.env.get(k) ?? undefined,
    selfUrl: url + '/functions/v1/line-assist',
  }),
)
