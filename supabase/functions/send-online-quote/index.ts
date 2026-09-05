import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] ?? character))

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

const relation = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const authorization = request.headers.get('Authorization') ?? ''
    const accessToken = authorization.replace(/^Bearer\s+/i, '')
    if (!accessToken) return json({ error: 'Sessão não informada.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(supabaseUrl, publishableKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken)
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['administrador', 'comprador'].includes(profile.role)) {
      return json({ error: 'Seu usuário não possui permissão para enviar cotações.' }, 403)
    }

    const body = await request.json()
    const invitationIds = [...new Set((Array.isArray(body?.invitationIds) ? body.invitationIds : []).map(String).filter(Boolean))]
    if (!invitationIds.length || invitationIds.length > 50) {
      return json({ error: 'Selecione entre 1 e 50 fornecedores.' }, 400)
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('QUOTE_FROM_EMAIL') || Deno.env.get('PURCHASE_ORDER_FROM_EMAIL')
    const quotePortalUrl = Deno.env.get('QUOTE_PORTAL_URL') || 'https://www.veltrian.com.br/ERP/quote-response.html'
    if (!resendApiKey || !fromEmail) return json({ error: 'O serviço de e-mail ainda não foi configurado no Supabase.' }, 503)

    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const { data: invitations, error: invitationsError } = await admin
      .from('quote_invitations')
      .select('id,purchase_request_id,supplier_id,recipient_email,status,updated_at,supplier:suppliers!quote_invitations_supplier_id_fkey(legal_name),request:purchase_requests!quote_invitations_purchase_request_id_fkey(request_number,created_at,lines:purchase_request_items(quantity,item:items(material_number,description,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(status))')
      .in('id', invitationIds)
    if (invitationsError) throw invitationsError

    const results: Array<Record<string, unknown>> = []
    for (const invitation of invitations ?? []) {
      const supplier: any = relation(invitation.supplier)
      const purchaseRequest: any = relation(invitation.request)
      const locked = (purchaseRequest?.orders ?? []).some((order: any) => ['em_aprovacao', 'aprovado', 'enviado', 'recebido'].includes(order.status))
      if (locked) {
        results.push({ id: invitation.id, ok: false, error: 'A cotação já foi enviada para aprovação.' })
        continue
      }
      if (!['aguardando_envio', 'erro_envio', 'expirada'].includes(invitation.status)) {
        results.push({ id: invitation.id, ok: false, error: 'Esta solicitação não está disponível para envio.' })
        continue
      }

      const recipient = String(invitation.recipient_email ?? '').trim().toLowerCase()
      if (!recipient.includes('@')) {
        results.push({ id: invitation.id, ok: false, error: 'Fornecedor sem e-mail válido.' })
        continue
      }

      const rawToken = createToken()
      const tokenHash = await sha256(rawToken)
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const responseUrl = `${quotePortalUrl}#token=${encodeURIComponent(rawToken)}`
      const requestCode = `RC-${String(purchaseRequest?.request_number ?? '').padStart(4, '0')}`
      const items = (purchaseRequest?.lines ?? []).map((line: any) => {
        const item = relation(line.item)
        const code = item?.material_number ? `MAT-${String(item.material_number).padStart(4, '0')} · ` : ''
        return `<tr><td style="padding:10px;border-bottom:1px solid #dce8e8">${escapeHtml(code)}${escapeHtml(item?.description)}</td><td style="padding:10px;border-bottom:1px solid #dce8e8;text-align:right">${escapeHtml(line.quantity)} ${escapeHtml(item?.unit_of_measure || '')}</td></tr>`
      }).join('')

      const { error: tokenError } = await admin.from('quote_invitations').update({
        access_token_hash: tokenHash,
        expires_at: expiresAt,
        error_message: null,
      }).eq('id', invitation.id)
      if (tokenError) throw tokenError

      const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eef3f5;font-family:Arial,sans-serif;color:#102d3a"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 16px"><table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px;background:#071724;color:#fff"><strong style="color:#31d8ce;letter-spacing:3px;font-size:20px">VELTRIAN</strong><div style="margin-top:8px;color:#b9cbd0;font-size:12px">SOLICITAÇÃO DE COTAÇÃO</div></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;color:#087d83;font-weight:700">${escapeHtml(requestCode)}</p><h1 style="margin:0 0 18px;font-size:24px">Cotação para ${escapeHtml(supplier?.legal_name)}</h1><p style="line-height:1.6;color:#526b72">A Veltrian convida sua empresa a enviar uma proposta comercial para os itens abaixo.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:#f4f8f8;border-radius:10px"><thead><tr><th align="left" style="padding:10px;color:#60777c;font-size:11px">MATERIAL</th><th align="right" style="padding:10px;color:#60777c;font-size:11px">QUANTIDADE</th></tr></thead><tbody>${items}</tbody></table><p style="margin:28px 0;text-align:center"><a href="${responseUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#0d8f8c;color:#fff;text-decoration:none;font-weight:700">Preencher cotação online</a></p><p style="font-size:12px;line-height:1.5;color:#809197">Este link é individual, pode ser usado para corrigir a proposta enquanto a compra estiver em cotação e expira em 7 dias.</p></td></tr></table></td></tr></table></body></html>`

      let providerData: any = null
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `online-quote-${invitation.id}-${tokenHash.slice(0, 16)}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            subject: `${requestCode} · Solicitação de cotação Veltrian`,
            html,
            tags: [{ name: 'quote_invitation_id', value: invitation.id }],
          }),
        })
        providerData = await resendResponse.json()
        if (!resendResponse.ok) throw new Error(providerData?.message || 'O Resend recusou o envio.')

        const { error: updateError } = await admin.from('quote_invitations').update({
          status: 'enviada',
          provider_message_id: providerData.id ?? null,
          sent_at: now,
          error_message: null,
        }).eq('id', invitation.id)
        if (updateError) throw updateError
        results.push({ id: invitation.id, ok: true, recipient })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha inesperada no envio.'
        await admin.from('quote_invitations').update({ status: 'erro_envio', error_message: message }).eq('id', invitation.id)
        results.push({ id: invitation.id, ok: false, error: message })
      }
    }

    const sent = results.filter((result) => result.ok).length
    return json({ ok: sent === results.length, sent, failed: results.length - sent, results }, sent ? 200 : 502)
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada ao enviar as cotações.' }, 500)
  }
})
