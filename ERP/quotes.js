const quoteClient = window.erpSupabase;
const quoteNotice = document.querySelector('[data-notice]');
const quoteForm = document.querySelector('[data-quote-form]');
const requestSelect = document.querySelector('[data-quote-request]');
const quoteOptions = document.querySelector('[data-quote-options]');
const addQuoteButton = document.querySelector('[data-add-quote]');
const quoteCancel = document.querySelector('[data-cancel-quote]');
let quoteRequests = [];
let quoteSuppliers = [];
let quotes = [];
let editingRequestId = null;
let quoteNoticeTimer;

const escapeQuote = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const quoteMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quoteDate = (value, includeTime = true) => value ? new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${value}${String(value).includes('T') ? '' : 'T12:00:00'}`)) : '—';
const quoteRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const quoteMaterial = (request) => request?.lines?.map((line) => line.item?.description).filter(Boolean).join(', ') || '—';
const quoteMaterialCode = (request) => request?.lines?.map((line) => line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')}` : '—').join(', ') || '—';
const quoteActivity = (request) => request?.activity ? `${request.activity.code} · ${request.activity.description}` : '—';

function showQuoteNotice(text, type = 'success') {
  if (!quoteNotice) return;
  clearTimeout(quoteNoticeTimer); quoteNotice.textContent = text; quoteNotice.dataset.type = type; quoteNotice.classList.remove('is-visible');
  requestAnimationFrame(() => quoteNotice.classList.add('is-visible')); quoteNoticeTimer = setTimeout(() => quoteNotice.classList.remove('is-visible'), 5000);
}
function refreshQuotes(text) { showQuoteNotice(text); setTimeout(() => window.location.reload(), 1500); }

function supplierOptions(selected = '') {
  return `<option value="">Selecione um fornecedor</option>${quoteSuppliers.map((supplier) => `<option value="${supplier.id}" ${supplier.id === selected ? 'selected' : ''}>${supplier.supplier_number ? `FOR-${String(supplier.supplier_number).padStart(4, '0')} · ` : ''}${escapeQuote(supplier.legal_name)}</option>`).join('')}`;
}

function quoteOptionMarkup(index, value = {}) {
  const requiredLabel = index === 0 ? 'obrigatório' : 'opcional';
  return `<fieldset class="quote-card" data-quote-option="${index}"><legend>Opção ${index + 1} · ${requiredLabel}</legend><label>Fornecedor<select name="supplier_${index}">${supplierOptions(value.supplier_id)}</select></label><div class="quote-value-grid"><label>Preço bruto<input name="quoted_${index}" type="number" min="0" step="0.01" value="${value.quoted_value ?? ''}"></label><label>Desconto<input name="discount_${index}" type="number" min="0" step="0.01" value="${value.discount_value ?? 0}"></label></div><label>Preço líquido<input class="net-input" name="net_${index}" value="${quoteMoney(value.net_value || 0)}" readonly></label><div class="quote-value-grid"><label>Data de entrega<input name="delivery_${index}" type="date" value="${value.delivery_date || ''}"></label><label>Frete<select name="freight_${index}"><option value="">Selecione</option><option value="CIF" ${value.freight_type === 'CIF' ? 'selected' : ''}>CIF</option><option value="FOB" ${value.freight_type === 'FOB' ? 'selected' : ''}>FOB</option></select></label></div><label>Condição de pagamento<input name="payment_${index}" value="${escapeQuote(value.payment_terms || '')}" placeholder="Ex.: 28 dias"></label></fieldset>`;
}

function renderQuoteOptions(values = []) {
  const optionCount = Math.max(3, values.length);
  quoteOptions.innerHTML = Array.from({ length: optionCount }, (_, index) => quoteOptionMarkup(index, values[index])).join('');
  updateNetValues();
}

function addQuoteOption() {
  const index = quoteOptions.querySelectorAll('[data-quote-option]').length;
  quoteOptions.insertAdjacentHTML('beforeend', quoteOptionMarkup(index));
  quoteOptions.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateNetValues() {
  document.querySelectorAll('[data-quote-option]').forEach((card) => {
    const index = card.dataset.quoteOption;
    const gross = Number(card.querySelector(`[name="quoted_${index}"]`).value || 0); const discount = Number(card.querySelector(`[name="discount_${index}"]`).value || 0);
    card.querySelector(`[name="net_${index}"]`).value = quoteMoney(Math.max(gross - discount, 0));
  });
}

function updateRequestSummary() {
  const request = quoteRequests.find((entry) => entry.id === requestSelect.value);
  document.querySelector('[data-request-summary]').innerHTML = request ? `<strong>${quoteRcCode(request.request_number)}</strong><span>${quoteMaterialCode(request)} · ${escapeQuote(quoteMaterial(request))}</span><span>Atividade: ${escapeQuote(quoteActivity(request))}</span>` : 'Selecione uma requisição para ver o material e a atividade.';
}

function renderRequestOptions(selectedRequestId = '') {
  const quotedRequestIds = new Set(quotes.map((quote) => quote.purchase_request_id));
  const availableRequests = quoteRequests.filter((request) => !quotedRequestIds.has(request.id) || request.id === selectedRequestId);
  const emptyLabel = availableRequests.length ? 'Selecione uma requisição' : 'Nenhuma requisição pendente de cotação';
  requestSelect.innerHTML = `<option value="">${emptyLabel}</option>${availableRequests.map((request) => `<option value="${request.id}">${quoteRcCode(request.request_number)} · ${escapeQuote(quoteMaterial(request))}</option>`).join('')}`;
  requestSelect.value = selectedRequestId;
}

function renderQuotes(entries = quotes) {
  const lowestByRequest = new Map();
  quotes.forEach((quote) => lowestByRequest.set(quote.purchase_request_id, Math.min(lowestByRequest.get(quote.purchase_request_id) ?? Infinity, Number(quote.net_value))));
  const body = document.querySelector('[data-quotes-rows]');
  body.innerHTML = entries.length ? entries.map((quote) => {
    const request = quote.request; const lowest = Number(quote.net_value) === lowestByRequest.get(quote.purchase_request_id); const order = [...(request?.orders || [])].sort((a,b) => Number(b.order_number) - Number(a.order_number))[0]; const locked = order && ['em_aprovacao','aprovado','enviado','recebido'].includes(order.status);
    let result = lowest ? '<span class="status won">Cotação ganha</span>' : '<span class="status pending">Participante</span>';
    if (quote.selected && order?.status === 'em_aprovacao') result = '<span class="status approval">Aguardando aprovação</span>';
    if (quote.selected && ['aprovado','enviado','recebido'].includes(order?.status)) result = '<span class="status approved">Pedido aprovado</span>';
    if (quote.selected && order?.status === 'reprovado') result = '<span class="status rejected">Pedido rejeitado</span>';
    if (quote.selected && !order) result = '<span class="status approval">Escolhida no pedido</span>';
    const actions = locked ? '—' : `<button type="button" class="row-button" data-edit-quote="${quote.purchase_request_id}">Editar</button><button type="button" class="row-button danger" data-delete-quote="${quote.purchase_request_id}">Excluir</button>`;
    return `<tr class="${lowest ? 'winner-row' : ''}"><td>${quoteRcCode(request?.request_number || '')}</td><td>${escapeQuote(quoteMaterialCode(request))}</td><td>${escapeQuote(quoteMaterial(request))}</td><td>${escapeQuote(quote.supplier?.legal_name)}</td><td>${quoteMoney(quote.quoted_value)}</td><td>${quoteMoney(quote.discount_value)}</td><td><strong>${quoteMoney(quote.net_value)}</strong></td><td>${quoteDate(quote.delivery_date, false)}</td><td>${escapeQuote(quote.freight_type)}</td><td>${escapeQuote(quote.payment_terms)}</td><td>${result}</td><td>${quoteDate(quote.created_at)}</td><td class="table-actions">${actions}</td></tr>`;
  }).join('') : '<tr><td colspan="13" class="empty-cell">Nenhuma cotação cadastrada.</td></tr>';
}

async function loadQuoteReferences() {
  const [requestsResult, suppliersResult] = await Promise.all([
    quoteClient.from('purchase_requests').select('id,request_number,created_at,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number))').order('request_number', { ascending: false }),
    quoteClient.from('suppliers').select('id,supplier_number,legal_name,payment_terms,active').eq('active', true).order('legal_name')
  ]);
  if (requestsResult.error) showQuoteNotice(`Não foi possível carregar as requisições: ${requestsResult.error.message}`, 'error');
  if (suppliersResult.error) showQuoteNotice(`Não foi possível carregar os fornecedores: ${suppliersResult.error.message}`, 'error');
  quoteRequests = requestsResult.data || []; quoteSuppliers = suppliersResult.data || [];
}

async function loadQuotes() {
  const { data, error } = await quoteClient.from('quotes').select('*,supplier:suppliers(id,legal_name,supplier_number),request:purchase_requests(id,request_number,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(order_number,status,created_at))').order('created_at', { ascending: false });
  if (error) return showQuoteNotice(`Não foi possível carregar as cotações: ${error.message}`, 'error'); quotes = data || []; renderQuotes();
}

function resetQuoteForm() {
  editingRequestId = null; quoteForm.reset(); requestSelect.disabled = false; renderRequestOptions(); renderQuoteOptions(); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = 'Nova cotação'; document.querySelector('[data-save-quote]').textContent = 'Salvar cotação'; quoteCancel.hidden = true;
}

function editQuote(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId).sort((a, b) => Number(a.net_value) - Number(b.net_value)); if (!group.length) return;
  editingRequestId = requestId; renderRequestOptions(requestId); requestSelect.disabled = true; renderQuoteOptions(group); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = `Edição da cotação ${quoteRcCode(group[0].request?.request_number || '')}`; document.querySelector('[data-save-quote]').textContent = 'Salvar alterações'; quoteCancel.hidden = false; quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteQuoteGroup(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId); if (!confirm(`Excluir as ${group.length} opções desta cotação?`)) return;
  const { error } = await quoteClient.from('quotes').delete().eq('purchase_request_id', requestId);
  if (error) return showQuoteNotice(`Cotação não excluída: ${error.message}`, 'error'); refreshQuotes('Cotação excluída com sucesso. Atualizando os dados…');
}

quoteOptions.addEventListener('input', updateNetValues); addQuoteButton.addEventListener('click', addQuoteOption); requestSelect.addEventListener('change', updateRequestSummary); quoteCancel.addEventListener('click', resetQuoteForm);

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(quoteForm); const wasEditing = Boolean(editingRequestId); const requestId = editingRequestId || form.get('purchase_request_id');
  const rawOptions = [...quoteOptions.querySelectorAll('[data-quote-option]')].map((card) => {
    const index = card.dataset.quoteOption;
    return { supplier_id: form.get(`supplier_${index}`), quoted: form.get(`quoted_${index}`), discount: form.get(`discount_${index}`), delivery_date: form.get(`delivery_${index}`), freight_type: form.get(`freight_${index}`), payment_terms: form.get(`payment_${index}`) };
  });
  const filled = rawOptions.filter((entry) => entry.supplier_id || entry.quoted);
  if (!filled.length) return showQuoteNotice('Informe pelo menos uma proposta de fornecedor.', 'error');
  if (filled.some((entry) => !entry.supplier_id || entry.quoted === '')) return showQuoteNotice('Toda opção utilizada precisa de fornecedor e preço bruto.', 'error');
  if (new Set(filled.map((entry) => entry.supplier_id)).size !== filled.length) return showQuoteNotice('Não repita o mesmo fornecedor.', 'error');
  const payload = filled.map((entry) => {
    const quotedValue = Number(entry.quoted); const discountValue = Number(entry.discount || 0); const existing = quotes.find((quote) => quote.purchase_request_id === requestId && quote.supplier_id === entry.supplier_id);
    return { purchase_request_id: requestId, supplier_id: entry.supplier_id, quoted_value: quotedValue, discount_value: discountValue, net_value: Math.max(quotedValue - discountValue, 0), delivery_date: entry.delivery_date || null, freight_type: entry.freight_type || null, payment_terms: entry.payment_terms || null, selected: Boolean(existing?.selected) };
  });
  if (payload.some((entry) => entry.discount_value > entry.quoted_value)) return showQuoteNotice('O desconto não pode ser maior que o preço bruto.', 'error');
  const { error } = await quoteClient.from('quotes').upsert(payload, { onConflict: 'purchase_request_id,supplier_id' });
  if (error) return showQuoteNotice(`Cotação não salva: ${error.message}`, 'error');
  const keep = new Set(payload.map((entry) => entry.supplier_id)); const obsolete = quotes.filter((quote) => quote.purchase_request_id === requestId && !keep.has(quote.supplier_id)).map((quote) => quote.id);
  if (obsolete.length) { const { error: deleteError } = await quoteClient.from('quotes').delete().in('id', obsolete); if (deleteError) return showQuoteNotice(`Cotação salva, mas uma opção antiga não foi removida: ${deleteError.message}`, 'error'); }
  await quoteClient.from('purchase_requests').update({ status: 'em_cotacao' }).eq('id', requestId);
  resetQuoteForm(); refreshQuotes(wasEditing ? 'Cotação atualizada com sucesso. Atualizando os dados…' : 'Cotação salva com sucesso. Atualizando os dados…');
});

document.querySelector('[data-quotes-rows]').addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-quote]'); const remove = event.target.closest('[data-delete-quote]'); if (edit) editQuote(edit.dataset.editQuote); if (remove) deleteQuoteGroup(remove.dataset.deleteQuote); });
document.querySelector('[data-quote-filter]').addEventListener('input', (event) => { const term = event.target.value.trim().toLocaleLowerCase('pt-BR'); renderQuotes(quotes.filter((quote) => [quoteRcCode(quote.request?.request_number || ''), quoteMaterialCode(quote.request), quoteMaterial(quote.request), quoteActivity(quote.request), quote.supplier?.legal_name].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term)))); });

Promise.all([loadQuoteReferences(), loadQuotes()]).then(() => {
  renderRequestOptions();
  renderQuoteOptions();
  updateRequestSummary();
});
