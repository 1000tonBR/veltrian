import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})
const adminKey = () => {
  const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modernKeys) return JSON.parse(modernKeys).default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}
const relation = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method === 'GET') {
    const rawToken = new URL(request.url).searchParams.get('token') ?? ''
    if (rawToken.length < 40) return json({ error: 'Link de cotação inválido.' }, 400)
    const portalUrl = Deno.env.get('QUOTE_PORTAL_URL') || 'https://www.veltrian.com.br/ERP/quote-response.html'
    return new Response(null, { status: 302, headers: { Location: `${portalUrl}#token=${encodeURIComponent(rawToken)}`, 'Cache-Control': 'no-store' } })
  }
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await request.json()
    const rawToken = String(body?.token ?? '')
    const action = String(body?.action ?? 'load')
    if (rawToken.length < 40) return json({ error: 'Link de cotação inválido.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const tokenHash = await sha256(rawToken)
    const { data: invitation, error } = await admin.from('quote_invitations')
      .select('id,purchase_request_id,supplier_id,status,expires_at,accessed_at,responded_at,supplier:suppliers!quote_invitations_supplier_id_fkey(legal_name),request:purchase_requests!quote_invitations_purchase_request_id_fkey(request_number,lines:purchase_request_items(quantity,item:items(material_number,description,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(status))')
      .eq('access_token_hash', tokenHash).single()
    if (error || !invitation) return json({ error: 'Não encontramos uma solicitação válida para este link.' }, 404)
    if (invitation.status === 'cancelada') return json({ error: 'A equipe de Compras cancelou esta solicitação.' }, 410)
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now() && !['respondida', 'resposta_tardia'].includes(invitation.status)) {
      await admin.from('quote_invitations').update({ status: 'expirada' }).eq('id', invitation.id)
      return json({ error: 'Este link expirou. Solicite o reenvio à equipe de Compras.' }, 410)
    }

    const supplier = relation<any>(invitation.supplier)
    const purchaseRequest = relation<any>(invitation.request)
    const lines = (purchaseRequest?.lines ?? []).map((line: any) => {
      const item = relation<any>(line.item)
      return { materialNumber: item?.material_number ?? null, description: item?.description ?? 'Material', quantity: Number(line.quantity || 0), unit: item?.unit_of_measure || '—' }
    })
    const totalQuantity = lines.reduce((total: number, line: any) => total + line.quantity, 0)
    const locked = (purchaseRequest?.orders ?? []).some((order: any) => ['em_aprovacao', 'aprovado', 'enviado', 'recebido'].includes(order.status))
    const { data: quote } = await admin.from('quotes').select('id,quoted_value,delivery_date,freight_type,payment_terms,notes').eq('online_invitation_id', invitation.id).maybeSingle()

    if (action === 'load') {
      if (['aguardando_envio', 'enviada', 'entregue'].includes(invitation.status)) {
        await admin.from('quote_invitations').update({ status: 'acessada', accessed_at: new Date().toISOString() }).eq('id', invitation.id)
        invitation.status = 'acessada'
      }
      return json({ ok: true, supplierName: supplier?.legal_name || 'Fornecedor', requestCode: `RC-${String(purchaseRequest?.request_number ?? '').padStart(4, '0')}`, expiresAt: invitation.expires_at, status: invitation.status, locked, totalQuantity, lines, quote: quote ? { unitPrice: totalQuantity > 0 ? Number(quote.quoted_value) / totalQuantity : 0, quotedValue: Number(quote.quoted_value), deliveryDate: quote.delivery_date, freightType: quote.freight_type, paymentTerms: quote.payment_terms, commercialNotes: quote.notes } : null })
    }
    if (action !== 'submit') return json({ error: 'Ação inválida.' }, 400)

    const unitPrice = Number(body?.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || totalQuantity <= 0) return json({ error: 'Informe um preço unitário válido.' }, 422)
    const quotedValue = Math.round(unitPrice * totalQuantity * 100) / 100
    const { data: result, error: responseError } = await admin.rpc('record_online_quote_response', { p_invitation_id: invitation.id, p_quoted_value: quotedValue, p_delivery_date: String(body?.deliveryDate ?? ''), p_freight_type: String(body?.freightType ?? ''), p_payment_terms: String(body?.paymentTerms ?? '').trim().slice(0, 200), p_commercial_notes: String(body?.commercialNotes ?? '').trim().slice(0, 2000) || null })
    if (responseError) return json({ error: responseError.message || 'Confira os dados e tente novamente.' }, 422)
    if (result?.expired) return json({ error: 'Este link expirou. Solicite o reenvio à equipe de Compras.' }, 410)
    return json({ ok: true, late: Boolean(result?.late), version: result?.version })
  } catch (error) {
    console.error(error)
    return json({ error: 'Não foi possível processar a cotação. Tente novamente em alguns minutos.' }, 500)
  }
})
