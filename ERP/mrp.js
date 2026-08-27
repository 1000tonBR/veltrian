const mrpClient = window.erpSupabase;
const mrpForm = document.querySelector('[data-mrp-form]');
const mrpNotice = document.querySelector('[data-notice]');
const mrpItemSelect = document.querySelector('[data-mrp-item]');
const mrpMaterialFilterField = document.querySelector('[data-mrp-material-filter-field]');
const mrpMaterialFilterInput = document.querySelector('[data-mrp-material-filter]');
let mrpStock = [];
let mrpMovements = [];
let mrpPurchaseRequests = [];
let mrpProcurementByItem = new Map();
let mrpNoticeTimer;

const mrpEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const mrpNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const mrpDate = (value, time = false) => value ? new Intl.DateTimeFormat('pt-BR', time ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${String(value).slice(0, 10)}${time ? String(value).slice(10) : 'T12:00:00'}`)) : '—';
const mrpCode = (number) => number ? `MAT-${String(number).padStart(4, '0')}` : '—';
const mrpNormalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const mrpToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

function showMrpNotice(text, type = 'success') {
  clearTimeout(mrpNoticeTimer); mrpNotice.textContent = text; mrpNotice.dataset.type = type; mrpNotice.classList.remove('is-visible'); requestAnimationFrame(() => mrpNotice.classList.add('is-visible')); mrpNoticeTimer = setTimeout(() => mrpNotice.classList.remove('is-visible'), 5000);
}

function stockStatus(item) {
  const current = Number(item.current_stock); const minimum = Number(item.minimum_stock); const maximum = Number(item.maximum_stock);
  if (current < minimum) return { key: 'below', label: 'Abaixo do mínimo', className: 'rejected' };
  if (current > maximum) return { key: 'above', label: 'Acima do máximo', className: 'pending' };
  return { key: 'normal', label: 'Dentro da faixa', className: 'approved' };
}

const procurementStatusByOrder = {
  rascunho: { key: 'draft', label: 'Pedido em preparação', className: 'pending' },
  em_aprovacao: { key: 'approval', label: 'Pedido em aprovação', className: 'approval' },
  aprovado: { key: 'approved', label: 'Pedido aprovado', className: 'approved' },
  reprovado: { key: 'rejected', label: 'Pedido rejeitado', className: 'rejected' },
  enviado: { key: 'issued', label: 'Pedido emitido', className: 'issued' },
  recebido: { key: 'received', label: 'Pedido recebido', className: 'approved' },
  cancelado: { key: 'cancelled', label: 'Pedido cancelado', className: 'cancelled' }
};
const activeProcurementKeys = new Set(['request', 'quote', 'draft', 'approval', 'approved', 'rejected']);
const noProcurementStatus = { key: 'none', label: 'Sem processo de compra', className: 'process-none', reference: '', requestReference: '' };

function requestProcurementStatus(request) {
  const orders = [...(request.orders || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || Number(b.order_number) - Number(a.order_number));
  const order = orders[0];
  if (order) return { ...(procurementStatusByOrder[order.status] || { key: 'request', label: 'Requisição emitida', className: 'pending' }), reference: `PC-${String(order.order_number).padStart(4, '0')}`, requestReference: `RC-${String(request.request_number).padStart(4, '0')}`, createdAt: order.created_at || request.created_at };
  const requestStatuses = {
    rascunho: { key: 'request', label: 'Requisição emitida', className: 'pending' },
    em_cotacao: { key: 'quote', label: 'Em cotação', className: 'quote-open' },
    em_aprovacao: { key: 'approval', label: 'Pedido em aprovação', className: 'approval' },
    aprovada: { key: 'approved', label: 'Requisição aprovada', className: 'approved' },
    reprovada: { key: 'rejected', label: 'Requisição rejeitada', className: 'rejected' },
    concluida: { key: 'completed', label: 'Processo concluído', className: 'approved' }
  };
  const fallback = request.quotes?.length ? { key: 'quote', label: 'Em cotação', className: 'quote-open' } : { key: 'request', label: 'Requisição emitida', className: 'pending' };
  return { ...(requestStatuses[request.status] || fallback), reference: `RC-${String(request.request_number).padStart(4, '0')}`, requestReference: '', createdAt: request.created_at };
}

function buildProcurementIndex() {
  mrpProcurementByItem = new Map();
  mrpPurchaseRequests.forEach((request) => {
    const candidate = requestProcurementStatus(request);
    (request.lines || []).forEach((line) => {
      const current = mrpProcurementByItem.get(line.item_id);
      const candidateIsActive = activeProcurementKeys.has(candidate.key); const currentIsActive = current && activeProcurementKeys.has(current.key);
      if (!current || (candidateIsActive && !currentIsActive) || (candidateIsActive === currentIsActive && new Date(candidate.createdAt) > new Date(current.createdAt))) mrpProcurementByItem.set(line.item_id, candidate);
    });
  });
}

function procurementStatus(itemId) {
  return mrpProcurementByItem.get(itemId) || noProcurementStatus;
}

function materialSearchValues(item, field) {
  const values = { code: [mrpCode(item.material_number), item.material_number], description: [item.description], all: [mrpCode(item.material_number), item.material_number, item.description] };
  return values[field] || values.all;
}

function renderMaterialOptions() {
  const field = mrpMaterialFilterField.value; const term = mrpNormalize(mrpMaterialFilterInput.value); const selected = mrpItemSelect.value;
  const filtered = term ? mrpStock.filter((item) => materialSearchValues(item, field).some((value) => mrpNormalize(value).includes(term))) : mrpStock;
  mrpItemSelect.innerHTML = `<option value="">${filtered.length ? 'Selecione um material' : 'Nenhum material encontrado'}</option>${filtered.map((item) => `<option value="${item.id}">${mrpCode(item.material_number)} · ${mrpEscape(item.description)} — ${mrpEscape(item.unit_of_measure)}</option>`).join('')}`;
  if (filtered.some((item) => item.id === selected)) mrpItemSelect.value = selected;
  const count = document.querySelector('[data-mrp-material-result-count]'); count.textContent = `${filtered.length} ${filtered.length === 1 ? 'material encontrado' : 'materiais encontrados'}`; count.dataset.empty = String(!filtered.length);
  renderSelectedMaterial();
}

function renderSelectedMaterial() {
  const item = mrpStock.find((entry) => entry.id === mrpItemSelect.value); const target = document.querySelector('[data-mrp-material-summary]');
  if (!item) { target.textContent = 'Selecione um material para consultar os limites e o saldo atual.'; return; }
  const status = stockStatus(item); target.innerHTML = `<strong>${mrpCode(item.material_number)} · ${mrpEscape(item.description)}</strong><span>Saldo atual: <b>${mrpNumber(item.current_stock)} ${mrpEscape(item.unit_of_measure)}</b></span><span>Mínimo: ${mrpNumber(item.minimum_stock)} · Máximo: ${mrpNumber(item.maximum_stock)}</span><em class="stock-text-${status.key}">${status.label}</em>`;
}

function renderMrpMetrics() {
  document.querySelector('[data-mrp-controlled]').textContent = mrpStock.length;
  document.querySelector('[data-mrp-below]').textContent = mrpStock.filter((item) => stockStatus(item).key === 'below').length;
  document.querySelector('[data-mrp-normal]').textContent = mrpStock.filter((item) => stockStatus(item).key === 'normal').length;
  document.querySelector('[data-mrp-above]').textContent = mrpStock.filter((item) => stockStatus(item).key === 'above').length;
}

function renderStock() {
  const term = mrpNormalize(document.querySelector('[data-mrp-stock-filter]').value); const statusFilter = document.querySelector('[data-mrp-status-filter]').value; const procurementFilter = document.querySelector('[data-mrp-procurement-filter]').value;
  const entries = mrpStock.filter((item) => (!term || [mrpCode(item.material_number), item.description].some((value) => mrpNormalize(value).includes(term))) && (!statusFilter || stockStatus(item).key === statusFilter) && (!procurementFilter || procurementStatus(item.id).key === procurementFilter));
  document.querySelector('[data-mrp-stock-rows]').innerHTML = entries.length ? entries.map((item) => { const status = stockStatus(item); const process = procurementStatus(item.id); const references = [process.reference, process.requestReference].filter(Boolean).join(' · '); return `<tr class="stock-row-${status.key}"><td><strong>${mrpCode(item.material_number)}</strong></td><td><span class="status ${process.className}">${process.label}</span>${references ? `<small class="procurement-reference">${mrpEscape(references)}</small>` : ''}</td><td>${mrpEscape(item.description)}</td><td>${mrpEscape(item.unit_of_measure)}</td><td><strong>${mrpNumber(item.current_stock)}</strong></td><td>${mrpNumber(item.minimum_stock)}</td><td>${mrpNumber(item.maximum_stock)}</td><td><span class="status ${status.className}">${status.label}</span></td><td>${mrpDate(item.last_movement_date)}</td></tr>`; }).join('') : '<tr><td colspan="9" class="empty-cell">Nenhum material corresponde aos filtros.</td></tr>';
}

function renderMovements() {
  const term = mrpNormalize(document.querySelector('[data-mrp-movement-filter]').value); const entries = mrpMovements.filter((movement) => !term || [mrpCode(movement.item?.material_number), movement.item?.description, movement.description].some((value) => mrpNormalize(value).includes(term)));
  document.querySelector('[data-mrp-movement-rows]').innerHTML = entries.length ? entries.map((movement) => `<tr><td>${mrpDate(movement.movement_date)}</td><td><span class="movement-badge ${movement.movement_type}">${movement.movement_type === 'entrada' ? 'Entrada' : 'Saída'}</span></td><td><strong>${mrpCode(movement.item?.material_number)}</strong></td><td>${mrpEscape(movement.item?.description)}</td><td><strong>${movement.movement_type === 'entrada' ? '+' : '−'} ${mrpNumber(movement.quantity)}</strong></td><td>${mrpEscape(movement.item?.unit_of_measure)}</td><td>${mrpEscape(movement.description)}</td><td>${mrpDate(movement.created_at, true)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty-cell">Nenhuma movimentação registrada.</td></tr>';
}

async function loadMrpData() {
  const [stockResult, movementResult, purchaseRequestResult] = await Promise.all([
    mrpClient.from('mrp_stock_summary').select('*').eq('controls_stock', true).eq('active', true).order('description'),
    mrpClient.from('inventory_movements').select('id,item_id,movement_type,quantity,movement_date,description,created_at,item:items(id,material_number,description,unit_of_measure)').order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
    mrpClient.from('purchase_requests').select('id,request_number,status,created_at,lines:purchase_request_items(item_id),quotes(id),orders:purchase_orders!purchase_orders_purchase_request_id_fkey(order_number,status,created_at)').order('created_at', { ascending: false })
  ]);
  if (stockResult.error) return showMrpNotice(`Não foi possível carregar o estoque: ${stockResult.error.message}`, 'error');
  if (movementResult.error) return showMrpNotice(`Não foi possível carregar as movimentações: ${movementResult.error.message}`, 'error');
  if (purchaseRequestResult.error) return showMrpNotice(`Não foi possível carregar os status de compra: ${purchaseRequestResult.error.message}`, 'error');
  mrpStock = stockResult.data || []; mrpMovements = movementResult.data || []; mrpPurchaseRequests = purchaseRequestResult.data || []; buildProcurementIndex(); renderMaterialOptions(); renderMrpMetrics(); renderStock(); renderMovements();
}

mrpForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(mrpForm); const item = mrpStock.find((entry) => entry.id === form.get('item_id')); if (!item) return showMrpNotice('Selecione um material com controle de estoque.', 'error');
  const { data: { user } } = await mrpClient.auth.getUser(); if (!user) return showMrpNotice('Sua sessão expirou. Entre novamente.', 'error');
  const payload = { item_id: item.id, movement_type: form.get('movement_type'), quantity: Number(form.get('quantity')), movement_date: form.get('movement_date'), description: String(form.get('description') || '').trim(), created_by: user.id };
  const { error } = await mrpClient.from('inventory_movements').insert(payload); if (error) return showMrpNotice(`Movimentação não registrada: ${error.message}`, 'error');
  mrpForm.reset(); mrpForm.elements.movement_date.value = mrpToday(); mrpMaterialFilterField.value = 'all'; mrpMaterialFilterInput.value = ''; showMrpNotice('Movimentação registrada e saldo atualizado.'); await loadMrpData();
});

mrpMaterialFilterField.addEventListener('change', () => { const placeholders = { all: 'Digite o código ou a descrição', code: 'Digite o código do material', description: 'Digite a descrição do material' }; mrpMaterialFilterInput.placeholder = placeholders[mrpMaterialFilterField.value] || placeholders.all; renderMaterialOptions(); }); mrpMaterialFilterInput.addEventListener('input', renderMaterialOptions); mrpItemSelect.addEventListener('change', renderSelectedMaterial);
document.querySelector('[data-mrp-stock-filter]').addEventListener('input', renderStock); document.querySelector('[data-mrp-status-filter]').addEventListener('change', renderStock); document.querySelector('[data-mrp-procurement-filter]').addEventListener('change', renderStock); document.querySelector('[data-mrp-movement-filter]').addEventListener('input', renderMovements);
mrpForm.elements.movement_date.value = mrpToday(); loadMrpData();
