import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const adminKey = () => {
  const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modernKeys) return JSON.parse(modernKeys).default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const relation = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character] ?? character))
const formatNumber = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
}

const messagePage = (title: string, message: string, success: boolean, status = 200) => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | Veltrian</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef3f5;font-family:Arial,sans-serif;color:#102d3a"><main style="box-sizing:border-box;max-width:560px;padding:42px;background:#fff;border:1px solid #dbe7e8;border-radius:18px;box-shadow:0 20px 60px rgba(7,23,36,.12);text-align:center"><div style="width:58px;height:58px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;background:${success ? '#dcf7ed' : '#fde6e6'};color:${success ? '#167454' : '#9b2828'};font-size:28px">${success ? '✓' : '!'}</div><strong style="color:#0d8f8c;letter-spacing:3px">VELTRIAN</strong><h1 style="margin:16px 0 10px">${escapeHtml(title)}</h1><p style="margin:0;color:#60777c;line-height:1.6">${escapeHtml(message)}</p></main></body></html>`, { status, headers: pageHeaders })

function formPage(rawToken: string, invitation: any, quote: any, locked: boolean) {
  const supplier = relation<any>(invitation.supplier)
  const purchaseRequest = relation<any>(invitation.request)
  const lines = purchaseRequest?.lines ?? []
  const totalQuantity = lines.reduce((total: number, line: any) => total + Number(line.quantity || 0), 0)
  const unitPrice = quote && totalQuantity > 0 ? Number(quote.quoted_value) / totalQuantity : ''
  const requestCode = `RC-${String(purchaseRequest?.request_number ?? '').padStart(4, '0')}`
  const lineRows = lines.map((line: any) => {
    const item = relation<any>(line.item)
    const code = item?.material_number ? `MAT-${String(item.material_number).padStart(4, '0')}` : '—'
    return `<tr><td><strong>${escapeHtml(code)}</strong><span>${escapeHtml(item?.description || 'Material')}</span></td><td>${escapeHtml(formatNumber(line.quantity))}</td><td>${escapeHtml(item?.unit_of_measure || '—')}</td></tr>`
  }).join('')
  const minDate = new Date().toISOString().slice(0, 10)
  const action = `?token=${encodeURIComponent(rawToken)}`
  const warning = locked ? '<div class="warning"><strong>Processo já encaminhado para aprovação.</strong><span>Sua resposta será registrada no histórico, mas não alterará o pedido atual.</span></div>' : quote ? '<div class="info">Você já respondeu esta cotação. É possível corrigir e reenviar enquanto a compra estiver aberta.</div>' : ''

  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(requestCode)} | Cotação Veltrian</title><style>*{box-sizing:border-box}body{margin:0;background:#eef3f5;color:#102d3a;font-family:Arial,sans-serif}.top{padding:24px max(20px,calc((100vw - 980px)/2));background:#071724;color:#fff}.brand{color:#31d8ce;font-weight:800;letter-spacing:3px;font-size:20px}.top p{margin:7px 0 0;color:#abc0c6;font-size:12px;letter-spacing:1.5px}.wrap{max-width:980px;margin:28px auto;padding:0 18px}.card{padding:clamp(22px,4vw,38px);border:1px solid #d8e5e6;border-radius:18px;background:#fff;box-shadow:0 18px 55px rgba(7,23,36,.08)}.kicker{margin:0 0 7px;color:#087d83;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase}h1{margin:0;font-size:clamp(25px,4vw,38px)}.lead{margin:12px 0 25px;color:#60777c;line-height:1.6}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px}.summary span{padding:14px;border-radius:10px;background:#edf8f7;color:#60777c;font-size:12px}.summary strong{display:block;margin-top:5px;color:#102d3a;font-size:14px}.table{overflow:auto;margin-bottom:24px;border:1px solid #d8e5e6;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{padding:13px 15px;border-bottom:1px solid #e1ebec;text-align:left;font-size:13px}th{background:#f4f8f8;color:#60777c;font-size:11px;letter-spacing:1px}td span{display:block;margin-top:4px;color:#60777c}tr:last-child td{border-bottom:0}.info,.warning{display:grid;gap:5px;margin:0 0 20px;padding:14px 16px;border-radius:10px;background:#e7f7f5;color:#176b68;font-size:13px}.warning{background:#fff2dd;color:#8b5b14}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:grid;gap:7px;color:#38565e;font-size:13px;font-weight:700}.full{grid-column:1/-1}input,select,textarea{width:100%;padding:13px 14px;border:1px solid #bccfd1;border-radius:8px;background:#fff;color:#102d3a;font:inherit}input:focus,select:focus,textarea:focus{outline:3px solid rgba(13,143,140,.16);border-color:#0d8f8c}textarea{min-height:105px;resize:vertical}.total{padding:15px;border-radius:9px;background:#e9f7f5;color:#0d5e61;font-size:18px;font-weight:800}.actions{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px}.actions small{max-width:520px;color:#75898e;line-height:1.5}.submit{flex:none;padding:14px 22px;border:0;border-radius:9px;background:#087d83;color:#fff;font-weight:800;cursor:pointer}.submit:hover{background:#066b70}.submit:disabled{opacity:.65;cursor:wait}@media(max-width:680px){.summary,.form-grid{grid-template-columns:1fr}.full{grid-column:auto}.actions{align-items:stretch;flex-direction:column}.submit{width:100%}}</style></head><body><header class="top"><div class="brand">VELTRIAN</div><p>PORTAL DE COTAÇÃO PARA FORNECEDORES</p></header><div class="wrap"><main class="card"><p class="kicker">${escapeHtml(requestCode)}</p><h1>Enviar proposta comercial</h1><p class="lead">Olá, ${escapeHtml(supplier?.legal_name)}. Preencha as condições abaixo para retornar sua cotação à equipe de Compras da Veltrian.</p><div class="summary"><span>Requisição<strong>${escapeHtml(requestCode)}</strong></span><span>Prazo do link<strong>${escapeHtml(new Date(invitation.expires_at).toLocaleDateString('pt-BR'))}</strong></span><span>Status<strong>${quote ? 'Proposta já enviada' : 'Aguardando proposta'}</strong></span></div><div class="table"><table><thead><tr><th>Material</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>${lineRows}</tbody></table></div>${warning}<form method="post" action="${action}" data-quote-form><div class="form-grid"><label>Preço unitário (R$)<input name="unit_price" type="number" min="0.01" step="0.0001" value="${escapeHtml(unitPrice)}" required inputmode="decimal"></label><label>Data de entrega<input name="delivery_date" type="date" min="${minDate}" value="${escapeHtml(quote?.delivery_date || '')}" required></label><label>Frete<select name="freight_type" required><option value="">Selecione</option><option value="CIF" ${quote?.freight_type === 'CIF' ? 'selected' : ''}>CIF</option><option value="FOB" ${quote?.freight_type === 'FOB' ? 'selected' : ''}>FOB</option></select></label><label>Condição de pagamento<input name="payment_terms" maxlength="200" value="${escapeHtml(quote?.payment_terms || '')}" placeholder="Ex.: 28 dias" required></label><label class="full">Observações comerciais<textarea name="commercial_notes" maxlength="2000" placeholder="Marca, validade da proposta ou outras condições">${escapeHtml(quote?.notes || '')}</textarea></label><label class="full">Preço total<div class="total" data-total>${formatMoney(quote?.quoted_value || 0)}</div></label></div><div class="actions"><small>Ao enviar, sua proposta ficará registrada com data e hora. Correções futuras também serão preservadas no histórico.</small><button class="submit" type="submit">${locked ? 'Enviar resposta para o histórico' : quote ? 'Atualizar proposta' : 'Enviar proposta'}</button></div></form></main></div><script>const quantity=${JSON.stringify(totalQuantity)};const input=document.querySelector('[name="unit_price"]');const total=document.querySelector('[data-total]');const form=document.querySelector('[data-quote-form]');const format=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});function update(){total.textContent=format.format(Math.max(Number(input.value||0)*quantity,0))}input.addEventListener('input',update);form.addEventListener('submit',()=>{form.querySelector('button').disabled=true;form.querySelector('button').textContent='Enviando…'});update();</script></body></html>`, { status: 200, headers: pageHeaders })
}

Deno.serve(async (request) => {
  if (!['GET', 'POST'].includes(request.method)) return messagePage('Acesso inválido', 'Utilize o link recebido no e-mail da cotação.', false, 405)
  const rawToken = new URL(request.url).searchParams.get('token') ?? ''
  if (rawToken.length < 40) return messagePage('Link inválido', 'O link da cotação está incompleto.', false, 400)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const tokenHash = await sha256(rawToken)
    const { data: invitation, error } = await admin.from('quote_invitations')
      .select('id,purchase_request_id,supplier_id,status,expires_at,accessed_at,responded_at,supplier:suppliers!quote_invitations_supplier_id_fkey(legal_name),request:purchase_requests!quote_invitations_purchase_request_id_fkey(request_number,lines:purchase_request_items(quantity,item:items(material_number,description,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(status))')
      .eq('access_token_hash', tokenHash).single()
    if (error || !invitation) return messagePage('Link inválido', 'Não encontramos uma solicitação válida para este link.', false, 404)
    if (invitation.status === 'cancelada') return messagePage('Cotação cancelada', 'A equipe de Compras cancelou esta solicitação.', false, 410)
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now() && !['respondida', 'resposta_tardia'].includes(invitation.status)) {
      await admin.from('quote_invitations').update({ status: 'expirada' }).eq('id', invitation.id)
      return messagePage('Link expirado', 'Solicite à equipe de Compras o reenvio da cotação.', false, 410)
    }

    const purchaseRequest = relation<any>(invitation.request)
    const locked = (purchaseRequest?.orders ?? []).some((order: any) => ['em_aprovacao', 'aprovado', 'enviado', 'recebido'].includes(order.status))
    const { data: quote } = await admin.from('quotes').select('id,quoted_value,delivery_date,freight_type,payment_terms,notes').eq('online_invitation_id', invitation.id).maybeSingle()

    if (request.method === 'GET') {
      if (['aguardando_envio', 'enviada', 'entregue'].includes(invitation.status)) {
        await admin.from('quote_invitations').update({ status: 'acessada', accessed_at: new Date().toISOString() }).eq('id', invitation.id)
        invitation.status = 'acessada'
      }
      return formPage(rawToken, invitation, quote, locked)
    }

    const form = await request.formData()
    const unitPrice = Number(form.get('unit_price'))
    const quantities = (purchaseRequest?.lines ?? []).map((line: any) => Number(line.quantity || 0))
    const totalQuantity = quantities.reduce((total: number, quantity: number) => total + quantity, 0)
    const quotedValue = Math.round(unitPrice * totalQuantity * 100) / 100
    const deliveryDate = String(form.get('delivery_date') ?? '')
    const freightType = String(form.get('freight_type') ?? '')
    const paymentTerms = String(form.get('payment_terms') ?? '').trim().slice(0, 200)
    const commercialNotes = String(form.get('commercial_notes') ?? '').trim().slice(0, 2000)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || totalQuantity <= 0) return messagePage('Dados inválidos', 'Informe um preço unitário válido.', false, 422)

    const { data: result, error: responseError } = await admin.rpc('record_online_quote_response', {
      p_invitation_id: invitation.id,
      p_quoted_value: quotedValue,
      p_delivery_date: deliveryDate,
      p_freight_type: freightType,
      p_payment_terms: paymentTerms,
      p_commercial_notes: commercialNotes || null,
    })
    if (responseError) {
      console.error(responseError)
      return messagePage('Proposta não enviada', responseError.message || 'Confira os dados e tente novamente.', false, 422)
    }
    if (result?.expired) return messagePage('Link expirado', 'Solicite à equipe de Compras o reenvio da cotação.', false, 410)
    if (result?.late) return messagePage('Resposta registrada', 'O processo já estava em aprovação. Sua proposta foi preservada no histórico e a equipe de Compras poderá consultá-la.', true)
    return messagePage('Proposta enviada', 'A equipe de Compras da Veltrian recebeu sua cotação. Obrigado!', true)
  } catch (error) {
    console.error(error)
    return messagePage('Não foi possível enviar', 'Tente novamente em alguns minutos ou fale com a equipe de Compras da Veltrian.', false, 500)
  }
})
