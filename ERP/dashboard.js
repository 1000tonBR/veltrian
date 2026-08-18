const managementClient = window.erpSupabase;
const managementForm = document.querySelector('[data-dashboard-filters]');
const managementNotice = document.querySelector('[data-notice]');
let managementOrders = [];
let managementDeliveries = [];
let managementCharts = [];
let managementLoaded = false;
let managementNoticeTimer;

const managementEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const managementMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const managementCompactMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
const managementNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const managementDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const managementActivity = (order) => order.request?.activity ? `${order.request.activity.code} · ${order.request.activity.description}` : 'Sem atividade';
const chartColors = ['#14a6a1', '#346fe3', '#22b573', '#f29a38', '#8a5ed1', '#e0526f', '#40a6d9'];

if (window.Chart) {
  Chart.defaults.font.family = 'DM Sans, Arial, sans-serif';
  Chart.defaults.color = '#61787e';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
}

function showManagementNotice(text, type = 'error') {
  clearTimeout(managementNoticeTimer); managementNotice.textContent = text; managementNotice.dataset.type = type; managementNotice.classList.remove('is-visible'); requestAnimationFrame(() => managementNotice.classList.add('is-visible')); managementNoticeTimer = setTimeout(() => managementNotice.classList.remove('is-visible'), 5000);
}

function groupOrders(entries, keyFn, labelFn) {
  const groups = new Map();
  entries.forEach((order) => { const key = keyFn(order); const current = groups.get(key) || { key, label: labelFn(order), gross: 0, saving: 0, net: 0, orders: 0 }; current.gross += Number(order.gross_value || 0); current.saving += Number(order.discount_value || 0); current.net += Number(order.total_value || 0); current.orders += 1; groups.set(key, current); });
  return [...groups.values()];
}

function populateActivityFilter() {
  const activities = new Map(); managementOrders.forEach((order) => { if (order.request?.activity) activities.set(order.request.activity.id, managementActivity(order)); });
  managementForm.elements.activity.innerHTML = `<option value="">Todas as atividades</option>${[...activities].sort((a,b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id,label]) => `<option value="${id}">${managementEscape(label)}</option>`).join('')}`;
}

function filteredManagementOrders() {
  const values = new FormData(managementForm); const start = values.get('date_start'); const end = values.get('date_end'); const activity = values.get('activity');
  return managementOrders.filter((order) => { const date = String(order.created_at || '').slice(0,10); if (start && date < start) return false; if (end && date > end) return false; if (activity && order.request?.activity?.id !== activity) return false; return true; });
}

function matchingDeliveries(entries) {
  const ids = new Set(entries.map((order) => order.id));
  return managementDeliveries.filter((delivery) => ids.has(delivery.purchase_order_id));
}

function renderManagementKpis(entries) {
  const gross = entries.reduce((sum, order) => sum + Number(order.gross_value || 0), 0); const saving = entries.reduce((sum, order) => sum + Number(order.discount_value || 0), 0); const net = entries.reduce((sum, order) => sum + Number(order.total_value || 0), 0); const suppliers = new Set(entries.map((order) => order.supplier?.id).filter(Boolean)); const deliveries = matchingDeliveries(entries); const received = deliveries.filter((delivery) => delivery.status === 'recebido').length; const rate = deliveries.length ? received / deliveries.length * 100 : 0;
  document.querySelector('[data-dashboard-net]').textContent = managementMoney(net); document.querySelector('[data-dashboard-orders]').textContent = `${entries.length} ${entries.length === 1 ? 'pedido' : 'pedidos'}`; document.querySelector('[data-dashboard-saving]').textContent = managementMoney(saving); document.querySelector('[data-dashboard-saving-rate]').textContent = `${managementNumber(gross ? saving / gross * 100 : 0)}% do bruto`; document.querySelector('[data-dashboard-ticket]').textContent = managementMoney(entries.length ? net / entries.length : 0); document.querySelector('[data-dashboard-suppliers]').textContent = suppliers.size; document.querySelector('[data-dashboard-received-rate]').textContent = `${managementNumber(rate)}%`; document.querySelector('[data-dashboard-email-summary]').textContent = `${received} de ${deliveries.length} enviados`;
}

function destroyCharts() { managementCharts.forEach((chart) => chart.destroy()); managementCharts = []; }
function currencyTooltip(context) { return `${context.dataset.label || ''}: ${managementMoney(context.raw)}`; }
function chartOrMessage(canvas, hasData, message) {
  const shell = canvas.parentElement; shell.querySelector('.chart-empty')?.remove(); canvas.hidden = !hasData;
  if (!hasData) shell.insertAdjacentHTML('beforeend', `<p class="chart-empty">${managementEscape(message)}</p>`);
  return Boolean(hasData);
}

function renderMonthlyChart(entries) {
  const canvas = document.querySelector('[data-monthly-chart]'); const groups = groupOrders(entries, (order) => String(order.created_at || '').slice(0,7), (order) => String(order.created_at || '').slice(0,7)).filter((group) => group.key).sort((a,b) => a.key.localeCompare(b.key)).slice(-12);
  if (!chartOrMessage(canvas, groups.length, 'Ainda não há histórico financeiro no período selecionado.')) return;
  managementCharts.push(new Chart(canvas, { type: 'bar', data: { labels: groups.map((group) => { const [year, month] = group.key.split('-'); return `${month}/${String(year).slice(2)}`; }), datasets: [{ label: 'Volume comprado', data: groups.map((group) => group.net), backgroundColor: '#246fdb', borderRadius: 7, maxBarThickness: 42 }, { label: 'Saving', data: groups.map((group) => group.saving), type: 'line', borderColor: '#20b978', backgroundColor: 'rgba(32,185,120,.16)', pointBackgroundColor: '#fff', pointBorderColor: '#20b978', pointBorderWidth: 3, pointRadius: 4, borderWidth: 3, tension: .38, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, border: { display: false }, grid: { color: '#e9efef' }, ticks: { callback: managementCompactMoney } } }, plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: currencyTooltip } } } } }));
}

function renderStatusChart(entries) {
  const canvas = document.querySelector('[data-status-chart]'); const statuses = [{ key: 'aprovado', label: 'Aprovados', color: '#346fe3' }, { key: 'enviado', label: 'Enviados', color: '#f29a38' }, { key: 'recebido', label: 'Recebidos', color: '#22b573' }]; const values = statuses.map((status) => entries.filter((order) => order.status === status.key).length); const total = values.reduce((sum, value) => sum + value, 0); document.querySelector('[data-dashboard-status-total]').textContent = total;
  if (!chartOrMessage(canvas, total, 'Nenhum pedido aprovado no período.')) return;
  managementCharts.push(new Chart(canvas, { type: 'doughnut', data: { labels: statuses.map((status) => status.label), datasets: [{ data: values, backgroundColor: statuses.map((status) => status.color), borderColor: '#fff', borderWidth: 5, hoverOffset: 6 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } } }));
}

function renderSupplierChart(entries) {
  const canvas = document.querySelector('[data-supplier-chart]'); const groups = groupOrders(entries, (order) => order.supplier?.id || 'none', (order) => order.supplier?.legal_name || 'Fornecedor removido').sort((a,b) => b.net - a.net).slice(0,7);
  if (!chartOrMessage(canvas, groups.length && groups.some((group) => group.net > 0), 'Sem compras aprovadas no período.')) return;
  managementCharts.push(new Chart(canvas, { type: 'bar', data: { labels: groups.map((group) => group.label), datasets: [{ label: 'Volume', data: groups.map((group) => group.net), backgroundColor: groups.map((_, index) => chartColors[index % chartColors.length]), borderRadius: 7, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, border: { display: false }, grid: { color: '#eef2f2' }, ticks: { callback: managementCompactMoney } }, y: { border: { display: false }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: currencyTooltip } } } } }));
}

function renderActivityChart(entries) {
  const canvas = document.querySelector('[data-activity-chart]'); const groups = groupOrders(entries, (order) => order.request?.activity?.id || 'none', managementActivity).sort((a,b) => b.saving - a.saving).slice(0,7); const total = groups.reduce((sum, group) => sum + group.saving, 0); document.querySelector('[data-dashboard-activity-total]').textContent = `${managementMoney(total)} economizados`;
  if (!chartOrMessage(canvas, total > 0, 'Ainda não há descontos no período selecionado.')) return;
  managementCharts.push(new Chart(canvas, { type: 'bar', data: { labels: groups.map((group) => group.label), datasets: [{ label: 'Saving', data: groups.map((group) => group.saving), backgroundColor: '#20b978', borderRadius: 7, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, border: { display: false }, grid: { color: '#eef2f2' }, ticks: { callback: managementCompactMoney } }, y: { border: { display: false }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: currencyTooltip } } } } }));
}

function renderEmailTracking(entries) {
  const deliveries = matchingDeliveries(entries).sort((a,b) => new Date(b.sent_at) - new Date(a.sent_at)); const received = deliveries.filter((delivery) => delivery.status === 'recebido').length; const rate = deliveries.length ? received / deliveries.length * 100 : 0;
  document.querySelector('[data-email-received]').textContent = received; document.querySelector('[data-email-sent]').textContent = deliveries.length; document.querySelector('[data-email-progress-bar]').style.width = `${rate}%`;
  const ordersById = new Map(entries.map((order) => [order.id, order])); const target = document.querySelector('[data-delivery-list]');
  target.innerHTML = deliveries.length ? deliveries.slice(0,6).map((delivery) => { const order = ordersById.get(delivery.purchase_order_id); const isReceived = delivery.status === 'recebido'; return `<div class="delivery-item ${isReceived ? 'received' : ''}"><i></i><div><strong>PC-${String(order?.order_number || '').padStart(4,'0')} · ${managementEscape(order?.supplier?.legal_name)}</strong><span>${managementEscape(delivery.recipient_email)}</span></div><div><b>${isReceived ? 'Recebido' : 'Enviado'}</b><time>${managementDate(isReceived ? delivery.received_at : delivery.sent_at)}</time></div></div>`; }).join('') : '<p class="chart-empty">Nenhum pedido foi enviado por e-mail ainda.</p>';
}

function renderManagementDashboard() { const entries = filteredManagementOrders(); destroyCharts(); renderManagementKpis(entries); renderMonthlyChart(entries); renderStatusChart(entries); renderSupplierChart(entries); renderActivityChart(entries); renderEmailTracking(entries); }

async function loadManagementData() {
  if (managementLoaded) return;
  managementLoaded = true;
  const [ordersResult, deliveriesResult] = await Promise.all([
    managementClient.from('purchase_orders').select('id,order_number,gross_value,discount_value,total_value,status,created_at,supplier:suppliers!purchase_orders_supplier_id_fkey(id,legal_name),request:purchase_requests!purchase_orders_purchase_request_id_fkey(id,activity:activities(id,code,description))').in('status', ['aprovado','enviado','recebido']).order('created_at'),
    managementClient.from('order_email_deliveries').select('purchase_order_id,recipient_email,status,sent_at,received_at').order('sent_at', { ascending: false })
  ]);
  if (ordersResult.error) { managementLoaded = false; return showManagementNotice(`Não foi possível carregar o Dashboard: ${ordersResult.error.message}`); }
  if (deliveriesResult.error) { managementLoaded = false; return showManagementNotice(`Não foi possível carregar os envios: ${deliveriesResult.error.message}`); }
  managementOrders = ordersResult.data || []; managementDeliveries = deliveriesResult.data || []; populateActivityFilter(); document.querySelector('[data-dashboard-updated]').textContent = `· atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; renderManagementDashboard();
}

managementForm.addEventListener('input', renderManagementDashboard); managementForm.addEventListener('change', renderManagementDashboard); managementForm.addEventListener('reset', () => setTimeout(renderManagementDashboard));
managementClient.auth.getSession().then(({ data: { session } }) => { if (session) loadManagementData(); });
managementClient.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(loadManagementData); });
