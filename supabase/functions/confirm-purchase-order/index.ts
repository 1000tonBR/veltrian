import { createClient } from 'npm:@supabase/supabase-js@2.102.0'

const adminKey = () => {
  const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modernKeys) return JSON.parse(modernKeys).default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const page = (title: string, message: string, success: boolean, status = 200) => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef3f5;font-family:Arial,sans-serif;color:#102d3a"><main style="max-width:520px;padding:42px;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(7,23,36,.12);text-align:center"><div style="width:58px;height:58px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;background:${success ? '#dcf7ed' : '#fde6e6'};color:${success ? '#167454' : '#9b2828'};font-size:28px">${success ? '✓' : '!'}</div><strong style="color:#0d8f8c;letter-spacing:3px">VELTRIAN</strong><h1 style="margin:16px 0 10px">${title}</h1><p style="margin:0;color:#60777c;line-height:1.6">${message}</p></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

Deno.serve(async (request) => {
  if (request.method !== 'GET') return page('Acesso inválido', 'Utilize o botão recebido no e-mail do pedido.', false, 405)
  const rawToken = new URL(request.url).searchParams.get('token') ?? ''
  if (rawToken.length < 32) return page('Link inválido', 'O link de confirmação está incompleto.', false, 400)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(supabaseUrl, adminKey(), { auth: { persistSession: false } })
    const tokenHash = await sha256(rawToken)
    const { data: delivery, error } = await admin.from('order_email_deliveries').select('id,purchase_order_id,status,confirmation_expires_at').eq('confirmation_token_hash', tokenHash).single()
    if (error || !delivery) return page('Link inválido', 'Não encontramos uma confirmação válida para este pedido.', false, 404)
    if (delivery.status === 'recebido') return page('Recebimento já confirmado', 'Este pedido já havia sido confirmado. Obrigado!', true)
    if (new Date(delivery.confirmation_expires_at).getTime() < Date.now()) return page('Link expirado', 'Solicite à Veltrian o reenvio do pedido.', false, 410)

    const now = new Date().toISOString()
    const { error: deliveryError } = await admin.from('order_email_deliveries').update({ status: 'recebido', received_at: now, updated_at: now }).eq('id', delivery.id).eq('status', 'enviado')
    if (deliveryError) throw deliveryError
    const { error: orderError } = await admin.from('purchase_orders').update({ status: 'recebido' }).eq('id', delivery.purchase_order_id)
    if (orderError) throw orderError

    return page('Recebimento confirmado', 'A Veltrian foi notificada de que você recebeu o pedido de compra.', true)
  } catch (error) {
    console.error(error)
    return page('Não foi possível confirmar', 'Tente novamente em alguns minutos ou fale com a Veltrian.', false, 500)
  }
})
