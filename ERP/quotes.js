const quoteClient = window.erpSupabase;
const quoteNotice = document.querySelector('[data-notice]');
const quoteForm = document.querySelector('[data-quote-form]');
const requestSelect = document.querySelector('[data-quote-request]');
const quoteOptions = document.querySelector('[data-manual-quote-options]');
const onlineQuoteOptions = document.querySelector('[data-online-quote-options]');
const addQuoteButton = document.querySelector('[data-add-quote]');
const openOnlineQuotesButton = document.querySelector('[data-open-online-quotes]');
const onlineQuoteDialog = document.querySelector('[data-online-quote-dialog]');
const onlineSupplierFilterField = document.querySelector('[data-online-supplier-filter-field]');
const onlineSupplierFilter = document.querySelector('[data-online-supplier-filter]');
const onlineSupplierList = document.querySelector('[data-online-supplier-list]');
const onlineSelectAll = document.querySelector('[data-online-select-all]');
const onlineSelectedCount = document.querySelector('[data-online-selected-count]');
const prepareOnlineQuotesButton = document.querySelector('[data-prepare-online-quotes]');
const quoteCancel = document.querySelector('[data-cancel-quote]');
const requestFilterField = document.querySelector('[data-request-filter-field]');
const requestFilterInput = document.querySelector('[data-request-filter]');
const requestDateFilter = document.querySelector('[data-request-date-filter]');
const requestResultCount = document.querySelector('[data-request-result-count]');
const quoteListFilter = document.querySelector('[data-quote-filter]');
const quoteStatusFilter = document.querySelector('[data-quote-status-filter]');
let quoteRequests = [];
let quoteSuppliers = [];
let quotes = [];
let quoteInvitations = [];
let visibleOnlineSuppliers = [];
let selectedOnlineSupplierIds = new Set();
let editingRequestId = null;
let quoteNoticeTimer;

const escapeQuote = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const quoteMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quoteUnitMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quoteNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const quoteDate = (value, includeTime = true) => value ? new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${value}${String(value).includes('T') ? '' : 'T12:00:00'}`)) : '—';
const quoteRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const quoteMaterial = (request) => request?.lines?.map((line) => line.item?.description).filter(Boolean).join(', ') || '—';
const quoteMaterialCode = (request) => request?.lines?.map((line) => line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')}` : '—').join(', ') || '—';
const quoteQuantity = (request) => request?.lines?.map((line) => quoteNumber(line.quantity)).join(', ') || '—';
const quoteMaterialUnit = (request) => request?.lines?.map((line) => line.item?.unit_of_measure || '—').join(', ') || '—';
const quoteUnitPrice = (quote) => {
  const quantities = quote.request?.lines?.map((line) => Number(line.quantity)).filter((quantity) => Number.isFinite(quantity) && quantity > 0) || [];
  return quantities.length === 1 ? quoteUnitMoney(Number(quote.quoted_value || 0) / quantities[0]) : '—';
};
const quoteActivity = (request) => request?.activity ? `${request.activity.code} · ${request.activity.description}` : '—';
const quoteRequester = (request) => request?.requester?.full_name || request?.requester?.email || 'Solicitante não identificado';
const normalizeQuoteSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const quoteOnlineStatuses = {
  aguardando_envio: { label: 'Aguardando envio', className: 'quote-awaiting' },
  enviada: { label: 'Enviada', className: 'quote-sent' },
  entregue: { label: 'Entregue', className: 'quote-delivered' },
  acessada: { label: 'Acessada', className: 'quote-accessed' },
  respondida: { label: 'Respondida', className: 'quote-responded' },
  expirada: { label: 'Expirada', className: 'quote-expired' },
  erro_envio: { label: 'Erro no envio', className: 'quote-error' },
  cancelada: { label: 'Cancelada', className: 'quote-cancelled' },
  resposta_tardia: { label: 'Resposta após encerramento', className: 'quote-late' }
};
const quoteOrigin = (entry) => entry?.kind === 'invitation' || entry?.origin === 'online' || entry?.online_invitation_id ? 'online' : 'manual';
const quoteProgress = (entry) => {
  if (quoteOrigin(entry) === 'manual') return { key: 'manual', label: 'Preenchida', className: 'quote-manual' };
  const storedStatus = entry?.kind === 'invitation' ? entry.status : entry?.invitation?.status;
  const key = quoteOnlineStatuses[storedStatus] ? storedStatus : 'aguardando_envio';
  return { key, ...quoteOnlineStatuses[key] };
};
const quoteOriginBadge = (quote) => `<span class="status ${quoteOrigin(quote) === 'online' ? 'quote-online' : 'quote-manual'}">${quoteOrigin(quote) === 'online' ? 'Online' : 'Manual'}</span>`;
const quoteProgressBadge = (quote) => { const progress = quoteProgress(quote); return `<span class="status ${progress.className}">${progress.label}</span>`; };
const quoteDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const requestFilterPlaceholders = {
  all: 'Digite RC, material ou solicitante',
  rc: 'Digite o número da RC',
  material: 'Digite o código ou a descrição do material',
  requester: 'Digite o nome ou e-mail do solicitante'
};

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
  return `<fieldset class="quote-card manual-quote-card" data-quote-option="${index}"><legend>Opção ${index + 1} · Manual · ${requiredLabel}</legend><label>Fornecedor<select name="supplier_${index}">${supplierOptions(value.supplier_id)}</select></label><div class="quote-value-grid"><label>Preço bruto<input name="quoted_${index}" type="number" min="0" step="0.01" value="${value.quoted_value ?? ''}"></label><label>Desconto interno<input name="discount_${index}" type="number" min="0" step="0.01" value="${value.discount_value ?? 0}"></label></div><label>Preço líquido<input class="net-input" name="net_${index}" value="${quoteMoney(value.net_value || 0)}" readonly></label><div class="quote-value-grid"><label>Data de entrega<input name="delivery_${index}" type="date" value="${value.delivery_date || ''}"></label><label>Frete<select name="freight_${index}"><option value="">Selecione</option><option value="CIF" ${value.freight_type === 'CIF' ? 'selected' : ''}>CIF</option><option value="FOB" ${value.freight_type === 'FOB' ? 'selected' : ''}>FOB</option></select></label></div><label>Condição de pagamento<input name="payment_${index}" value="${escapeQuote(value.payment_terms || '')}" placeholder="Ex.: 28 dias"></label><label>Observações comerciais<input name="notes_${index}" value="${escapeQuote(value.notes || '')}" placeholder="Opcional"></label></fieldset>`;
}

function requestIsLocked(request) {
  return (request?.orders || []).some((order) => ['em_aprovacao', 'aprovado', 'enviado', 'recebido'].includes(order.status));
}

function onlineQuoteOptionMarkup(invitation, index) {
  const quote = quotes.find((entry) => entry.online_invitation_id === invitation.id);
  const progress = quoteProgress({ ...invitation, kind: 'invitation' });
  const locked = requestIsLocked(invitation.request);
  const canEditDiscount = Boolean(quote) && progress.key === 'respondida' && !locked;
  const netValue = quote ? Math.max(Number(quote.quoted_value || 0) - Number(quote.discount_value || 0), 0) : 0;
  return `<fieldset class="quote-card online-quote-card" data-online-quote-card data-invitation-id="${invitation.id}" ${quote ? `data-online-quote-id="${quote.id}"` : ''}><legend>Opção ${index + 1} · Online · <span class="status ${progress.className}">${progress.label}</span></legend><label>Fornecedor<input value="${escapeQuote(invitation.supplier?.legal_name)}" disabled></label><div class="quote-value-grid"><label>Preço bruto informado<input type="text" value="${quote ? quoteMoney(quote.quoted_value) : ''}" placeholder="Aguardando fornecedor" disabled></label><label>Desconto interno<input data-online-discount type="number" min="0" step="0.01" value="${quote?.discount_value ?? 0}" ${canEditDiscount ? '' : 'disabled'}></label></div><label>Preço líquido<input class="net-input" data-online-net value="${quoteMoney(netValue)}" disabled></label><div class="quote-value-grid"><label>Data de entrega<input type="date" value="${quote?.delivery_date || ''}" disabled></label><label>Frete<input value="${escapeQuote(quote?.freight_type || '')}" disabled></label></div><label>Condição de pagamento<input value="${escapeQuote(quote?.payment_terms || '')}" disabled></label><label>Observações comerciais<input value="${escapeQuote(quote?.notes || '')}" disabled></label>${locked ? '<small class="online-quote-note">Cotação travada: o pedido já foi enviado para aprovação.</small>' : !quote ? '<small class="online-quote-note">Os campos serão preenchidos quando o fornecedor responder.</small>' : ''}</fieldset>`;
}

function renderOnlineQuoteOptions() {
  const requestId = requestSelect.value;
  const invitations = quoteInvitations.filter((invitation) => invitation.purchase_request_id === requestId && invitation.status !== 'cancelada');
  const startIndex = quoteOptions.querySelectorAll('[data-quote-option]').length;
  onlineQuoteOptions.innerHTML = invitations.map((invitation, index) => onlineQuoteOptionMarkup(invitation, startIndex + index)).join('');
}

function renderQuoteOptions(values = []) {
  const hasOnlineOptions = quoteInvitations.some((invitation) => invitation.purchase_request_id === requestSelect.value && invitation.status !== 'cancelada');
  const optionCount = values.length ? values.length : hasOnlineOptions ? 0 : 1;
  quoteOptions.innerHTML = Array.from({ length: optionCount }, (_, index) => quoteOptionMarkup(index, values[index])).join('');
  renderOnlineQuoteOptions();
  updateNetValues();
}

function addQuoteOption() {
  const index = quoteOptions.querySelectorAll('[data-quote-option]').length;
  quoteOptions.insertAdjacentHTML('beforeend', quoteOptionMarkup(index));
  renderOnlineQuoteOptions();
  quoteOptions.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateNetValues() {
  document.querySelectorAll('[data-quote-option]').forEach((card) => {
    const index = card.dataset.quoteOption;
    const gross = Number(card.querySelector(`[name="quoted_${index}"]`).value || 0); const discount = Number(card.querySelector(`[name="discount_${index}"]`).value || 0);
    card.querySelector(`[name="net_${index}"]`).value = quoteMoney(Math.max(gross - discount, 0));
  });
  document.querySelectorAll('[data-online-quote-card][data-online-quote-id]').forEach((card) => {
    const quote = quotes.find((entry) => entry.id === card.dataset.onlineQuoteId);
    const discountInput = card.querySelector('[data-online-discount]');
    if (!quote || !discountInput) return;
    card.querySelector('[data-online-net]').value = quoteMoney(Math.max(Number(quote.quoted_value || 0) - Number(discountInput.value || 0), 0));
  });
}

function updateRequestSummary() {
  const request = quoteRequests.find((entry) => entry.id === requestSelect.value);
  document.querySelector('[data-request-summary]').innerHTML = request ? `<strong>${quoteRcCode(request.request_number)}</strong><span>${quoteMaterialCode(request)} · ${escapeQuote(quoteMaterial(request))} · Quantidade: ${escapeQuote(quoteQuantity(request))} · Unidade: ${escapeQuote(quoteMaterialUnit(request))}</span><span>Solicitante: ${escapeQuote(quoteRequester(request))} · Cadastro: ${quoteDate(request.created_at, false)}</span><span>Atividade: ${escapeQuote(quoteActivity(request))}</span>` : 'Selecione uma requisição para ver o material e a atividade.';
  renderOnlineQuoteOptions();
}

function availableQuoteRequests(selectedRequestId = '') {
  const quotedRequestIds = new Set(quotes.map((quote) => quote.purchase_request_id));
  return quoteRequests.filter((request) => !quotedRequestIds.has(request.id) || request.id === selectedRequestId);
}

function requestFields(request) {
  return {
    rc: [quoteRcCode(request.request_number), request.request_number],
    material: [quoteMaterialCode(request), quoteMaterial(request)],
    requester: [request.requester?.full_name, request.requester?.email],
    date: [quoteDateKey(request.created_at)],
    all: [quoteRcCode(request.request_number), request.request_number, quoteMaterialCode(request), quoteMaterial(request), request.requester?.full_name, request.requester?.email, quoteDate(request.created_at, false), quoteDateKey(request.created_at)]
  };
}

function renderRequestOptions(selectedRequestId = requestSelect.value, entries = null) {
  const availableRequests = availableQuoteRequests(selectedRequestId);
  const displayedRequests = entries || availableRequests;
  const selectedRequest = selectedRequestId && availableRequests.find((request) => request.id === selectedRequestId);
  const visibleRequests = selectedRequest && !displayedRequests.some((request) => request.id === selectedRequestId) ? [selectedRequest, ...displayedRequests] : displayedRequests;
  const emptyLabel = displayedRequests.length ? 'Selecione uma requisição' : 'Nenhuma requisição encontrada';
  requestSelect.innerHTML = `<option value="">${emptyLabel}</option>${visibleRequests.map((request) => `<option value="${request.id}">${quoteRcCode(request.request_number)} · ${escapeQuote(quoteMaterial(request))} — ${escapeQuote(quoteRequester(request))} · ${quoteDate(request.created_at, false)}</option>`).join('')}`;
  if (selectedRequest) requestSelect.value = selectedRequestId;
  if (requestResultCount) {
    requestResultCount.textContent = displayedRequests.length === 1 ? '1 requisição encontrada' : `${displayedRequests.length} requisições encontradas`;
    requestResultCount.dataset.empty = String(displayedRequests.length === 0);
  }
}

function applyRequestFilter() {
  const field = requestFilterField?.value || 'all';
  const term = field === 'date' ? requestDateFilter?.value || '' : normalizeQuoteSearch(requestFilterInput?.value);
  const availableRequests = availableQuoteRequests(requestSelect.value);
  const filtered = term ? availableRequests.filter((request) => requestFields(request)[field].some((value) => normalizeQuoteSearch(value).includes(normalizeQuoteSearch(term)))) : availableRequests;
  renderRequestOptions(requestSelect.value, filtered);
}

function resetRequestFilter() {
  if (requestFilterField) requestFilterField.value = 'all';
  if (requestFilterInput) { requestFilterInput.value = ''; requestFilterInput.placeholder = requestFilterPlaceholders.all; requestFilterInput.hidden = false; }
  if (requestDateFilter) { requestDateFilter.value = ''; requestDateFilter.hidden = true; }
}

function quoteMapEntries() {
  const invitationsWithQuote = new Set(quotes.map((quote) => quote.online_invitation_id).filter(Boolean));
  return [
    ...quotes.map((quote) => ({ ...quote, kind: 'quote' })),
    ...quoteInvitations.filter((invitation) => !invitationsWithQuote.has(invitation.id)).map((invitation) => ({ ...invitation, kind: 'invitation' }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderQuotes(entries = quoteMapEntries()) {
  const lowestByRequest = new Map();
  quotes.forEach((quote) => lowestByRequest.set(quote.purchase_request_id, Math.min(lowestByRequest.get(quote.purchase_request_id) ?? Infinity, Number(quote.net_value))));
  const body = document.querySelector('[data-quotes-rows]');
  body.innerHTML = entries.length ? entries.map((quote) => {
    const request = quote.request; const lowest = Number(quote.net_value) === lowestByRequest.get(quote.purchase_request_id); const order = [...(request?.orders || [])].sort((a,b) => Number(b.order_number) - Number(a.order_number))[0]; const locked = order && ['em_aprovacao','aprovado','enviado','recebido'].includes(order.status);
    if (quote.kind === 'invitation') {
      const canCancel = !locked && !['respondida', 'cancelada', 'resposta_tardia'].includes(quote.status);
      const actions = `<span class="quote-entry-actions"><button type="button" class="row-button" data-open-online-request="${quote.purchase_request_id}">Abrir</button>${canCancel ? `<button type="button" class="row-button danger" data-cancel-online-invitation="${quote.id}">Cancelar</button>` : ''}</span>`;
      return `<tr><td>${quoteRcCode(request?.request_number || '')}</td><td>${escapeQuote(quoteMaterialCode(request))}</td><td>${escapeQuote(quoteMaterial(request))}</td><td>${escapeQuote(quoteQuantity(request))}</td><td>${escapeQuote(quoteMaterialUnit(request))}</td><td>${escapeQuote(quote.supplier?.legal_name)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${quoteOriginBadge(quote)}</td><td>${quoteProgressBadge(quote)}</td><td><span class="status pending">Aguardando fornecedor</span></td><td>${quoteDate(quote.created_at)}</td><td class="table-actions">${actions}</td></tr>`;
    }
    let result = lowest ? '<span class="status won">Cotação ganha</span>' : '<span class="status pending">Participante</span>';
    if (quote.selected && order?.status === 'em_aprovacao') result = '<span class="status approval">Aguardando aprovação</span>';
    if (quote.selected && ['aprovado','enviado','recebido'].includes(order?.status)) result = '<span class="status approved">Pedido aprovado</span>';
    if (quote.selected && order?.status === 'reprovado') result = '<span class="status rejected">Pedido rejeitado</span>';
    if (quote.selected && !order) result = '<span class="status approval">Escolhida no pedido</span>';
    const actions = locked ? '—' : quoteOrigin(quote) === 'online' ? `<button type="button" class="row-button" data-open-online-request="${quote.purchase_request_id}">Ajustar desconto</button>` : `<button type="button" class="row-button" data-edit-quote="${quote.purchase_request_id}">Editar</button><button type="button" class="row-button danger" data-delete-quote="${quote.purchase_request_id}">Excluir</button>`;
    return `<tr class="${lowest ? 'winner-row' : ''}"><td>${quoteRcCode(request?.request_number || '')}</td><td>${escapeQuote(quoteMaterialCode(request))}</td><td>${escapeQuote(quoteMaterial(request))}</td><td>${escapeQuote(quoteQuantity(request))}</td><td>${escapeQuote(quoteMaterialUnit(request))}</td><td>${escapeQuote(quote.supplier?.legal_name)}</td><td>${quoteUnitPrice(quote)}</td><td>${quoteMoney(quote.quoted_value)}</td><td>${quoteMoney(quote.discount_value)}</td><td><strong>${quoteMoney(quote.net_value)}</strong></td><td>${quoteDate(quote.delivery_date, false)}</td><td>${escapeQuote(quote.freight_type)}</td><td>${escapeQuote(quote.payment_terms)}</td><td>${quoteOriginBadge(quote)}</td><td>${quoteProgressBadge(quote)}</td><td>${result}</td><td>${quoteDate(quote.created_at)}</td><td class="table-actions">${actions}</td></tr>`;
  }).join('') : '<tr><td colspan="18" class="empty-cell">Nenhuma cotação corresponde aos filtros selecionados.</td></tr>';
}

function applyQuoteListFilters() {
  const term = normalizeQuoteSearch(quoteListFilter?.value);
  const status = quoteStatusFilter?.value || 'all';
  renderQuotes(quoteMapEntries().filter((quote) => {
    const progress = quoteProgress(quote);
    const matchesText = !term || [quoteRcCode(quote.request?.request_number || ''), quoteMaterialCode(quote.request), quoteMaterial(quote.request), quoteActivity(quote.request), quote.supplier?.legal_name].some((value) => normalizeQuoteSearch(value).includes(term));
    return matchesText && (status === 'all' || progress.key === status);
  }));
}

async function loadQuoteReferences() {
  const [requestsResult, suppliersResult] = await Promise.all([
    quoteClient.from('purchase_requests').select('id,request_number,created_at,requester:profiles!purchase_requests_requested_by_fkey(full_name,email),activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(id,order_number,status,created_at)').order('request_number', { ascending: false }),
    quoteClient.from('suppliers').select('id,supplier_number,legal_name,trade_name,contact_email,business_sector,city,state,payment_terms,active').eq('active', true).order('legal_name')
  ]);
  if (requestsResult.error) showQuoteNotice(`Não foi possível carregar as requisições: ${requestsResult.error.message}`, 'error');
  if (suppliersResult.error) showQuoteNotice(`Não foi possível carregar os fornecedores: ${suppliersResult.error.message}`, 'error');
  quoteRequests = requestsResult.data || []; quoteSuppliers = suppliersResult.data || [];
}

async function loadQuotes() {
  const { data, error } = await quoteClient.from('quotes').select('*,supplier:suppliers(id,legal_name,supplier_number),invitation:quote_invitations!quotes_online_invitation_id_fkey(id,status,recipient_email,responded_at),request:purchase_requests(id,request_number,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(order_number,status,created_at))').order('created_at', { ascending: false });
  if (error) return showQuoteNotice(`Não foi possível carregar as cotações: ${error.message}`, 'error'); quotes = data || []; applyQuoteListFilters();
}

async function loadQuoteInvitations() {
  const { data, error } = await quoteClient.from('quote_invitations').select('*,supplier:suppliers(id,supplier_number,legal_name,trade_name,contact_email,business_sector,city,state),request:purchase_requests(id,request_number,activity:activities(code,description),lines:purchase_request_items(quantity,item:items(description,material_number,unit_of_measure)),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(order_number,status,created_at))').order('created_at', { ascending: false });
  if (error) return showQuoteNotice(`Não foi possível carregar as solicitações online: ${error.message}`, 'error');
  quoteInvitations = data || [];
  applyQuoteListFilters();
}

function resetQuoteForm() {
  editingRequestId = null; quoteForm.reset(); requestSelect.disabled = false; resetRequestFilter(); renderRequestOptions(''); renderQuoteOptions(); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = 'Nova cotação'; document.querySelector('[data-save-quote]').textContent = 'Salvar cotação'; quoteCancel.hidden = true;
}

function editQuote(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId && quoteOrigin(quote) === 'manual').sort((a, b) => Number(a.net_value) - Number(b.net_value)); if (!group.length) return;
  editingRequestId = requestId; resetRequestFilter(); renderRequestOptions(requestId); requestSelect.disabled = true; renderQuoteOptions(group); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = `Edição da cotação ${quoteRcCode(group[0].request?.request_number || '')}`; document.querySelector('[data-save-quote]').textContent = 'Salvar alterações'; quoteCancel.hidden = false; quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteQuoteGroup(requestId) {
  const group = quotes.filter((quote) => quote.purchase_request_id === requestId && quoteOrigin(quote) === 'manual'); if (!group.length || !confirm(`Excluir as ${group.length} opções manuais desta cotação?`)) return;
  const { error } = await quoteClient.from('quotes').delete().in('id', group.map((quote) => quote.id));
  if (error) return showQuoteNotice(`Cotação não excluída: ${error.message}`, 'error'); refreshQuotes('Cotação excluída com sucesso. Atualizando os dados…');
}

const onlineSupplierFilterPlaceholders = { all: 'Digite número, nome, ramo ou cidade', number: 'Digite o número do fornecedor', name: 'Digite a razão social ou nome fantasia', sector: 'Digite o ramo', city: 'Digite a cidade' };
function supplierSearchValues(supplier, field) {
  const values = { number: [supplier.supplier_number, supplier.supplier_number ? `FOR-${String(supplier.supplier_number).padStart(4, '0')}` : ''], name: [supplier.legal_name, supplier.trade_name], sector: [supplier.business_sector], city: [supplier.city, supplier.state] };
  return field === 'all' ? Object.values(values).flat() : values[field] || [];
}
function renderOnlineSupplierList() {
  const requestId = requestSelect.value;
  const term = normalizeQuoteSearch(onlineSupplierFilter?.value);
  const field = onlineSupplierFilterField?.value || 'all';
  const reserved = new Set([
    ...quoteInvitations.filter((entry) => entry.purchase_request_id === requestId).map((entry) => entry.supplier_id),
    ...quotes.filter((entry) => entry.purchase_request_id === requestId).map((entry) => entry.supplier_id)
  ]);
  visibleOnlineSuppliers = quoteSuppliers.filter((supplier) => !term || supplierSearchValues(supplier, field).some((value) => normalizeQuoteSearch(value).includes(term)));
  onlineSupplierList.innerHTML = visibleOnlineSuppliers.length ? visibleOnlineSuppliers.map((supplier) => {
    const missingEmail = !String(supplier.contact_email || '').includes('@');
    const alreadyIncluded = reserved.has(supplier.id);
    const disabled = missingEmail || alreadyIncluded;
    const detail = missingEmail ? 'Sem e-mail cadastrado' : alreadyIncluded ? 'Já incluído nesta RC' : [supplier.contact_email, supplier.business_sector, supplier.city].filter(Boolean).join(' · ');
    return `<label class="online-supplier-option ${disabled ? 'is-disabled' : ''}"><input type="checkbox" value="${supplier.id}" data-online-supplier ${selectedOnlineSupplierIds.has(supplier.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${supplier.supplier_number ? `FOR-${String(supplier.supplier_number).padStart(4, '0')} · ` : ''}${escapeQuote(supplier.legal_name)}</strong><small>${escapeQuote(detail || 'E-mail disponível')}</small></span></label>`;
  }).join('') : '<p class="empty-cell">Nenhum fornecedor corresponde ao filtro.</p>';
  updateOnlineSelection();
}
function updateOnlineSelection() {
  const availableVisible = visibleOnlineSuppliers.filter((supplier) => !onlineSupplierList.querySelector(`[data-online-supplier][value="${supplier.id}"]`)?.disabled);
  const selectedVisible = availableVisible.filter((supplier) => selectedOnlineSupplierIds.has(supplier.id));
  onlineSelectAll.checked = availableVisible.length > 0 && selectedVisible.length === availableVisible.length;
  onlineSelectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < availableVisible.length;
  const count = selectedOnlineSupplierIds.size;
  onlineSelectedCount.textContent = count === 1 ? '1 fornecedor selecionado' : `${count} fornecedores selecionados`;
  prepareOnlineQuotesButton.textContent = `Preparar ${count} ${count === 1 ? 'fornecedor' : 'fornecedores'}`;
  prepareOnlineQuotesButton.disabled = count === 0;
}
function openOnlineQuoteDialog() {
  const request = quoteRequests.find((entry) => entry.id === requestSelect.value);
  if (!request) return showQuoteNotice('Selecione uma requisição antes de escolher os fornecedores.', 'error');
  if (requestIsLocked(request)) return showQuoteNotice('Esta cotação já foi enviada para aprovação e está travada.', 'error');
  selectedOnlineSupplierIds = new Set(); onlineSupplierFilter.value = ''; onlineSupplierFilterField.value = 'all';
  renderOnlineSupplierList(); onlineQuoteDialog.showModal();
}
function closeOnlineQuoteDialog() { onlineQuoteDialog.close(); }
async function prepareOnlineQuotes() {
  const requestId = requestSelect.value;
  const selected = quoteSuppliers.filter((supplier) => selectedOnlineSupplierIds.has(supplier.id));
  if (!requestId || !selected.length) return;
  prepareOnlineQuotesButton.disabled = true;
  const { data: authData, error: authError } = await quoteClient.auth.getUser();
  if (authError || !authData.user) { prepareOnlineQuotesButton.disabled = false; return showQuoteNotice('Sua sessão expirou. Entre novamente para continuar.', 'error'); }
  const rows = selected.map((supplier) => ({ purchase_request_id: requestId, supplier_id: supplier.id, recipient_email: supplier.contact_email.trim().toLowerCase(), status: 'aguardando_envio', created_by: authData.user.id }));
  const { error } = await quoteClient.from('quote_invitations').insert(rows);
  if (error) { prepareOnlineQuotesButton.disabled = false; return showQuoteNotice(`Solicitações online não preparadas: ${error.message}`, 'error'); }
  await quoteClient.from('purchase_requests').update({ status: 'em_cotacao' }).eq('id', requestId);
  closeOnlineQuoteDialog(); await loadQuoteInvitations();
  const manualQuotes = quotes.filter((quote) => quote.purchase_request_id === requestId && quoteOrigin(quote) === 'manual');
  renderQuoteOptions(manualQuotes);
  showQuoteNotice(`${selected.length} ${selected.length === 1 ? 'fornecedor preparado' : 'fornecedores preparados'} para o futuro envio online.`);
}
async function cancelOnlineInvitation(invitationId) {
  const invitation = quoteInvitations.find((entry) => entry.id === invitationId);
  if (!invitation || !confirm(`Cancelar a solicitação online para ${invitation.supplier?.legal_name || 'este fornecedor'}?`)) return;
  const { error } = await quoteClient.from('quote_invitations').update({ status: 'cancelada', cancelled_at: new Date().toISOString() }).eq('id', invitationId);
  if (error) return showQuoteNotice(`Solicitação não cancelada: ${error.message}`, 'error');
  await loadQuoteInvitations();
  const manualQuotes = quotes.filter((quote) => quote.purchase_request_id === invitation.purchase_request_id && quoteOrigin(quote) === 'manual');
  renderQuoteOptions(manualQuotes); showQuoteNotice('Solicitação online cancelada.');
}
function openOnlineRequest(requestId) {
  const request = quoteRequests.find((entry) => entry.id === requestId); if (!request) return;
  editingRequestId = requestId; resetRequestFilter(); renderRequestOptions(requestId); requestSelect.disabled = true;
  const manualQuotes = quotes.filter((quote) => quote.purchase_request_id === requestId && quoteOrigin(quote) === 'manual').sort((a, b) => Number(a.net_value) - Number(b.net_value));
  renderQuoteOptions(manualQuotes); updateRequestSummary();
  document.querySelector('[data-quote-kicker]').textContent = `Cotação ${quoteRcCode(request.request_number)}`; document.querySelector('[data-save-quote]').textContent = 'Salvar alterações'; quoteCancel.hidden = false; quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

quoteOptions.addEventListener('input', updateNetValues); addQuoteButton.addEventListener('click', addQuoteOption); requestSelect.addEventListener('change', () => { const manualQuotes = quotes.filter((quote) => quote.purchase_request_id === requestSelect.value && quoteOrigin(quote) === 'manual'); renderQuoteOptions(manualQuotes); updateRequestSummary(); }); quoteCancel.addEventListener('click', resetQuoteForm);
onlineQuoteOptions?.addEventListener('input', updateNetValues);
openOnlineQuotesButton?.addEventListener('click', openOnlineQuoteDialog);
document.querySelectorAll('[data-close-online-quotes]').forEach((button) => button.addEventListener('click', closeOnlineQuoteDialog));
onlineSupplierFilter?.addEventListener('input', renderOnlineSupplierList);
onlineSupplierFilterField?.addEventListener('change', () => { onlineSupplierFilter.placeholder = onlineSupplierFilterPlaceholders[onlineSupplierFilterField.value] || onlineSupplierFilterPlaceholders.all; renderOnlineSupplierList(); });
onlineSupplierList?.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-online-supplier]'); if (!checkbox) return;
  if (checkbox.checked) selectedOnlineSupplierIds.add(checkbox.value); else selectedOnlineSupplierIds.delete(checkbox.value); updateOnlineSelection();
});
onlineSelectAll?.addEventListener('change', () => {
  onlineSupplierList.querySelectorAll('[data-online-supplier]:not(:disabled)').forEach((checkbox) => { checkbox.checked = onlineSelectAll.checked; if (checkbox.checked) selectedOnlineSupplierIds.add(checkbox.value); else selectedOnlineSupplierIds.delete(checkbox.value); }); updateOnlineSelection();
});
prepareOnlineQuotesButton?.addEventListener('click', prepareOnlineQuotes);
requestFilterInput?.addEventListener('input', applyRequestFilter);
requestDateFilter?.addEventListener('change', applyRequestFilter);
requestFilterField?.addEventListener('change', () => {
  const useDate = requestFilterField.value === 'date';
  requestFilterInput.hidden = useDate;
  requestDateFilter.hidden = !useDate;
  if (useDate) requestFilterInput.value = '';
  else { requestDateFilter.value = ''; requestFilterInput.placeholder = requestFilterPlaceholders[requestFilterField.value] || requestFilterPlaceholders.all; }
  applyRequestFilter();
});

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(quoteForm); const wasEditing = Boolean(editingRequestId); const requestId = editingRequestId || form.get('purchase_request_id');
  const rawOptions = [...quoteOptions.querySelectorAll('[data-quote-option]')].map((card) => {
    const index = card.dataset.quoteOption;
    return { supplier_id: form.get(`supplier_${index}`), quoted: form.get(`quoted_${index}`), discount: form.get(`discount_${index}`), delivery_date: form.get(`delivery_${index}`), freight_type: form.get(`freight_${index}`), payment_terms: form.get(`payment_${index}`), notes: form.get(`notes_${index}`) };
  });
  const filled = rawOptions.filter((entry) => entry.supplier_id || entry.quoted);
  const onlineUpdates = [...onlineQuoteOptions.querySelectorAll('[data-online-quote-card][data-online-quote-id]')].map((card) => {
    const quote = quotes.find((entry) => entry.id === card.dataset.onlineQuoteId); const input = card.querySelector('[data-online-discount]');
    return quote && input && !input.disabled ? { quote, discount: Number(input.value || 0) } : null;
  }).filter(Boolean);
  if (!filled.length && !onlineUpdates.length) return showQuoteNotice('Informe uma proposta manual ou ajuste uma cotação online respondida.', 'error');
  if (filled.some((entry) => !entry.supplier_id || entry.quoted === '')) return showQuoteNotice('Toda opção utilizada precisa de fornecedor e preço bruto.', 'error');
  if (new Set(filled.map((entry) => entry.supplier_id)).size !== filled.length) return showQuoteNotice('Não repita o mesmo fornecedor.', 'error');
  const onlineSupplierIds = new Set(quoteInvitations.filter((entry) => entry.purchase_request_id === requestId && entry.status !== 'cancelada').map((entry) => entry.supplier_id));
  if (filled.some((entry) => onlineSupplierIds.has(entry.supplier_id))) return showQuoteNotice('Um fornecedor da cotação online não pode ser repetido como proposta manual.', 'error');
  const payload = filled.map((entry) => {
    const quotedValue = Number(entry.quoted); const discountValue = Number(entry.discount || 0); const existing = quotes.find((quote) => quote.purchase_request_id === requestId && quote.supplier_id === entry.supplier_id && quoteOrigin(quote) === 'manual');
    return { purchase_request_id: requestId, supplier_id: entry.supplier_id, quoted_value: quotedValue, discount_value: discountValue, net_value: Math.max(quotedValue - discountValue, 0), delivery_date: entry.delivery_date || null, freight_type: entry.freight_type || null, payment_terms: entry.payment_terms || null, notes: entry.notes || null, selected: Boolean(existing?.selected), origin: 'manual', online_invitation_id: null, supplier_submitted_at: null };
  });
  if (payload.some((entry) => entry.discount_value > entry.quoted_value) || onlineUpdates.some((entry) => entry.discount > Number(entry.quote.quoted_value))) return showQuoteNotice('O desconto não pode ser maior que o preço bruto.', 'error');
  if (payload.length) {
    const { error } = await quoteClient.from('quotes').upsert(payload, { onConflict: 'purchase_request_id,supplier_id' });
    if (error) return showQuoteNotice(`Cotação não salva: ${error.message}`, 'error');
    const keep = new Set(payload.map((entry) => entry.supplier_id)); const obsolete = quotes.filter((quote) => quote.purchase_request_id === requestId && quoteOrigin(quote) === 'manual' && !keep.has(quote.supplier_id)).map((quote) => quote.id);
    if (obsolete.length) { const { error: deleteError } = await quoteClient.from('quotes').delete().in('id', obsolete); if (deleteError) return showQuoteNotice(`Cotação salva, mas uma opção antiga não foi removida: ${deleteError.message}`, 'error'); }
  }
  for (const entry of onlineUpdates) {
    const { error } = await quoteClient.from('quotes').update({ discount_value: entry.discount, net_value: Math.max(Number(entry.quote.quoted_value) - entry.discount, 0) }).eq('id', entry.quote.id);
    if (error) return showQuoteNotice(`Desconto online não salvo: ${error.message}`, 'error');
  }
  await quoteClient.from('purchase_requests').update({ status: 'em_cotacao' }).eq('id', requestId);
  resetQuoteForm(); refreshQuotes(wasEditing ? 'Cotação atualizada com sucesso. Atualizando os dados…' : 'Cotação salva com sucesso. Atualizando os dados…');
});

document.querySelector('[data-quotes-rows]').addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-quote]'); const remove = event.target.closest('[data-delete-quote]'); const open = event.target.closest('[data-open-online-request]'); const cancel = event.target.closest('[data-cancel-online-invitation]'); if (edit) editQuote(edit.dataset.editQuote); if (remove) deleteQuoteGroup(remove.dataset.deleteQuote); if (open) openOnlineRequest(open.dataset.openOnlineRequest); if (cancel) cancelOnlineInvitation(cancel.dataset.cancelOnlineInvitation); });
quoteListFilter?.addEventListener('input', applyQuoteListFilters);
quoteStatusFilter?.addEventListener('change', applyQuoteListFilters);

Promise.all([loadQuoteReferences(), loadQuotes(), loadQuoteInvitations()]).then(() => {
  renderRequestOptions();
  renderQuoteOptions();
  updateRequestSummary();
});
