const moduleClient = window.erpSupabase;
const moduleNotice = document.querySelector('[data-notice]');
const rcForm = document.querySelector('[data-rc-form]');
const activityForm = document.querySelector('[data-activity-form]');
const rcCancel = document.querySelector('[data-cancel-rc]');
const activityCancel = document.querySelector('[data-cancel-activity]');
const materialSelect = document.querySelector('[data-rc-item]');
const materialFilterInput = document.querySelector('[data-material-filter]');
const materialFilterField = document.querySelector('[data-material-filter-field]');
const materialResultCount = document.querySelector('[data-material-result-count]');
let materials = [];
let activities = [];
let requests = [];
let noticeTimer;

const escapeHtml = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const rcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const materialCode = (number) => number ? `MAT-${String(number).padStart(4, '0')}` : '—';
const orderCode = (number) => number ? `PC-${String(number).padStart(4, '0')}` : '—';
const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

const materialFilterPlaceholders = {
  all: 'Digite código, descrição, fabricante ou nº de série',
  code: 'Digite o código do material',
  description: 'Digite parte da descrição',
  manufacturer: 'Digite o fabricante',
  serial: 'Digite o número de série'
};

function materialFields(material) {
  const code = materialCode(material.material_number);
  return {
    code: [code, code.replace(/-/g, ''), material.material_number],
    description: [material.description],
    manufacturer: [material.manufacturer],
    serial: [material.serial_number],
    all: [code, code.replace(/-/g, ''), material.material_number, material.description, material.manufacturer, material.serial_number]
  };
}

function materialOptionLabel(material) {
  const details = [material.manufacturer, material.serial_number].filter(Boolean).map(escapeHtml).join(' · ');
  return `${escapeHtml(materialCode(material.material_number))} · ${escapeHtml(material.description)}${details ? ` — ${details}` : ''}`;
}

function renderMaterialOptions(entries = materials, selectedId = materialSelect?.value || '') {
  if (!materialSelect) return;
  const selectedMaterial = selectedId && materials.find((material) => String(material.id) === String(selectedId));
  const visibleEntries = selectedMaterial && !entries.some((material) => String(material.id) === String(selectedId))
    ? [selectedMaterial, ...entries]
    : entries;
  materialSelect.innerHTML = `<option value="">${entries.length ? 'Selecione um material' : 'Nenhum material encontrado'}</option>${visibleEntries.map((material) => `<option value="${escapeHtml(material.id)}">${materialOptionLabel(material)}</option>`).join('')}`;
  if (selectedMaterial) materialSelect.value = selectedMaterial.id;
  if (materialResultCount) {
    materialResultCount.textContent = entries.length === 1 ? '1 material encontrado' : `${entries.length} materiais encontrados`;
    materialResultCount.dataset.empty = String(entries.length === 0);
  }
}

function applyMaterialFilter() {
  const term = normalizeSearch(materialFilterInput?.value);
  const field = materialFilterField?.value || 'all';
  const filtered = term
    ? materials.filter((material) => materialFields(material)[field].some((value) => normalizeSearch(value).includes(term)))
    : materials;
  renderMaterialOptions(filtered);
}

function showNotice(text, type = 'success') {
  if (!moduleNotice) return;
  window.clearTimeout(noticeTimer);
  moduleNotice.textContent = text;
  moduleNotice.dataset.type = type;
  moduleNotice.classList.remove('is-visible');
  requestAnimationFrame(() => moduleNotice.classList.add('is-visible'));
  noticeTimer = window.setTimeout(() => moduleNotice.classList.remove('is-visible'), 5000);
}

function refreshAfterSuccess(text) {
  showNotice(text);
  window.setTimeout(() => window.location.reload(), 1500);
}

function activateTab(name) {
  document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === name));
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  sessionStorage.setItem('veltrian-rc-tab', name);
}

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
activateTab(sessionStorage.getItem('veltrian-rc-tab') || 'rcs');

function setRows(selector, rows, empty, render, colspan = 10) {
  const body = document.querySelector(selector);
  if (!body) return;
  body.innerHTML = rows.length ? rows.map(render).join('') : `<tr><td colspan="${colspan}" class="empty-cell">${empty}</td></tr>`;
}

function renderActivities(entries = activities) {
  setRows('[data-activities-rows]', entries, 'Nenhuma atividade cadastrada.', (activity) => `<tr><td>${escapeHtml(activity.code)}</td><td>${escapeHtml(activity.description)}</td><td>${formatDate(activity.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-edit-activity="${activity.id}">Editar</button><button type="button" class="row-button danger" data-delete-activity="${activity.id}">Excluir</button></td></tr>`, 4);
}

function renderRequests(entries = requests) {
  setRows('[data-requests-rows]', entries, 'Nenhuma requisição criada até o momento.', (rc) => {
    const line = rc.lines?.[0];
    const material = line?.item?.description || 'Material removido';
    const requester = rc.requester?.full_name || rc.requester?.email || 'Usuário removido';
    const activity = rc.activity ? `${rc.activity.code} · ${rc.activity.description}` : '—';
    const order = [...(rc.orders || [])].sort((a, b) => Number(b.order_number) - Number(a.order_number))[0];
    const statuses = { rascunho: '<span class="status pending">Pedido em preparação</span>', em_aprovacao: '<span class="status approval">Em aprovação</span>', aprovado: '<span class="status approved">Pedido aprovado</span>', reprovado: '<span class="status rejected">Pedido rejeitado</span>', enviado: '<span class="status issued">Pedido emitido</span>', recebido: '<span class="status issued">Pedido recebido</span>', cancelado: '<span class="status cancelled">Pedido cancelado</span>' };
    const workflowStatus = order ? statuses[order.status] || `<span class="status pending">${escapeHtml(order.status)}</span>` : '<span class="status pending">Sem pedido emitido</span>';
    const completed = order && ['aprovado','enviado','recebido'].includes(order.status);
    return `<tr class="${completed ? 'order-issued-row' : ''}"><td>${rcCode(rc.request_number)}</td><td><strong>${orderCode(order?.order_number)}</strong></td><td>${materialCode(line?.item?.material_number)}</td><td>${escapeHtml(material)}</td><td>${escapeHtml(line?.quantity)}</td><td><span class="priority ${escapeHtml(rc.priority)}">${escapeHtml(rc.priority)}</span></td><td>${escapeHtml(activity)}</td><td>${escapeHtml(requester)}</td><td>${workflowStatus}</td><td>${formatDate(rc.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-edit-rc="${rc.id}">Editar</button><button type="button" class="row-button danger" data-delete-rc="${rc.id}">Excluir</button></td></tr>`;
  }, 11);
}

async function loadMaterials() {
  const { data, error } = await moduleClient.from('items').select('*').eq('active', true).order('description');
  if (error) return showNotice(`Não foi possível carregar os materiais: ${error.message}`, 'error');
  materials = data || [];
  renderMaterialOptions();
}

async function loadActivities() {
  const { data, error } = await moduleClient.from('activities').select('*').eq('active', true).order('code');
  if (error) return showNotice(`Não foi possível carregar as atividades: ${error.message}`, 'error');
  activities = data || [];
  renderActivities();
  const select = document.querySelector('[data-rc-activity]');
  if (select) select.innerHTML = `<option value="">Sem atividade vinculada</option>${activities.map((activity) => `<option value="${activity.id}">${escapeHtml(activity.code)} · ${escapeHtml(activity.description)}</option>`).join('')}`;
}

async function loadRequests() {
  const { data, error } = await moduleClient.from('purchase_requests').select('id, request_number, title, description, priority, status, activity_id, requested_by, created_at, requester:profiles!purchase_requests_requested_by_fkey(full_name,email), activity:activities(code,description), lines:purchase_request_items(id,item_id,quantity,notes,item:items(id,description,material_number)), orders:purchase_orders!purchase_orders_purchase_request_id_fkey(order_number,status,created_at)').order('created_at', { ascending: false });
  if (error) return showNotice(`Não foi possível carregar as requisições: ${error.message}`, 'error');
  requests = data || [];
  renderRequests();
}

function resetActivityForm() {
  activityForm.reset(); activityForm.elements.record_id.value = '';
  document.querySelector('[data-activity-kicker]').textContent = 'Nova atividade';
  document.querySelector('[data-save-activity]').textContent = 'Salvar atividade';
  activityCancel.hidden = true;
}

function editActivity(id) {
  const activity = activities.find((entry) => entry.id === id); if (!activity) return;
  activityForm.elements.record_id.value = activity.id; activityForm.elements.code.value = activity.code; activityForm.elements.description.value = activity.description;
  document.querySelector('[data-activity-kicker]').textContent = 'Edição de atividade';
  document.querySelector('[data-save-activity]').textContent = 'Salvar alterações'; activityCancel.hidden = false;
  activityForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteActivity(id) {
  const activity = activities.find((entry) => entry.id === id);
  if (!confirm(`Excluir a atividade “${activity?.code || ''}”?`)) return;
  const { error } = await moduleClient.from('activities').delete().eq('id', id);
  if (error) return showNotice(`Atividade não excluída: ${error.message}`, 'error');
  refreshAfterSuccess('Atividade excluída com sucesso. Atualizando os dados…');
}

function resetRcForm() {
  rcForm.reset(); rcForm.elements.record_id.value = ''; rcForm.elements.line_id.value = '';
  if (materialFilterInput) materialFilterInput.value = '';
  if (materialFilterField) materialFilterField.value = 'all';
  if (materialFilterInput) materialFilterInput.placeholder = materialFilterPlaceholders.all;
  renderMaterialOptions(materials, '');
  document.querySelector('[data-rc-kicker]').textContent = 'Nova requisição'; document.querySelector('[data-rc-title]').textContent = 'Criar requisição';
  document.querySelector('[data-save-rc]').textContent = 'Salvar requisição'; rcCancel.hidden = true;
}

function editRequest(id) {
  const rc = requests.find((entry) => entry.id === id); if (!rc) return;
  const line = rc.lines?.[0];
  if (materialFilterInput) materialFilterInput.value = '';
  if (materialFilterField) materialFilterField.value = 'all';
  if (materialFilterInput) materialFilterInput.placeholder = materialFilterPlaceholders.all;
  renderMaterialOptions(materials, line?.item_id || '');
  rcForm.elements.record_id.value = rc.id; rcForm.elements.line_id.value = line?.id || ''; rcForm.elements.item_id.value = line?.item_id || '';
  rcForm.elements.quantity.value = line?.quantity || ''; rcForm.elements.priority.value = rc.priority || 'normal'; rcForm.elements.activity_id.value = rc.activity_id || ''; rcForm.elements.notes.value = line?.notes || rc.description || '';
  document.querySelector('[data-rc-kicker]').textContent = `Edição da ${rcCode(rc.request_number)}`; document.querySelector('[data-rc-title]').textContent = 'Editar requisição';
  document.querySelector('[data-save-rc]').textContent = 'Salvar alterações'; rcCancel.hidden = false;
  rcForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteRequest(id) {
  const rc = requests.find((entry) => entry.id === id);
  if (!confirm(`Excluir a ${rcCode(rc?.request_number || '')}? Cotações vinculadas também serão removidas.`)) return;
  const { error } = await moduleClient.from('purchase_requests').delete().eq('id', id);
  if (error) return showNotice(`Requisição não excluída: ${error.message}`, 'error');
  refreshAfterSuccess('Requisição excluída com sucesso. Atualizando os dados…');
}

activityForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(activityForm); const id = values.get('record_id');
  const payload = { code: String(values.get('code')).trim().toUpperCase(), description: String(values.get('description')).trim() };
  const query = id ? moduleClient.from('activities').update(payload).eq('id', id) : moduleClient.from('activities').insert(payload);
  const { error } = await query;
  if (error) return showNotice(`Atividade não salva: ${error.message}`, 'error');
  resetActivityForm(); refreshAfterSuccess(id ? 'Atividade atualizada com sucesso. Atualizando os dados…' : 'Atividade salva com sucesso. Atualizando os dados…');
});

rcForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(rcForm); const id = values.get('record_id'); const lineId = values.get('line_id');
  const { data: { user } } = await moduleClient.auth.getUser();
  if (!user) return showNotice('Sua sessão expirou. Entre novamente.', 'error');
  const material = materials.find((entry) => entry.id === values.get('item_id'));
  const requestPayload = { title: material?.description || 'Requisição de compra', description: values.get('notes') || null, category: 'Compras', estimated_value: 0, requested_by: user.id, priority: values.get('priority'), activity_id: values.get('activity_id') || null };
  let requestId = id;
  if (id) {
    const { error } = await moduleClient.from('purchase_requests').update(requestPayload).eq('id', id);
    if (error) return showNotice(`Requisição não atualizada: ${error.message}`, 'error');
  } else {
    const { data, error } = await moduleClient.from('purchase_requests').insert(requestPayload).select('id').single();
    if (error) return showNotice(`Requisição não criada: ${error.message}`, 'error');
    requestId = data.id;
  }
  const linePayload = { purchase_request_id: requestId, item_id: values.get('item_id'), quantity: Number(values.get('quantity')), notes: values.get('notes') || null };
  const lineQuery = lineId ? moduleClient.from('purchase_request_items').update(linePayload).eq('id', lineId) : moduleClient.from('purchase_request_items').insert(linePayload);
  const { error: lineError } = await lineQuery;
  if (lineError) return showNotice(`A requisição foi salva, mas o material não foi vinculado: ${lineError.message}`, 'error');
  resetRcForm(); refreshAfterSuccess(id ? 'Requisição atualizada com sucesso. Atualizando os dados…' : 'Requisição salva com sucesso. Atualizando os dados…');
});

document.querySelector('[data-activities-rows]')?.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-activity]'); const remove = event.target.closest('[data-delete-activity]');
  if (edit) editActivity(edit.dataset.editActivity); if (remove) deleteActivity(remove.dataset.deleteActivity);
});
document.querySelector('[data-requests-rows]')?.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-rc]'); const remove = event.target.closest('[data-delete-rc]');
  if (edit) editRequest(edit.dataset.editRc); if (remove) deleteRequest(remove.dataset.deleteRc);
});
rcCancel?.addEventListener('click', resetRcForm); activityCancel?.addEventListener('click', resetActivityForm);

materialFilterInput?.addEventListener('input', applyMaterialFilter);
materialFilterField?.addEventListener('change', () => {
  materialFilterInput.placeholder = materialFilterPlaceholders[materialFilterField.value];
  applyMaterialFilter();
});

const rcFilterInput = document.querySelector('[data-rc-filter]');
const rcFilterField = document.querySelector('[data-rc-filter-field]');
const rcFilterPlaceholders = { all: 'Digite para pesquisar nas requisições', material: 'Digite a descrição do material', rc: 'Digite o número da RC', requester: 'Digite o nome do requisitante' };

function applyRcFilter() {
  const term = rcFilterInput?.value.trim().toLocaleLowerCase('pt-BR') || '';
  const field = rcFilterField?.value || 'all';
  const fieldsFor = (rc) => ({
    rc: [rcCode(rc.request_number), rc.request_number],
    material: [rc.lines?.[0]?.item?.description],
    requester: [rc.requester?.full_name, rc.requester?.email],
    all: [rcCode(rc.request_number), rc.request_number, ...((rc.orders || []).flatMap((order) => [orderCode(order.order_number), order.order_number, order.status])), materialCode(rc.lines?.[0]?.item?.material_number), rc.lines?.[0]?.item?.material_number, rc.lines?.[0]?.item?.description, rc.activity?.code, rc.activity?.description, rc.requester?.full_name, rc.requester?.email]
  });
  renderRequests(requests.filter((rc) => fieldsFor(rc)[field].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
}

rcFilterInput?.addEventListener('input', applyRcFilter);
rcFilterField?.addEventListener('change', () => {
  rcFilterInput.placeholder = rcFilterPlaceholders[rcFilterField.value];
  applyRcFilter();
});
document.querySelector('[data-activity-filter]')?.addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderActivities(activities.filter((activity) => [activity.code, activity.description].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
});

Promise.all([loadMaterials(), loadActivities()]).then(loadRequests);
