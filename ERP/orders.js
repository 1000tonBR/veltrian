const orderClient = window.erpSupabase;
const orderNotice = document.querySelector('[data-notice]');
const orderForm = document.querySelector('[data-order-form]');
const orderRequestSelect = document.querySelector('[data-order-request]');
const orderQuoteSelect = document.querySelector('[data-order-quote]');
const orderCancel = document.querySelector('[data-cancel-order]');
const reasonField = document.querySelector('[data-selection-reason]');
const orderRequestFilterField = document.querySelector('[data-order-request-filter-field]');
const orderRequestFilterInput = document.querySelector('[data-order-request-filter]');
const orderRequestDateFilter = document.querySelector('[data-order-request-date-filter]');
const orderRequestResultCount = document.querySelector('[data-order-request-result-count]');
const orderListFilterField = document.querySelector('[data-order-list-filter-field]');
const orderListFilterInput = document.querySelector('[data-order-filter]');
const orderStatusFilter = document.querySelector('[data-order-status-filter]');
const orderListResultCount = document.querySelector('[data-order-list-result-count]');
let allQuotes = [];
let orders = [];
let emailDeliveries = new Map();
let editingOrderId = null;
let orderNoticeTimer;
let ordersInitialized = false;

const escapeOrder = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const orderMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const orderDate = (value, includeTime = true) => value ? new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${value}${String(value).includes('T') ? '' : 'T12:00:00'}`)) : '—';
const orderCode = (number) => `PC-${String(number).padStart(4, '0')}`;
const orderRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const orderMaterial = (request) => request?.lines?.map((line) => `${line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')} · ` : ''}${line.item?.description || ''}`).filter(Boolean).join(', ') || '—';
const orderQuantity = (request) => request?.lines?.map((line) => line.quantity).filter(Boolean).join(', ') || '—';
const orderRequester = (request) => request?.requester?.full_name || request?.requester?.email || 'Solicitante não identificado';
const normalizeOrderSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const orderDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const orderRequestFilterPlaceholders = {
  all: 'Digite RC, material ou solicitante',
  rc: 'Digite o número da RC',
  material: 'Digite o código ou a descrição do material',
  requester: 'Digite o nome ou e-mail do solicitante'
};
const orderListFilterPlaceholders = {
  all: 'Digite pedido, RC, material ou fornecedor',
  order: 'Digite o número do pedido',
  rc: 'Digite o número da RC',
  supplier: 'Digite o nome do fornecedor',
  material: 'Digite o código ou a descrição do material'
};

function orderStatusBadge(status) {
  const labels = { rascunho: 'Rascunho', em_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado', reprovado: 'Rejeitado', enviado: 'Formalizado', recebido: 'Formalizado', cancelado: 'Cancelado' };
  const classes = { rascunho: 'pending', em_aprovacao: 'approval', aprovado: 'approved', reprovado: 'rejected', enviado: 'issued', recebido: 'approved', cancelado: 'cancelled' };
  return `<span class="status ${classes[status] || 'pending'}">${labels[status] || escapeOrder(status)}</span>`;
}

function orderEmailBadge(delivery) {
  if (!delivery) return '<span class="email-delivery none">Não enviado</span>';
  const received = delivery.status === 'recebido';
  const date = orderDate(received ? delivery.received_at : delivery.sent_at);
  return `<span class="email-delivery ${received ? 'received' : 'sent'}">${received ? 'Recebido' : 'Enviado'}</span><small class="email-delivery-date">${date}</small>`;
}

function showOrderNotice(text, type = 'success') {
  if (!orderNotice) return;
  clearTimeout(orderNoticeTimer); orderNotice.textContent = text; orderNotice.dataset.type = type; orderNotice.classList.remove('is-visible');
  requestAnimationFrame(() => orderNotice.classList.add('is-visible')); orderNoticeTimer = setTimeout(() => orderNotice.classList.remove('is-visible'), 5000);
}
function refreshOrders(text) { showOrderNotice(text); setTimeout(() => window.location.reload(), 1500); }
function quotesForRequest(requestId) { return allQuotes.filter((quote) => quote.purchase_request_id === requestId).sort((a, b) => Number(a.net_value) - Number(b.net_value)); }

function availableOrderRequests(includeAll = false) {
  const existingRequestIds = new Set(orders.map((order) => order.purchase_request_id));
  const requestMap = new Map(); allQuotes.forEach((quote) => requestMap.set(quote.purchase_request_id, quote.request));
  return [...requestMap.entries()].filter(([id]) => includeAll || !existingRequestIds.has(id));
}

function orderRequestFields(request) {
  return {
    rc: [orderRcCode(request?.request_number || ''), request?.request_number],
    material: [orderMaterial(request)],
    requester: [request?.requester?.full_name, request?.requester?.email],
    date: [orderDateKey(request?.created_at)],
    all: [orderRcCode(request?.request_number || ''), request?.request_number, orderMaterial(request), request?.requester?.full_name, request?.requester?.email, orderDate(request?.created_at, false), orderDateKey(request?.created_at)]
  };
}

function renderRequestOptions(includeAll = false, entries = null, selectedRequestId = orderRequestSelect.value) {
  const available = availableOrderRequests(includeAll);
  const displayed = entries || available;
  const selectedEntry = selectedRequestId && available.find(([id]) => id === selectedRequestId);
  const visible = selectedEntry && !displayed.some(([id]) => id === selectedRequestId) ? [selectedEntry, ...displayed] : displayed;
  const emptyLabel = displayed.length ? 'Selecione uma requisição' : 'Nenhuma requisição encontrada';
  orderRequestSelect.innerHTML = `<option value="">${emptyLabel}</option>${visible.map(([id, request]) => `<option value="${id}">${orderRcCode(request?.request_number || '')} · ${escapeOrder(orderMaterial(request))} — ${escapeOrder(orderRequester(request))} · ${orderDate(request?.created_at, false)}</option>`).join('')}`;
  if (selectedEntry) orderRequestSelect.value = selectedRequestId;
  if (orderRequestResultCount) {
    orderRequestResultCount.textContent = displayed.length === 1 ? '1 requisição encontrada' : `${displayed.length} requisições encontradas`;
    orderRequestResultCount.dataset.empty = String(displayed.length === 0);
  }
}

function applyOrderRequestFilter() {
  const field = orderRequestFilterField?.value || 'all';
  const term = field === 'date' ? orderRequestDateFilter?.value || '' : normalizeOrderSearch(orderRequestFilterInput?.value);
  const includeAll = Boolean(editingOrderId);
  const available = availableOrderRequests(includeAll);
  const filtered = term ? available.filter(([, request]) => orderRequestFields(request)[field].some((value) => normalizeOrderSearch(value).includes(normalizeOrderSearch(term)))) : available;
  renderRequestOptions(includeAll, filtered, orderRequestSelect.value);
}

function resetOrderRequestFilter() {
  if (orderRequestFilterField) { orderRequestFilterField.value = 'all'; orderRequestFilterField.disabled = false; }
  if (orderRequestFilterInput) { orderRequestFilterInput.value = ''; orderRequestFilterInput.placeholder = orderRequestFilterPlaceholders.all; orderRequestFilterInput.hidden = false; orderRequestFilterInput.disabled = false; }
  if (orderRequestDateFilter) { orderRequestDateFilter.value = ''; orderRequestDateFilter.hidden = true; orderRequestDateFilter.disabled = false; }
}

function lockOrderRequestFilter() {
  if (orderRequestFilterField) orderRequestFilterField.disabled = true;
  if (orderRequestFilterInput) orderRequestFilterInput.disabled = true;
  if (orderRequestDateFilter) orderRequestDateFilter.disabled = true;
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
  document.querySelector('[data-order-summary]').innerHTML = `<strong>${escapeOrder(quote.supplier?.legal_name)}</strong><span>${orderRcCode(quote.request?.request_number || '')} · ${escapeOrder(orderMaterial(quote.request))} · Qtd. ${escapeOrder(orderQuantity(quote.request))}</span><span>Solicitante: ${escapeOrder(orderRequester(quote.request))} · Cadastro: ${orderDate(quote.request?.created_at, false)}</span><span>Líquido: <b>${orderMoney(quote.net_value)}</b> · Entrega: ${orderDate(quote.delivery_date, false)} · Frete: ${escapeOrder(quote.freight_type)} · Pagamento: ${escapeOrder(quote.payment_terms)}</span>${isHigher ? `<em>Esta proposta está ${orderMoney(Number(quote.net_value) - Number(lowest.net_value))} acima do menor preço.</em>` : '<em class="best-choice">Menor preço sugerido automaticamente.</em>'}`;
}

function renderOrders(entries = orders) {
  const body = document.querySelector('[data-orders-rows]');
  body.innerHTML = entries.length ? entries.map((order) => {
    const delivery = emailDeliveries.get(order.id); const pdfReady = ['aprovado', 'enviado', 'recebido'].includes(order.status); const editable = ['rascunho', 'reprovado'].includes(order.status); const deletable = !['enviado', 'recebido'].includes(order.status);
    const actions = `${pdfReady ? `<button type="button" class="row-button send-order-button" data-pdf-order="${order.id}">${delivery ? 'Reenviar por e-mail' : 'Gerar e enviar'}</button>` : ''}${editable ? `<button type="button" class="row-button" data-edit-order="${order.id}">${order.status === 'reprovado' ? 'Revisar e reenviar' : 'Editar'}</button>` : ''}${deletable ? `<button type="button" class="row-button danger" data-delete-order="${order.id}">Excluir</button>` : ''}`;
    return `<tr><td>${orderCode(order.order_number)}</td><td>${orderRcCode(order.request?.request_number || '')}</td><td>${escapeOrder(order.supplier?.legal_name)}</td><td>${escapeOrder(orderMaterial(order.request))}</td><td><strong>${orderMoney(order.total_value)}</strong></td><td>${escapeOrder(order.selection_reason || 'Menor preço')}</td><td>${orderStatusBadge(order.status)}</td><td>${orderEmailBadge(delivery)}</td><td>${orderDate(order.created_at)}</td><td class="table-actions">${actions || '—'}</td></tr>`;
  }).join('') : '<tr><td colspan="10" class="empty-cell">Nenhum pedido emitido.</td></tr>';
  if (orderListResultCount) orderListResultCount.textContent = entries.length === 1 ? '1 pedido encontrado' : `${entries.length} pedidos encontrados`;
}

function orderListFields(order) {
  return {
    order: [orderCode(order.order_number), order.order_number],
    rc: [orderRcCode(order.request?.request_number || ''), order.request?.request_number],
    supplier: [order.supplier?.legal_name, order.supplier?.trade_name],
    material: [orderMaterial(order.request)],
    all: [orderCode(order.order_number), order.order_number, orderRcCode(order.request?.request_number || ''), order.request?.request_number, order.supplier?.legal_name, order.supplier?.trade_name, orderMaterial(order.request)]
  };
}

function applyOrderListFilters() {
  const field = orderListFilterField?.value || 'all';
  const term = normalizeOrderSearch(orderListFilterInput?.value);
  const status = orderStatusFilter?.value || 'all';
  const filtered = orders.filter((order) => {
    const matchesTerm = !term || orderListFields(order)[field].some((value) => normalizeOrderSearch(value).includes(term));
    const matchesStatus = status === 'all' || order.status === status;
    return matchesTerm && matchesStatus;
  });
  renderOrders(filtered);
}

async function loadAllQuotes() {
  const { data, error } = await orderClient.from('quotes').select('*,supplier:suppliers(id,legal_name,trade_name,tax_id,contact_email,contact_phone,street,address_number,city,state),request:purchase_requests(id,request_number,description,created_at,requester:profiles!purchase_requests_requested_by_fkey(full_name,email),activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar as cotações: ${error.message}`, 'error'); allQuotes = data || [];
}

async function loadOrders() {
  const { data, error } = await orderClient.from('purchase_orders').select('*,supplier:suppliers(*),quote:quotes(*),request:purchase_requests(id,request_number,description,activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar os pedidos: ${error.message}`, 'error'); orders = data || []; renderOrders();
}

async function loadEmailDeliveries() {
  const { data, error } = await orderClient.from('order_email_deliveries').select('purchase_order_id,recipient_email,status,sent_at,received_at');
  if (error) return showOrderNotice(`Não foi possível carregar o acompanhamento de e-mails: ${error.message}`, 'error');
  emailDeliveries = new Map((data || []).map((delivery) => [delivery.purchase_order_id, delivery])); renderOrders();
}

function resetOrderForm() {
  editingOrderId = null; orderForm.reset(); orderForm.elements.record_id.value = ''; orderRequestSelect.disabled = false; resetOrderRequestFilter(); renderRequestOptions(false, null, ''); orderQuoteSelect.innerHTML = '<option value="">Selecione primeiro a requisição</option>'; document.querySelector('[data-order-comparison]').innerHTML = ''; updateOrderSummary();
  document.querySelector('[data-order-kicker]').textContent = 'Novo pedido'; document.querySelector('[data-save-order]').textContent = 'Enviar para aprovação'; orderCancel.hidden = true;
}

function editOrder(id) {
  const order = orders.find((entry) => entry.id === id); if (!order) return;
  if (!['rascunho', 'reprovado'].includes(order.status)) return showOrderNotice('Este pedido não pode ser alterado enquanto está em aprovação ou depois de aprovado.', 'error');
  editingOrderId = id; resetOrderRequestFilter(); renderRequestOptions(true, null, order.purchase_request_id); orderForm.elements.record_id.value = id; orderRequestSelect.value = order.purchase_request_id; orderRequestSelect.disabled = true; lockOrderRequestFilter(); renderQuoteChoices(order.quote_id || ''); orderForm.elements.selection_reason.value = order.selection_reason || '';
  document.querySelector('[data-order-kicker]').textContent = `Revisão do ${orderCode(order.order_number)}`; document.querySelector('[data-save-order]').textContent = 'Reenviar para aprovação'; orderCancel.hidden = false; updateOrderSummary(); orderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (!['aprovado', 'enviado', 'recebido'].includes(order.status)) return showOrderNotice('O PDF será liberado somente depois da aprovação do pedido.', 'error');
  if (!window.jspdf?.jsPDF) return showOrderNotice('O gerador de PDF não foi carregado. Verifique sua conexão.', 'error');
  const recipient = String(order.supplier?.contact_email || '').trim();
  if (!recipient || !recipient.includes('@')) return showOrderNotice('Cadastre um e-mail válido no fornecedor antes de enviar o pedido.', 'error');
  if (emailDeliveries.has(id) && !confirm(`Reenviar ${orderCode(order.order_number)} para ${recipient}? Uma nova confirmação de recebimento será gerada.`)) return;

  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const quote = order.quote || {}; const request = order.request || {}; const supplier = order.supplier || {};
  doc.setFillColor(7,23,36); doc.rect(0,0,210,34,'F'); doc.setTextColor(32,197,200); doc.setFont('helvetica','bold'); doc.setFontSize(21); doc.text('VELTRIAN',16,17); doc.setTextColor(255,255,255); doc.setFontSize(10); doc.text('INDUSTRIAL PERFORMANCE & BUSINESS',16,25); doc.setFontSize(15); doc.text('PEDIDO DE COMPRA',144,20);
  doc.setTextColor(16,45,58); doc.setFontSize(11); doc.text(`Pedido: ${orderCode(order.order_number)}`,16,47); doc.text(`Data: ${orderDate(order.created_at)}`,125,47); doc.setDrawColor(219,230,231); doc.line(16,52,194,52);
  doc.setFont('helvetica','bold'); doc.text('FORNECEDOR',16,62); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([supplier.legal_name,`CNPJ/CPF: ${supplier.tax_id || '-'}`,`${supplier.street || ''} ${supplier.address_number || ''} - ${supplier.city || ''}/${supplier.state || ''}`,`Contato: ${supplier.contact_phone || '-'} | ${supplier.contact_email || '-'}`].map(pdfText),16,69);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('DADOS DA COMPRA',16,94); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([`Requisicao: ${orderRcCode(request.request_number || '')}`,`Material: ${pdfText(orderMaterial(request))}`,`Fabricante: ${pdfText(request.lines?.[0]?.item?.manufacturer || '-')}`,`Quantidade: ${orderQuantity(request)}`],16,102);
  doc.setFillColor(243,247,247); doc.roundedRect(16,126,178,34,2,2,'F'); doc.setFont('helvetica','bold'); doc.text('Preco bruto',22,137); doc.text('Desconto',79,137); doc.text('Preco liquido',136,137); doc.setFontSize(12); doc.text(pdfText(orderMoney(order.gross_value || quote.quoted_value)),22,149); doc.text(pdfText(orderMoney(order.discount_value || quote.discount_value)),79,149); doc.setTextColor(13,94,97); doc.text(pdfText(orderMoney(order.total_value)),136,149);
  doc.setTextColor(16,45,58); doc.setFontSize(10); doc.text('CONDICOES',16,173); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text([`Pagamento: ${pdfText(quote.payment_terms || order.payment_terms || '-')}`,`Entrega: ${orderDate(quote.delivery_date || order.expected_delivery_date,false)}`,`Frete: ${pdfText(quote.freight_type || '-')}`],16,181);
  doc.setDrawColor(32,197,200); doc.line(16,270,194,270); doc.setFontSize(8); doc.setTextColor(96,119,124); doc.text('Veltrian Industrial Performance & Business',16,278); doc.text('Documento gerado pelo Veltrian ERP',139,278);

  const button = document.querySelector(`[data-pdf-order="${id}"]`); const previousLabel = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Enviando…'; }
  showOrderNotice(`Enviando ${orderCode(order.order_number)} para ${recipient}…`);
  const pdfBase64 = doc.output('datauristring').split(',')[1];
  const { data, error } = await orderClient.functions.invoke('send-purchase-order', { body: { orderId: id, pdfBase64 } });
  if (button) { button.disabled = false; button.textContent = previousLabel || 'Gerar e enviar'; }
  if (error || data?.error) return showOrderNotice(data?.error || error?.message || 'Não foi possível enviar o pedido por e-mail.', 'error');
  doc.save(`${orderCode(order.order_number)}.pdf`);
  showOrderNotice(`Pedido enviado para ${data.recipient}. Aguardando confirmação de recebimento.`); setTimeout(() => window.location.reload(), 2200);
}

orderRequestSelect.addEventListener('change', () => renderQuoteChoices()); orderQuoteSelect.addEventListener('change', updateOrderSummary); orderCancel.addEventListener('click', resetOrderForm);
orderRequestFilterInput?.addEventListener('input', applyOrderRequestFilter);
orderRequestDateFilter?.addEventListener('change', applyOrderRequestFilter);
orderRequestFilterField?.addEventListener('change', () => {
  const useDate = orderRequestFilterField.value === 'date';
  orderRequestFilterInput.hidden = useDate;
  orderRequestDateFilter.hidden = !useDate;
  if (useDate) orderRequestFilterInput.value = '';
  else { orderRequestDateFilter.value = ''; orderRequestFilterInput.placeholder = orderRequestFilterPlaceholders[orderRequestFilterField.value] || orderRequestFilterPlaceholders.all; }
  applyOrderRequestFilter();
});

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const values = new FormData(orderForm); const id = values.get('record_id'); const requestId = editingOrderId ? orders.find((order) => order.id === editingOrderId)?.purchase_request_id : values.get('purchase_request_id'); const quote = allQuotes.find((entry) => entry.id === values.get('quote_id'));
  if (!quote || quote.purchase_request_id !== requestId) return showOrderNotice('Selecione uma cotação válida para esta requisição.', 'error');
  const requestQuotes = quotesForRequest(requestId); const lowest = requestQuotes[0]; const isHigher = lowest && Number(quote.net_value) > Number(lowest.net_value); const reason = String(values.get('selection_reason') || '').trim();
  if (isHigher && !reason) return showOrderNotice('Informe o motivo para escolher uma proposta acima do menor preço.', 'error');
  const { data: { user } } = await orderClient.auth.getUser(); if (!user) return showOrderNotice('Sua sessão expirou. Entre novamente.', 'error');
  const payload = { quote_id: quote.id, purchase_request_id: requestId, supplier_id: quote.supplier_id, gross_value: Number(quote.quoted_value), discount_value: Number(quote.discount_value || 0), total_value: Number(quote.net_value), payment_terms: quote.payment_terms || null, expected_delivery_date: quote.delivery_date || null, selection_reason: isHigher ? reason : null, sent_at: null, status: 'em_aprovacao', created_by: user.id };
  const query = id ? orderClient.from('purchase_orders').update(payload).eq('id', id) : orderClient.from('purchase_orders').insert(payload); const { error } = await query;
  if (error) return showOrderNotice(`Pedido não salvo: ${error.message}`, 'error');
  const { error: clearError } = await orderClient.from('quotes').update({ selected: false }).eq('purchase_request_id', requestId); if (clearError) return showOrderNotice(`Pedido salvo, mas a indicação da cotação não foi atualizada: ${clearError.message}`, 'error');
  const { error: selectError } = await orderClient.from('quotes').update({ selected: true }).eq('id', quote.id); if (selectError) return showOrderNotice(`Pedido salvo, mas a cotação escolhida não foi marcada: ${selectError.message}`, 'error');
  await orderClient.from('purchase_requests').update({ status: 'em_aprovacao' }).eq('id', requestId);
  resetOrderForm(); refreshOrders(id ? 'Pedido revisado e reenviado para aprovação.' : 'Pedido enviado para aprovação com sucesso.');
});

document.querySelector('[data-orders-rows]').addEventListener('click', (event) => { const pdf = event.target.closest('[data-pdf-order]'); const edit = event.target.closest('[data-edit-order]'); const remove = event.target.closest('[data-delete-order]'); if (pdf) generateOrderPdf(pdf.dataset.pdfOrder); if (edit) editOrder(edit.dataset.editOrder); if (remove) deleteOrder(remove.dataset.deleteOrder); });
orderListFilterInput?.addEventListener('input', applyOrderListFilters);
orderStatusFilter?.addEventListener('change', applyOrderListFilters);
orderListFilterField?.addEventListener('change', () => {
  if (orderListFilterInput) orderListFilterInput.placeholder = orderListFilterPlaceholders[orderListFilterField.value] || orderListFilterPlaceholders.all;
  applyOrderListFilters();
});

function initializeOrders() {
  if (ordersInitialized) return;
  ordersInitialized = true;
  Promise.all([loadAllQuotes(), loadOrders(), loadEmailDeliveries()]).then(() => { renderRequestOptions(); renderOrders(); });
}

orderClient.auth.getSession().then(({ data: { session } }) => { if (session) initializeOrders(); });
orderClient.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(initializeOrders); });
