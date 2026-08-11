const quoteClient = window.erpSupabase;
const quoteNotice = document.querySelector('[data-notice]');
const quoteForm = document.querySelector('[data-quote-form]');
const requestSelect = document.querySelector('[data-quote-request]');
const quoteOptions = document.querySelector('[data-quote-options]');
const quoteCancel = document.querySelector('[data-cancel-quote]');
let quoteRequests = [];
let quoteSuppliers = [];
let quotes = [];
let editingRequestId = null;
let quoteNoticeTimer;

const escapeQuote = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const quoteMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quoteDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const quoteRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;

function showQuoteNotice(text, type = 'success') {
  if (!quoteNotice) return;
  clearTimeout(quoteNoticeTimer); quoteNotice.textContent = text; quoteNotice.dataset.type = type; quoteNotice.classList.remove('is-visible');
  requestAnimationFrame(() => quoteNotice.classList.add('is-visible'));
  quoteNoticeTimer = setTimeout(() => quoteNotice.classList.remove('is-visible'), 5000);
}
function refreshQuotes(text) { showQuoteNotice(text); setTimeout(() => window.location.reload(), 1500); }

function supplierOptions(selected = '') {
  return `<option value="">Selecione um fornecedor</option>${quoteSuppliers.map((supplier) => `<option value="${supplier.id}" ${supplier.id === selected ? 'selected' : ''}>${supplier.supplier_number ? `FOR-${String(supplier.supplier_number).padStart(4, '0')} · ` : ''}${escapeQuote(supplier.legal_name)}</option>`).join('')}`;
}

function renderQuoteOptions(values = []) {
  quoteOptions.innerHTML = [0, 1, 2].map((index) => {
    const value = values[index] || {};
    return `<fieldset class="quote-card" data-quote-option="${index}"><legend>Opção ${index + 1}</legend><label>Fornecedor<select name="supplier_${index}" required>${supplierOptions(value.supplier_id)}</select></label><div class="quote-value-grid"><label>Preço bruto<input name="quoted_${index}" type="number" min="0" step="0.01" value="${value.quoted_value ?? ''}" required></label><label>Desconto<input name="discount_${index}" type="number" min="0" step="0.01" value="${value.discount_value ?? 0}"></label></div><label>Preço líquido<input class="net-input" name="net_${index}" value="${value.net_value ?? 'R$ 0,00'}" readonly></label></fieldset>`;
  }).join('');
  updateNetValues();
}

function updateNetValues() {
  document.querySelectorAll('[data-quote-option]').forEach((card, index) => {
    const gross = Number(card.querySelector(`[name="quoted_${index}"]`).value || 0);
    const discount = Number(card.querySelector(`[name="discount_${index}"]`).value || 0);
    card.querySelector(`[name="net_${index}"]`).value = quoteMoney(Math.max(gross - discount, 0));
  });
}

function requestMaterial(request) { return request?.lines?.map((line) => line.item?.description).filter(Boolean).join(', ') || '—'; }
function requestActivity(request) { return request?.activity ? `${request.activity.code} · ${request.activity.description}` : '—'; }

function updateRequestSummary() {
  const request = quoteRequests.find((entry) => entry.id === requestSelect.value);
  document.querySelector('[data-request-summary]').innerHTML = request ? `<strong>${quoteRcCode(request.request_number)}</strong><span>Material: ${escapeQuote(requestMaterial(request))}</span><span>Atividade: ${escapeQuote(requestActivity(request))}</span>` : 'Selecione uma requisição para ver o material e a atividade.';
}

function renderQuotes(entries = quotes) {
  const body = document.querySelector('[data-quotes-rows]');
  body.innerHTML = entries.length ? entries.map((quote) => {
    const request = quote.request; const winner = quote.selected;
    return `<tr class="${winner ? 'winner-row' : ''}"><td>${quoteRcCode(request?.request_number || '')}</td><td>${escapeQuote(requestMaterial(request))}</td><td>${escapeQuote(quote.supplier?.legal_name)}</td><td>${quoteMoney(quote.quoted_value)}</td><td>${quoteMoney(quote.discount_value)}</td><td><strong>${quoteMoney(quote.net_value)}</strong></td><td>${winner ? '<span class="status won">Cotação ganha</span>' : '<span class="status pending">Participante</span>'}</td><td>${quoteDate(quote.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-edit-quote="${quote.purchase_request_id}">Editar</button><button type="button" class="row-button danger" data-delete-quote="${quote.purchase_request_id}">Excluir</button></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="empty-cell">Nenhuma cotação cadastrada.</td></tr>';
}

async function loadQuoteReferences() {
  const [requestsResult, suppliersResult] = await Promise.all([
    quoteClient.from('purchase_requests').select('id,request_number,created_at,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number))').order('request_number', { ascending: false }),
    quoteClient.from('suppliers').select('id,supplier_number,legal_name,payment_terms,active').eq('active', true).order('legal_name')
  ]);
  if (requestsResult.error) showQuoteNotice(`Não foi possível carregar as requisições: ${requestsResult.error.message}`, 'error');
  if (suppliersResult.error) showQuoteNotice(`Não foi possível carregar os fornecedores: ${suppliersResult.error.message}`, 'error');
  quoteRequests = requestsResult.data || []; quoteSuppliers = suppliersResult.data || [];
  requestSelect.innerHTML = `<option value="">Selecione uma requisição</option>${quoteRequests.map((request) => `<option value="${request.id}">${quoteRcCode(request.request_number)} · ${escapeQuote(requestMaterial(request))}</option>`).join('')}`;
  renderQuoteOptions();
}

async function loadQuotes() {
  const { data, error } = await quoteClient.from('quotes').select('*,supplier:suppliers(id,legal_name,supplier_number),request:purchase_requests(id,request_number,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number)))').order('created_at', { ascending: false });
  if (error) return showQuoteNotice(`Não foi possível carregar as cotações: ${error.message}`, 'error');
  quotes = data || []; renderQuotes();
}

function resetQuoteForm() {
  editingRequestId = null; quoteForm.reset(); requestSelect.disabled = false; renderQuoteOptions(); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = 'Nova cotação'; document.querySelector('[data-save-quote]').textContent = 'Salvar cotação'; quoteCancel.hidden = true;
}

function editQuote(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId).sort((a, b) => Number(a.net_value) - Number(b.net_value));
  if (!group.length) return;
  editingRequestId = requestId; requestSelect.value = requestId; requestSelect.disabled = true; renderQuoteOptions(group); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = `Edição da cotação ${quoteRcCode(group[0].request?.request_number || '')}`; document.querySelector('[data-save-quote]').textContent = 'Salvar alterações'; quoteCancel.hidden = false;
  quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteQuoteGroup(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId);
  if (!confirm(`Excluir as ${group.length} opções desta cotação?`)) return;
  const { error } = await quoteClient.from('quotes').delete().eq('purchase_request_id', requestId);
  if (error) return showQuoteNotice(`Cotação não excluída: ${error.message}`, 'error');
  refreshQuotes('Cotação excluída com sucesso. Atualizando os dados…');
}

quoteOptions.addEventListener('input', updateNetValues);
requestSelect.addEventListener('change', updateRequestSummary);
quoteCancel.addEventListener('click', resetQuoteForm);

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(quoteForm); const wasEditing = Boolean(editingRequestId); const requestId = editingRequestId || form.get('purchase_request_id');
  const payload = [0, 1, 2].map((index) => ({ purchase_request_id: requestId, supplier_id: form.get(`supplier_${index}`), quoted_value: Number(form.get(`quoted_${index}`)), discount_value: Number(form.get(`discount_${index}`) || 0) }));
  if (new Set(payload.map((entry) => entry.supplier_id)).size !== 3) return showQuoteNotice('Selecione três fornecedores diferentes.', 'error');
  if (payload.some((entry) => entry.discount_value > entry.quoted_value)) return showQuoteNotice('O desconto não pode ser maior que o preço bruto.', 'error');
  payload.forEach((entry) => { entry.net_value = Math.max(entry.quoted_value - entry.discount_value, 0); entry.selected = false; });
  const winner = payload.reduce((best, entry) => entry.net_value < best.net_value ? entry : best, payload[0]); winner.selected = true;

  const { error: clearWinnerError } = await quoteClient.from('quotes').update({ selected: false }).eq('purchase_request_id', requestId);
  if (clearWinnerError) return showQuoteNotice(`Cotação não salva: ${clearWinnerError.message}`, 'error');
  const { error } = await quoteClient.from('quotes').upsert(payload, { onConflict: 'purchase_request_id,supplier_id' });
  if (error) return showQuoteNotice(`Cotação não salva: ${error.message}`, 'error');

  const keep = new Set(payload.map((entry) => entry.supplier_id));
  const obsolete = quotes.filter((quote) => quote.purchase_request_id === requestId && !keep.has(quote.supplier_id)).map((quote) => quote.id);
  if (obsolete.length) {
    const { error: deleteError } = await quoteClient.from('quotes').delete().in('id', obsolete);
    if (deleteError) return showQuoteNotice(`Cotação salva, mas uma opção antiga não foi removida: ${deleteError.message}`, 'error');
  }
  await quoteClient.from('purchase_requests').update({ status: 'em_cotacao' }).eq('id', requestId);
  resetQuoteForm(); refreshQuotes(wasEditing ? 'Cotação atualizada com sucesso. Atualizando os dados…' : 'Cotação salva com sucesso. Atualizando os dados…');
});

document.querySelector('[data-quotes-rows]').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-quote]'); const remove = event.target.closest('[data-delete-quote]');
  if (edit) editQuote(edit.dataset.editQuote); if (remove) deleteQuoteGroup(remove.dataset.deleteQuote);
});
document.querySelector('[data-quote-filter]').addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderQuotes(quotes.filter((quote) => [quoteRcCode(quote.request?.request_number || ''), requestMaterial(quote.request), requestActivity(quote.request), quote.supplier?.legal_name].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
});

Promise.all([loadQuoteReferences(), loadQuotes()]);
