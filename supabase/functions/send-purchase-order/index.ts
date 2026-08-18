import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] ?? character))

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
})

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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function token() {
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
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken)
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const body = await request.json()
    const orderId = String(body?.orderId ?? '')
    const pdfBase64 = String(body?.pdfBase64 ?? '')
    if (!orderId || !pdfBase64) return json({ error: 'Pedido e PDF são obrigatórios.' }, 400)
    if (pdfBase64.length > 12_000_000) return json({ error: 'O PDF ultrapassa o limite permitido.' }, 413)

    const { data: order, error: orderError } = await userClient
      .from('purchase_orders')
      .select('id,order_number,status,total_value,purchase_request_id,payment_terms,expected_delivery_date,supplier:suppliers!purchase_orders_supplier_id_fkey(legal_name,contact_email),request:purchase_requests!purchase_orders_purchase_request_id_fkey(request_number,lines:purchase_request_items(quantity,item:items(description,material_number)))')
      .eq('id', orderId)
      .single()

    if (orderError || !order) return json({ error: 'Pedido não encontrado ou sem permissão de acesso.' }, 404)
    if (!['aprovado', 'enviado', 'recebido'].includes(order.status)) {
      return json({ error: 'O pedido precisa estar aprovado antes do envio.' }, 409)
    }

    const supplier = Array.isArray(order.supplier) ? order.supplier[0] : order.supplier
    const purchaseRequest = Array.isArray(order.request) ? order.request[0] : order.request
    const recipient = String(supplier?.contact_email ?? '').trim().toLowerCase()
    if (!recipient || !recipient.includes('@')) return json({ error: 'O fornecedor não possui um e-mail válido cadastrado.' }, 422)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('PURCHASE_ORDER_FROM_EMAIL')
    if (!resendApiKey || !fromEmail) {
      return json({ error: 'O serviço de e-mail ainda não foi configurado no Supabase.' }, 503)
    }

    const confirmationToken = token()
    const confirmationTokenHash = await sha256(confirmationToken)
    const confirmationUrl = `${supabaseUrl}/functions/v1/confirm-purchase-order?token=${encodeURIComponent(confirmationToken)}`
    const orderCode = `PC-${String(order.order_number).padStart(4, '0')}`
    const requestCode = `RC-${String(purchaseRequest?.request_number ?? '').padStart(4, '0')}`
    const items = (purchaseRequest?.lines ?? []).map((line: any) => {
      const item = Array.isArray(line.item) ? line.item[0] : line.item
      return `${item?.material_number ? `MAT-${String(item.material_number).padStart(4, '0')} · ` : ''}${item?.description ?? ''} (${line.quantity ?? 0})`
    }).join(', ')

    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eef3f5;font-family:Arial,sans-serif;color:#102d3a"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 16px"><table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px;background:#071724;color:#fff"><strong style="color:#31d8ce;letter-spacing:3px;font-size:20px">VELTRIAN</strong><div style="margin-top:8px;color:#b9cbd0;font-size:12px">PEDIDO DE COMPRA</div></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;color:#087d83;font-weight:700">${escapeHtml(orderCode)}</p><h1 style="margin:0 0 18px;font-size:24px">Novo pedido para ${escapeHtml(supplier?.legal_name)}</h1><p style="line-height:1.6;color:#526b72">Segue em anexo a cópia do pedido de compra. Confira os dados e confirme o recebimento pelo botão abaixo.</p><table width="100%" cellpadding="8" cellspacing="0" style="margin:22px 0;background:#f4f8f8;border-radius:10px"><tr><td><small style="color:#6b8187">REQUISIÇÃO</small><br><strong>${escapeHtml(requestCode)}</strong></td><td><small style="color:#6b8187">VALOR</small><br><strong>${escapeHtml(money(order.total_value))}</strong></td></tr><tr><td colspan="2"><small style="color:#6b8187">ITENS</small><br><strong>${escapeHtml(items || 'Consulte o PDF anexo')}</strong></td></tr></table><p style="margin:28px 0;text-align:center"><a href="${confirmationUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#0d8f8c;color:#fff;text-decoration:none;font-weight:700">Confirmar recebimento</a></p><p style="font-size:12px;line-height:1.5;color:#809197">A confirmação registra que o fornecedor recebeu o pedido. Este link é individual e expira em 30 dias.</p></td></tr></table></td></tr></table></body></html>`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `purchase-order-${order.id}-${confirmationTokenHash.slice(0, 16)}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: `${orderCode} · Pedido de compra Veltrian`,
        html,
        attachments: [{ filename: `${orderCode}.pdf`, content: pdfBase64 }],
        tags: [{ name: 'purchase_order_id', value: order.id }],
      }),
    })
    const providerData = await resendResponse.json()
    if (!resendResponse.ok) {
      console.error('Resend error', providerData)
      return json({ error: 'O provedor de e-mail recusou o envio. Verifique o domínio e as credenciais.' }, 502)
    }

    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: deliveryError } = await admin.from('order_email_deliveries').upsert({
      purchase_order_id: order.id,
      recipient_email: recipient,
      status: 'enviado',
      provider_message_id: providerData.id ?? null,
      confirmation_token_hash: confirmationTokenHash,
      confirmation_expires_at: expiresAt,
      sent_by: user.id,
      sent_at: now,
      received_at: null,
      updated_at: now,
    }, { onConflict: 'purchase_order_id' })
    if (deliveryError) throw deliveryError

    const { error: updateError } = await admin.from('purchase_orders').update({ status: 'enviado', sent_at: now }).eq('id', order.id)
    if (updateError) throw updateError
    await admin.from('purchase_requests').update({ status: 'concluida' }).eq('id', order.purchase_request_id)

    return json({ ok: true, status: 'enviado', recipient, sentAt: now })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Falha inesperada ao enviar o pedido.' }, 500)
  }
})
