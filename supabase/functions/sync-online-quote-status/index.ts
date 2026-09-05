import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } })
const adminKey = () => {
  const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modernKeys) return JSON.parse(modernKeys).default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}
const publishableKey = () => {
  const modernKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (modernKeys) return JSON.parse(modernKeys).default
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(supabaseUrl, publishableKey(), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: { user }, error: userError } = await userClient.auth.getUser(token)
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)
    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['administrador', 'comprador'].includes(profile.role)) return json({ error: 'Sem permissão para consultar os envios.' }, 403)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) return json({ error: 'O serviço de e-mail ainda não foi configurado.' }, 503)
    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const { data: invitations, error } = await admin.from('quote_invitations').select('id,status,provider_message_id').eq('status', 'enviada').not('provider_message_id', 'is', null).limit(50)
    if (error) throw error

    let delivered = 0
    let failed = 0
    for (const invitation of invitations ?? []) {
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(invitation.provider_message_id)}`, { headers: { Authorization: `Bearer ${resendApiKey}` } })
      if (!response.ok) continue
      const email = await response.json()
      if (email.last_event === 'delivered') {
        const { error: updateError } = await admin.from('quote_invitations').update({ status: 'entregue', delivered_at: new Date().toISOString() }).eq('id', invitation.id).eq('status', 'enviada')
        if (!updateError) delivered += 1
      } else if (['bounced', 'failed', 'suppressed'].includes(email.last_event)) {
        const { error: updateError } = await admin.from('quote_invitations').update({ status: 'erro_envio', error_message: `Resend: ${email.last_event}` }).eq('id', invitation.id).eq('status', 'enviada')
        if (!updateError) failed += 1
      }
    }
    return json({ ok: true, checked: invitations?.length ?? 0, delivered, failed })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Falha ao consultar o status dos e-mails.' }, 500)
  }
})
