const moduleClient = window.erpSupabase;
const notice = document.querySelector('[data-notice]');
const showNotice = (text, type = 'success') => {
  if (!notice) return;
  notice.textContent = text;
  notice.dataset.type = type;
};

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
}));

const setRows = (selector, rows, empty, render) => {
  const body = document.querySelector(selector);
  if (!body) return;
  body.innerHTML = rows.length ? rows.map(render).join('') : `<tr><td colspan="10" class="empty-cell">${empty}</td></tr>`;
};

let items = [];
let activities = [];

async function loadItems() {
  const { data, error } = await moduleClient.from('items').select('*').order('description');
  if (error) return showNotice(`Não foi possível carregar os itens: ${error.message}`, 'error');
  items = data || [];
  setRows('[data-items-rows]', items, 'Nenhum item cadastrado.', (item) => `<tr><td>${item.description}</td><td>${item.default_quantity ?? '—'}</td><td>${item.manufacturer || '—'}</td><td>${item.serial_number || '—'}</td><td>${item.notes || '—'}</td></tr>`);
  const select = document.querySelector('[data-rc-item]');
  if (select) select.innerHTML = `<option value="">Selecione um item</option>${items.map((item) => `<option value="${item.id}">${item.description}</option>`).join('')}`;
}

async function loadActivities() {
  const { data, error } = await moduleClient.from('activities').select('*').eq('active', true).order('code');
  if (error) return showNotice(`Não foi possível carregar as atividades: ${error.message}`, 'error');
  activities = data || [];
  setRows('[data-activities-rows]', activities, 'Nenhuma atividade cadastrada.', (activity) => `<tr><td>${activity.code}</td><td>${activity.description}</td></tr>`);
  const select = document.querySelector('[data-rc-activity]');
  if (select) select.innerHTML = `<option value="">Selecione uma atividade</option>${activities.map((activity) => `<option value="${activity.id}">${activity.code} · ${activity.description}</option>`).join('')}`;
}

async function loadRequests() {
  const { data, error } = await moduleClient.from('purchase_requests').select('id, request_number, priority, status, activity:activities(code,description), lines:purchase_request_items(quantity,item:items(description))').order('created_at', { ascending: false });
  if (error) return showNotice(`Não foi possível carregar as RCs: ${error.message}`, 'error');
  setRows('[data-requests-rows]', data || [], 'Nenhuma RC criada até o momento.', (rc) => {
    const lines = rc.lines || [];
    const item = lines.map((line) => line.item?.description || 'Item removido').join(', ') || '—';
    const quantity = lines.map((line) => line.quantity).join(', ') || '—';
    const activity = rc.activity ? `${rc.activity.code} · ${rc.activity.description}` : '—';
    const status = String(rc.status || '').replaceAll('_', ' ');
    return `<tr><td>RC-${String(rc.request_number).padStart(4, '0')}</td><td>${item}</td><td>${quantity}</td><td><span class="priority ${rc.priority}">${rc.priority}</span></td><td>${activity}</td><td class="status-cell">${status}</td></tr>`;
  });
}

document.querySelector('[data-item-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = { description: form.get('description'), default_quantity: Number(form.get('quantity')) || null, manufacturer: form.get('manufacturer') || null, serial_number: form.get('serial_number') || null, notes: form.get('notes') || null };
  const { error } = await moduleClient.from('items').insert(payload);
  if (error) return showNotice(`Item não salvo: ${error.message}`, 'error');
  event.currentTarget.reset(); showNotice('Item cadastrado com sucesso.'); loadItems();
});

document.querySelector('[data-activity-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const { error } = await moduleClient.from('activities').insert({ code: String(form.get('code')).trim().toUpperCase(), description: form.get('description') });
  if (error) return showNotice(`Atividade não salva: ${error.message}`, 'error');
  event.currentTarget.reset(); showNotice('Atividade cadastrada com sucesso.'); loadActivities();
});

document.querySelector('[data-rc-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const { data: { user } } = await moduleClient.auth.getUser();
  if (!user) return showNotice('Sua sessão expirou. Entre novamente.', 'error');
  const item = items.find((entry) => entry.id === form.get('item_id'));
  const { data: rc, error } = await moduleClient.from('purchase_requests').insert({ title: item?.description || 'Requisição de compra', description: form.get('notes') || null, category: 'Compras', estimated_value: 0, requested_by: user.id, priority: form.get('priority'), activity_id: form.get('activity_id') || null }).select('id').single();
  if (error) return showNotice(`RC não criada: ${error.message}`, 'error');
  const { error: lineError } = await moduleClient.from('purchase_request_items').insert({ purchase_request_id: rc.id, item_id: form.get('item_id'), quantity: Number(form.get('quantity')), notes: form.get('notes') || null });
  if (lineError) return showNotice(`A RC foi criada, mas o item não foi vinculado: ${lineError.message}`, 'error');
  event.currentTarget.reset(); showNotice('RC criada com sucesso.'); loadRequests();
});

Promise.all([loadItems(), loadActivities()]).then(loadRequests);
