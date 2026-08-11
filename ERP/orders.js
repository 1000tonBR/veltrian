const orderClient = window.erpSupabase;
const orderNotice = document.querySelector('[data-notice]');
const orderForm = document.querySelector('[data-order-form]');
const orderQuoteSelect = document.querySelector('[data-order-quote]');
const orderCancel = document.querySelector('[data-cancel-order]');
let winningQuotes = [];
let orders = [];
let editingOrderId = null;
let orderNoticeTimer;

const escapeOrder = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const orderMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const orderDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const orderCode = (number) => `PC-${String(number).padStart(4, '0')}`;
const orderRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const orderMaterial = (request) => request?.lines?.map((line) => line.item?.description).filter(Boolean).join(', ') || '—';
const orderQuantity = (request) => request?.lines?.map((line) => line.quantity).filter(Boolean).join(', ') || '—';

function showOrderNotice(text, type = 'success') {
  if (!orderNotice) return;
  clearTimeout(orderNoticeTimer); orderNotice.textContent = text; orderNotice.dataset.type = type; orderNotice.classList.remove('is-visible');
  requestAnimationFrame(() => orderNotice.classList.add('is-visible'));
  orderNoticeTimer = setTimeout(() => orderNotice.classList.remove('is-visible'), 5000);
}
function refreshOrders(text) { showOrderNotice(text); setTimeout(() => window.location.reload(), 1500); }

function quoteLabel(quote) {
  return `${orderRcCode(quote.request?.request_number || '')} · ${orderMaterial(quote.request)} · ${quote.supplier?.legal_name || ''} · ${orderMoney(quote.net_value)}`;
}

function updateOrderSummary() {
  const quote = winningQuotes.find((entry) => entry.id === orderQuoteSelect.value);
  document.querySelector('[data-order-summary]').innerHTML = quote ? `<strong>${escapeOrder(quote.supplier?.legal_name)}</strong><span>${orderRcCode(quote.request?.request_number || '')} · ${escapeOrder(orderMaterial(quote.request))} · Qtd. ${escapeOrder(orderQuantity(quote.request))}</span><span>Bruto: ${orderMoney(quote.quoted_value)} · Desconto: ${orderMoney(quote.discount_value)} · <b>Líquido: ${orderMoney(quote.net_value)}</b></span>` : 'Selecione uma cotação vencedora.';
}

function renderOrders(entries = orders) {
  const body = document.querySelector('[data-orders-rows]');
  body.innerHTML = entries.length ? entries.map((order) => `<tr><td>${orderCode(order.order_number)}</td><td>${orderRcCode(order.request?.request_number || '')}</td><td>${escapeOrder(order.supplier?.legal_name)}</td><td>${escapeOrder(orderMaterial(order.request))}</td><td><strong>${orderMoney(order.total_value)}</strong></td><td><span class="status ${order.status === 'cancelado' ? 'pending' : 'approved'}">${escapeOrder(String(order.status).replaceAll('_', ' '))}</span></td><td>${orderDate(order.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-pdf-order="${order.id}">${order.sent_at ? 'Reenviar PDF' : 'Gerar PDF'}</button><button type="button" class="row-button" data-edit-order="${order.id}">Editar</button><button type="button" class="row-button danger" data-delete-order="${order.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-cell">Nenhum pedido emitido.</td></tr>';
}

async function loadWinningQuotes() {
  const { data, error } = await orderClient.from('quotes').select('*,supplier:suppliers(id,legal_name,trade_name,tax_id,contact_email,contact_phone,street,address_number,city,state,payment_terms),request:purchase_requests(id,request_number,description,activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').eq('selected', true).order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar as cotações vencedoras: ${error.message}`, 'error');
  winningQuotes = data || [];
  orderQuoteSelect.innerHTML = `<option value="">Selecione uma cotação vencedora</option>${winningQuotes.map((quote) => `<option value="${quote.id}">${escapeOrder(quoteLabel(quote))}</option>`).join('')}`;
}

async function loadOrders() {
  const { data, error } = await orderClient.from('purchase_orders').select('*,supplier:suppliers(*),quote:quotes(*),request:purchase_requests(id,request_number,description,activity:activities(code,description),lines:purchase_request_items(quantity,notes,item:items(description,manufacturer,serial_number,material_number)))').order('created_at', { ascending: false });
  if (error) return showOrderNotice(`Não foi possível carregar os pedidos: ${error.message}`, 'error');
  orders = data || []; renderOrders();
}

function resetOrderForm() {
  editingOrderId = null; orderForm.reset(); orderForm.elements.record_id.value = ''; orderQuoteSelect.disabled = false; updateOrderSummary();
  document.querySelector('[data-order-kicker]').textContent = 'Novo pedido'; document.querySelector('[data-save-order]').textContent = 'Salvar pedido'; orderCancel.hidden = true;
}

function editOrder(id) {
  const order = orders.find((entry) => entry.id === id); if (!order) return;
  editingOrderId = id; orderForm.elements.record_id.value = id; orderQuoteSelect.value = order.quote_id || ''; orderQuoteSelect.disabled = true;
  orderForm.elements.payment_terms.value = order.payment_terms || ''; orderForm.elements.expected_delivery_date.value = order.expected_delivery_date || ''; orderForm.elements.status.value = order.status || 'rascunho'; orderForm.elements.notes.value = order.notes || '';
  document.querySelector('[data-order-kicker]').textContent = `Edição do ${orderCode(order.order_number)}`; document.querySelector('[data-save-order]').textContent = 'Salvar alterações'; orderCancel.hidden = false; updateOrderSummary();
  orderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteOrder(id) {
  const order = orders.find((entry) => entry.id === id);
  if (!confirm(`Excluir o pedido ${orderCode(order?.order_number || '')}?`)) return;
  const { error } = await orderClient.from('purchase_orders').delete().eq('id', id);
  if (error) return showOrderNotice(`Pedido não excluído: ${error.message}`, 'error');
  refreshOrders('Pedido excluído com sucesso. Atualizando os dados…');
}

function pdfText(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

async function generateOrderPdf(id) {
  const order = orders.find((entry) => entry.id === id); if (!order) return;
  if (!window.jspdf?.jsPDF) return showOrderNotice('O gerador de PDF não foi carregado. Verifique sua conexão.', 'error');
  const { error } = await orderClient.from('purchase_orders').update({ sent_at: new Date().toISOString(), status: order.status === 'rascunho' ? 'enviado' : order.status }).eq('id', id);
  if (error) return showOrderNotice(`Não foi possível registrar o envio do PDF: ${error.message}`, 'error');

  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const quote = order.quote || {}; const request = order.request || {}; const supplier = order.supplier || {};
  doc.setFillColor(7, 23, 36); doc.rect(0, 0, 210, 34, 'F'); doc.setTextColor(32, 197, 200); doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.text('VELTRIAN', 16, 17);
  doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.text('INDUSTRIAL PERFORMANCE & BUSINESS', 16, 25); doc.setFontSize(15); doc.text('PEDIDO DE COMPRA', 144, 20);
  doc.setTextColor(16, 45, 58); doc.setFontSize(11); doc.text(`Pedido: ${orderCode(order.order_number)}`, 16, 47); doc.text(`Data: ${orderDate(order.created_at)}`, 125, 47);
  doc.setDrawColor(219, 230, 231); doc.line(16, 52, 194, 52);
  doc.setFont('helvetica', 'bold'); doc.text('FORNECEDOR', 16, 62); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const supplierLines = [supplier.legal_name, `CNPJ/CPF: ${supplier.tax_id || '-'}`, `${supplier.street || ''} ${supplier.address_number || ''} - ${supplier.city || ''}/${supplier.state || ''}`, `Contato: ${supplier.contact_phone || '-'} | ${supplier.contact_email || '-'}`].map(pdfText);
  doc.text(supplierLines, 16, 69);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('DADOS DA COMPRA', 16, 94); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const material = pdfText(orderMaterial(request)); const manufacturer = pdfText(request.lines?.[0]?.item?.manufacturer || '-');
  doc.text([`Requisicao: ${orderRcCode(request.request_number || '')}`, `Material: ${material}`, `Fabricante: ${manufacturer}`, `Quantidade: ${orderQuantity(request)}`], 16, 102);
  doc.setFillColor(243, 247, 247); doc.roundedRect(16, 126, 178, 34, 2, 2, 'F'); doc.setFont('helvetica', 'bold'); doc.text('Preco bruto', 22, 137); doc.text('Desconto', 79, 137); doc.text('Preco liquido', 136, 137);
  doc.setFontSize(12); doc.text(pdfText(orderMoney(order.gross_value || quote.quoted_value)), 22, 149); doc.text(pdfText(orderMoney(order.discount_value || quote.discount_value)), 79, 149); doc.setTextColor(13, 94, 97); doc.text(pdfText(orderMoney(order.total_value)), 136, 149);
  doc.setTextColor(16, 45, 58); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('CONDICOES', 16, 173); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text([`Pagamento: ${pdfText(order.payment_terms || supplier.payment_terms || '-')}`, `Previsao de entrega: ${order.expected_delivery_date ? new Date(`${order.expected_delivery_date}T12:00:00`).toLocaleDateString('pt-BR') : '-'}`, `Observacoes: ${pdfText(order.notes || '-')}`], 16, 181);
  doc.setDrawColor(32, 197, 200); doc.line(16, 270, 194, 270); doc.setFontSize(8); doc.setTextColor(96, 119, 124); doc.text('Veltrian Industrial Performance & Business', 16, 278); doc.text('Documento gerado pelo Veltrian ERP', 139, 278);
  doc.save(`${orderCode(order.order_number)}.pdf`);
  showOrderNotice('PDF do pedido gerado com sucesso. O envio foi registrado no banco de dados.');
  setTimeout(() => window.location.reload(), 1800);
}

orderQuoteSelect.addEventListener('change', () => {
  const quote = winningQuotes.find((entry) => entry.id === orderQuoteSelect.value);
  if (quote && !orderForm.elements.payment_terms.value) orderForm.elements.payment_terms.value = quote.supplier?.payment_terms || '';
  updateOrderSummary();
});
orderCancel.addEventListener('click', resetOrderForm);

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(orderForm); const id = values.get('record_id'); const quoteId = orderQuoteSelect.value; const quote = winningQuotes.find((entry) => entry.id === quoteId);
  if (!quote) return showOrderNotice('Selecione uma cotação vencedora.', 'error');
  const { data: { user } } = await orderClient.auth.getUser(); if (!user) return showOrderNotice('Sua sessão expirou. Entre novamente.', 'error');
  const payload = { quote_id: quote.id, purchase_request_id: quote.purchase_request_id, supplier_id: quote.supplier_id, gross_value: Number(quote.quoted_value), discount_value: Number(quote.discount_value || 0), total_value: Number(quote.net_value), payment_terms: values.get('payment_terms') || null, expected_delivery_date: values.get('expected_delivery_date') || null, notes: values.get('notes') || null, status: values.get('status'), created_by: user.id };
  const query = id ? orderClient.from('purchase_orders').update(payload).eq('id', id) : orderClient.from('purchase_orders').insert(payload);
  const { error } = await query;
  if (error) return showOrderNotice(`Pedido não salvo: ${error.message}`, 'error');
  const message = id ? 'Pedido atualizado com sucesso. Atualizando os dados…' : 'Pedido salvo com sucesso. Atualizando os dados…'; resetOrderForm(); refreshOrders(message);
});

document.querySelector('[data-orders-rows]').addEventListener('click', (event) => {
  const pdf = event.target.closest('[data-pdf-order]'); const edit = event.target.closest('[data-edit-order]'); const remove = event.target.closest('[data-delete-order]');
  if (pdf) generateOrderPdf(pdf.dataset.pdfOrder); if (edit) editOrder(edit.dataset.editOrder); if (remove) deleteOrder(remove.dataset.deleteOrder);
});
document.querySelector('[data-order-filter]').addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderOrders(orders.filter((order) => [orderCode(order.order_number), order.order_number, orderRcCode(order.request?.request_number || ''), orderMaterial(order.request), order.supplier?.legal_name].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
});

Promise.all([loadWinningQuotes(), loadOrders()]);
