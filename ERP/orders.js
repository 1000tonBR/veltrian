const orderClient = window.erpSupabase;
const orderNotice = document.querySelector('[data-notice]');
const orderForm = document.querySelector('[data-order-form]');
const orderRequestSelect = document.querySelector('[data-order-request]');
const orderQuoteSelect = document.querySelector('[data-order-quote]');
const orderCancel = document.querySelector('[data-cancel-order]');
const reasonField = document.querySelector('[data-selection-reason]');
let allQuotes = [];
let orders = [];
let editingOrderId = null;
let orderNoticeTimer;

const escapeOrder = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const orderMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const orderDate = (value, includeTime = true) => value ? new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${value}${String(value).includes('T') ? '' : 'T12:00:00'}`)) : '—';
const orderCode = (number) => `PC-${String(number).padStart(4, '0')}`;
const orderRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const orderMaterial = (request) => request?.lines?.map((line) => `${line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')} · ` : ''}${line.item?.description || ''}`).filter(Boolean).join(', ') || '—';
const orderQuantity = (request) => request?.lines?.map((line) => line.quantity).filter(Boolean).join(', ') || '—';

function showOrderNotice(text, type = 'success') {
  if (!orderNotice) return;
  clearTimeout(orderNoticeTimer); orderNotice.textContent = text; orderNotice.dataset.type = type; orderNotice.classList.remove('is-visible');
  requestAnimationFrame(() => orderNotice.classList.add('is-visible')); orderNoticeTimer = setTimeout(() => orderNotice.classList.remove('is-visible'), 5000);
}
function refreshOrders(text) { showOrderNotice(text); setTimeout(() => window.location.reload(), 1500); }
function quotesForRequest(requestId) { return allQuotes.filter((quote) => quote.purchase_request_id === requestId).sort((a, b) => Number(a.net_value) - Number(b.net_value)); }

function renderRequestOptions(includeAll = false) {
  const existingRequestIds = new Set(orders.map((order) => order.purchase_request_id));
  const requestMap = new Map(); allQuotes.forEach((quote) => requestMap.set(quote.purchase_request_id, quote.request));
  const available = [...requestMap.entries()].filter(([id]) => includeAll || !existingRequestIds.has(id));
  orderRequestSelect.innerHTML = `<option value="">Selecione uma requisição</option>${available.map(([id, request]) => `<option value="${id}">${orderRcCode(request?.request_number || '')} · ${escapeOrder(orderMaterial(request))}</option>`).join('')}`;
}

function renderQuoteChoices(selectedQuoteId = '') {
  const requestQuotes = quotesForRequest(orderRequestSelect.value);
  orderQuoteSelect.innerHTML = requestQuotes.length ? requestQuotes.map((quote, index) => `<option value="${quote.id}" ${quote.id === selectedQuoteId || (!selectedQuoteId && index === 0) ? 'selected' : ''}>${index === 0 ? 'MENOR PREÇO · ' : ''}${escapeOrder(quote.supplier?.legal_name)} · ${orderMoney(quote.net_value)} · ${orderDate(quote.delivery_date, false)}</option>`).join('') : '<option value="">Nenhuma cotação disponível</option>';
  document.querySelector('[data-order-comparison]').innerHTML = requestQuotes.map((quote, index) => `<article class="comparison-card ${index === 0 ? 'best' : ''}"><span>${index === 0 ? 'Menor preço' : `Opção ${index + 1}`}</span><strong>${escapeOrder(quote.supplier?.legal_name)}</strong><b>${orderMoney(quote.net_value)}</b><small>Entrega: ${orderDate(quote.delivery_date, false)} · Frete: ${escapeOrder(quote.freight_type)} · Pagamento: ${escapeOrder(quote.payment_terms)}</small></article>`).join('');
  updateOrderSummary();
}

function updateOrderSummary() {
  const requestQuotes = quotesForRequest(orderRequestSelect.value); const quote = requestQuotes.find((entry) => entry.id === orderQuoteSelect.value); const lowest = requestQuotes[0];
  if (!quote) { document.querySelector('[data-order-summary]').textContent = 'Selecione uma requisição cotada.'; reasonField.hidden = true; return; }
  const isHigher = lowest && Number(quote.net_value) > Number(lowest.net_value); reasonField.hidden = !isHigher; reasonField.querySelector('textarea').required = isHigher;
  document.querySelector('[data-order-summary]').innerHTML = `<strong>${escapeOrder(quote.supplier?.legal_name)}</strong><span>${orderRcCode(quote.request?.request_number || '')} · ${escapeOrder(orderMaterial(quote.request))} · Qtd. ${escapeOrder(orderQuantity(quote.request))}</span><span>Líquido: <b>${orderMoney(quote.net_value)}</b> · Entrega: ${orderDate(quote.delivery_date, false)} · Frete: ${escapeOrder(quote.freight_type)} · Pagamento: ${escapeOrder(quote.payment_terms)}</span>${isHigher ? `<em>Esta proposta está ${orderMoney(Number(quote.net_value) - Number(lowest.net_value))} acima do menor preço.</em>` : '<em class="best-choice">Menor preço sugerido automaticamente.</em>'}`;
}

function renderOrders(entries = orders) {
  const body = document.querySelector('[data-orders-rows]');
  body.innerHTML = entries.length ? entries.map((order) => `<tr><td>${orderCode(order.order_number)}</td><td>${orderRcCode(order.request?.request_number || '')}</td><td>${escapeOrder(order.supplier?.legal_name)}</td><td>${escapeOrder(orderMaterial(order.request))}</td><td><strong>${orderMoney(order.total_value)}</strong></td><td>${escapeOrder(order.selection_reason || 'Menor preço')}</td><td><span class="status ${order.status === 'cancelado' ? 'pending' : 'approved'}">${escapeOrder(String(order.status).replaceAll('_', ' '))}</span></td><td>${orderDate(order.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-pdf-order="${order.id}">${order.sent_at ? 'Reenviar PDF' : 'Gerar PDF'}</button><button type="button" class="row-button" data-edit-order="${order.id}">Editar</button><button type="button" class="row-button danger" data-delete-order="${order.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="9" class="empty-cell">Nenhum pedido emitido.</td></tr>';
}

async function loadAllQuotes() {
  const { data, error } = await orderClient.from('quotes').select('*,supplier:suppliers(id,legal_name,trade_name,tax_id,contact_email,contact_phone,street,address_number,city,state),request:purchase_requests(id,request_number,description,activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar as cotações: ${error.message}`, 'error'); allQuotes = data || [];
}

async function loadOrders() {
  const { data, error } = await orderClient.from('purchase_orders').select('*,supplier:suppliers(*),quote:quotes(*),request:purchase_requests(id,request_number,description,activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar os pedidos: ${error.message}`, 'error'); orders = data || []; renderOrders();
}

function resetOrderForm() {
  editingOrderId = null; orderForm.reset(); orderForm.elements.record_id.value = ''; orderRequestSelect.disabled = false; renderRequestOptions(); orderQuoteSelect.innerHTML = '<option value="">Selecione primeiro a requisição</option>'; document.querySelector('[data-order-comparison]').innerHTML = ''; updateOrderSummary();
  document.querySelector('[data-order-kicker]').textContent = 'Novo pedido'; document.querySelector('[data-save-order]').textContent = 'Confirmar e gerar pedido'; orderCancel.hidden = true;
}

function editOrder(id) {
  const order = orders.find((entry) => entry.id === id); if (!order) return;
  editingOrderId = id; renderRequestOptions(true); orderForm.elements.record_id.value = id; orderRequestSelect.value = order.purchase_request_id; orderRequestSelect.disabled = true; renderQuoteChoices(order.quote_id || ''); orderForm.elements.selection_reason.value = order.selection_reason || '';
  document.querySelector('[data-order-kicker]').textContent = `Edição do ${orderCode(order.order_number)}`; document.querySelector('[data-save-order]').textContent = 'Salvar decisão'; orderCancel.hidden = false; updateOrderSummary(); orderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteOrder(id) {
  const order = orders.find((entry) => entry.id === id); if (!confirm(`Excluir o pedido ${orderCode(order?.order_number || '')}?`)) return;
  const { error } = await orderClient.from('purchase_orders').delete().eq('id', id); if (error) return showOrderNotice(`Pedido não excluído: ${error.message}`, 'error');
  await orderClient.from('quotes').update({ selected: false }).eq('purchase_request_id', order.purchase_request_id); await orderClient.from('purchase_requests').update({ status: 'em_cotacao' }).eq('id', order.purchase_request_id);
  refreshOrders('Pedido excluído com sucesso. Atualizando os dados…');
}

function pdfText(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

async function generateOrderPdf(id) {
  const order = orders.find((entry) => entry.id === id); if (!order) return;
  if (!window.jspdf?.jsPDF) return showOrderNotice('O gerador de PDF não foi carregado. Verifique sua conexão.', 'error');
  const { error } = await orderClient.from('purchase_orders').update({ sent_at: new Date().toISOString(), status: 'enviado' }).eq('id', id); if (error) return showOrderNotice(`Não foi possível registrar o envio do PDF: ${error.message}`, 'error');
  await orderClient.from('purchase_requests').update({ status: 'concluida' }).eq('id', order.purchase_request_id);

  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const quote = order.quote || {}; const request = order.request || {}; const supplier = order.supplier || {};
  doc.setFillColor(7,23,36); doc.rect(0,0,210,34,'F'); doc.setTextColor(32,197,200); doc.setFont('helvetica','bold'); doc.setFontSize(21); doc.text('VELTRIAN',16,17); doc.setTextColor(255,255,255); doc.setFontSize(10); doc.text('INDUSTRIAL PERFORMANCE & BUSINESS',16,25); doc.setFontSize(15); doc.text('PEDIDO DE COMPRA',144,20);
  doc.setTextColor(16,45,58); doc.setFontSize(11); doc.text(`Pedido: ${orderCode(order.order_number)}`,16,47); doc.text(`Data: ${orderDate(order.created_at)}`,125,47); doc.setDrawColor(219,230,231); doc.line(16,52,194,52);
  doc.setFont('helvetica','bold'); doc.text('FORNECEDOR',16,62); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([supplier.legal_name,`CNPJ/CPF: ${supplier.tax_id || '-'}`,`${supplier.street || ''} ${supplier.address_number || ''} - ${supplier.city || ''}/${supplier.state || ''}`,`Contato: ${supplier.contact_phone || '-'} | ${supplier.contact_email || '-'}`].map(pdfText),16,69);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('DADOS DA COMPRA',16,94); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([`Requisicao: ${orderRcCode(request.request_number || '')}`,`Material: ${pdfText(orderMaterial(request))}`,`Fabricante: ${pdfText(request.lines?.[0]?.item?.manufacturer || '-')}`,`Quantidade: ${orderQuantity(request)}`],16,102);
  doc.setFillColor(243,247,247); doc.roundedRect(16,126,178,34,2,2,'F'); doc.setFont('helvetica','bold'); doc.text('Preco bruto',22,137); doc.text('Desconto',79,137); doc.text('Preco liquido',136,137); doc.setFontSize(12); doc.text(pdfText(orderMoney(order.gross_value || quote.quoted_value)),22,149); doc.text(pdfText(orderMoney(order.discount_value || quote.discount_value)),79,149); doc.setTextColor(13,94,97); doc.text(pdfText(orderMoney(order.total_value)),136,149);
  doc.setTextColor(16,45,58); doc.setFontSize(10); doc.text('CONDICOES',16,173); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([`Pagamento: ${pdfText(quote.payment_terms || order.payment_terms || '-')}`,`Entrega: ${orderDate(quote.delivery_date || order.expected_delivery_date,false)}`,`Frete: ${pdfText(quote.freight_type || '-')}`,`Justificativa da escolha: ${pdfText(order.selection_reason || 'Menor preco')}`],16,181);
  doc.setDrawColor(32,197,200); doc.line(16,270,194,270); doc.setFontSize(8); doc.setTextColor(96,119,124); doc.text('Veltrian Industrial Performance & Business',16,278); doc.text('Documento gerado pelo Veltrian ERP',139,278); doc.save(`${orderCode(order.order_number)}.pdf`);
  showOrderNotice('PDF do pedido gerado com sucesso. O backlog foi atualizado.'); setTimeout(() => window.location.reload(), 1800);
}

orderRequestSelect.addEventListener('change', () => renderQuoteChoices()); orderQuoteSelect.addEventListener('change', updateOrderSummary); orderCancel.addEventListener('click', resetOrderForm);

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const values = new FormData(orderForm); const id = values.get('record_id'); const requestId = editingOrderId ? orders.find((order) => order.id === editingOrderId)?.purchase_request_id : values.get('purchase_request_id'); const quote = allQuotes.find((entry) => entry.id === values.get('quote_id'));
  if (!quote || quote.purchase_request_id !== requestId) return showOrderNotice('Selecione uma cotação válida para esta requisição.', 'error');
  const requestQuotes = quotesForRequest(requestId); const lowest = requestQuotes[0]; const isHigher = lowest && Number(quote.net_value) > Number(lowest.net_value); const reason = String(values.get('selection_reason') || '').trim();
  if (isHigher && !reason) return showOrderNotice('Informe o motivo para escolher uma proposta acima do menor preço.', 'error');
  const { data: { user } } = await orderClient.auth.getUser(); if (!user) return showOrderNotice('Sua sessão expirou. Entre novamente.', 'error');
  const payload = { quote_id: quote.id, purchase_request_id: requestId, supplier_id: quote.supplier_id, gross_value: Number(quote.quoted_value), discount_value: Number(quote.discount_value || 0), total_value: Number(quote.net_value), payment_terms: quote.payment_terms || null, expected_delivery_date: quote.delivery_date || null, selection_reason: isHigher ? reason : null, status: id ? orders.find((order) => order.id === id)?.status || 'rascunho' : 'rascunho', created_by: user.id };
  const query = id ? orderClient.from('purchase_orders').update(payload).eq('id', id) : orderClient.from('purchase_orders').insert(payload); const { error } = await query;
  if (error) return showOrderNotice(`Pedido não salvo: ${error.message}`, 'error');
  const { error: clearError } = await orderClient.from('quotes').update({ selected: false }).eq('purchase_request_id', requestId); if (clearError) return showOrderNotice(`Pedido salvo, mas a indicação da cotação não foi atualizada: ${clearError.message}`, 'error');
  const { error: selectError } = await orderClient.from('quotes').update({ selected: true }).eq('id', quote.id); if (selectError) return showOrderNotice(`Pedido salvo, mas a cotação escolhida não foi marcada: ${selectError.message}`, 'error');
  await orderClient.from('purchase_requests').update({ status: 'aprovada' }).eq('id', requestId);
  resetOrderForm(); refreshOrders(id ? 'Decisão atualizada com sucesso. Atualizando os dados…' : 'Pedido criado com sucesso. Agora gere o PDF para concluir.');
});

document.querySelector('[data-orders-rows]').addEventListener('click', (event) => { const pdf = event.target.closest('[data-pdf-order]'); const edit = event.target.closest('[data-edit-order]'); const remove = event.target.closest('[data-delete-order]'); if (pdf) generateOrderPdf(pdf.dataset.pdfOrder); if (edit) editOrder(edit.dataset.editOrder); if (remove) deleteOrder(remove.dataset.deleteOrder); });
document.querySelector('[data-order-filter]').addEventListener('input', (event) => { const term = event.target.value.trim().toLocaleLowerCase('pt-BR'); renderOrders(orders.filter((order) => [orderCode(order.order_number), order.order_number, orderRcCode(order.request?.request_number || ''), orderMaterial(order.request), order.supplier?.legal_name].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term)))); });

Promise.all([loadAllQuotes(), loadOrders()]).then(() => renderRequestOptions());
