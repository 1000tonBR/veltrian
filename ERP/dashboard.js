const managementClient = window.erpSupabase;
const managementForm = document.querySelector('[data-dashboard-filters]');
const managementNotice = document.querySelector('[data-notice]');
let managementOrders = [];
let managementNoticeTimer;

const managementEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const managementMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const managementNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const managementActivity = (order) => order.request?.activity ? `${order.request.activity.code} · ${order.request.activity.description}` : 'Sem atividade';
const chartColors = ['#20c5c8','#087d83','#46a6d8','#6b7fd7','#9b72cf','#e3905c','#e6bd3b','#57ad7a'];

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

function renderManagementKpis(entries) {
  const gross = entries.reduce((sum, order) => sum + Number(order.gross_value || 0), 0); const saving = entries.reduce((sum, order) => sum + Number(order.discount_value || 0), 0); const net = entries.reduce((sum, order) => sum + Number(order.total_value || 0), 0); const suppliers = new Set(entries.map((order) => order.supplier?.id).filter(Boolean));
  document.querySelector('[data-dashboard-net]').textContent = managementMoney(net); document.querySelector('[data-dashboard-orders]').textContent = `${entries.length} ${entries.length === 1 ? 'pedido' : 'pedidos'}`; document.querySelector('[data-dashboard-saving]').textContent = managementMoney(saving); document.querySelector('[data-dashboard-saving-rate]').textContent = `${managementNumber(gross ? saving / gross * 100 : 0)}% do bruto`; document.querySelector('[data-dashboard-ticket]').textContent = managementMoney(entries.length ? net / entries.length : 0); document.querySelector('[data-dashboard-suppliers]').textContent = suppliers.size;
}

function renderActivityBars(entries) {
  const groups = groupOrders(entries, (order) => order.request?.activity?.id || 'none', managementActivity).sort((a,b) => b.saving - a.saving).slice(0,8); const target = document.querySelector('[data-activity-chart]'); const total = groups.reduce((sum, group) => sum + group.saving, 0); document.querySelector('[data-dashboard-activity-total]').textContent = `${managementMoney(total)} economizados`;
  if (!groups.length || !groups.some((group) => group.saving > 0)) { target.innerHTML = '<div class="chart-empty">Ainda não há descontos no período selecionado.</div>'; return; }
  const max = Math.max(...groups.map((group) => group.saving)); const width = 900; const rowHeight = 42; const height = groups.length * rowHeight + 35; const bars = groups.map((group,index) => { const y = 15 + index * rowHeight; const barWidth = max ? group.saving / max * 560 : 0; return `<text class="chart-axis-label" x="0" y="${y + 17}">${managementEscape(group.label.slice(0,34))}</text><rect class="chart-bar" x="245" y="${y}" width="${barWidth}" height="24" rx="6"></rect><text class="chart-value" x="${Math.min(820, 255 + barWidth)}" y="${y + 17}">${managementEscape(managementMoney(group.saving))}</text>`; }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><title>Saving por atividade</title>${bars}</svg>`;
}

function renderSupplierDonut(entries) {
  const groups = groupOrders(entries, (order) => order.supplier?.id || 'none', (order) => order.supplier?.legal_name || 'Fornecedor removido').sort((a,b) => b.net - a.net).slice(0,8); const total = groups.reduce((sum, group) => sum + group.net, 0); const chart = document.querySelector('[data-supplier-chart]'); const legend = document.querySelector('[data-supplier-legend]');
  if (!total) { chart.style.background = '#edf3f3'; legend.innerHTML = '<div class="chart-empty">Sem compras aprovadas no período.</div>'; return; }
  let cursor = 0; const segments = groups.map((group,index) => { const start = cursor; cursor += group.net / total * 100; return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`; }); chart.style.background = `conic-gradient(${segments.join(',')})`; chart.setAttribute('aria-label', groups.map((group) => `${group.label}: ${managementNumber(group.net / total * 100)}%`).join('; '));
  legend.innerHTML = groups.map((group,index) => `<div><i style="background:${chartColors[index % chartColors.length]}"></i><span>${managementEscape(group.label)}</span><strong>${managementNumber(group.net / total * 100)}%</strong></div>`).join('');
}

function renderDiscountLine(entries) {
  const groups = groupOrders(entries, (order) => String(order.created_at || '').slice(0,7), (order) => String(order.created_at || '').slice(0,7)).filter((group) => group.key).sort((a,b) => a.key.localeCompare(b.key)).slice(-12); const target = document.querySelector('[data-discount-chart]');
  if (!groups.length) { target.innerHTML = '<div class="chart-empty">Sem histórico aprovado para exibir.</div>'; return; }
  const width = 720; const height = 300; const left = 48; const right = 20; const top = 25; const bottom = 48; const max = Math.max(...groups.map((group) => group.saving), 1); const plotWidth = width-left-right; const plotHeight = height-top-bottom; const points = groups.map((group,index) => ({ ...group, x: left + (groups.length === 1 ? plotWidth/2 : index/(groups.length-1)*plotWidth), y: top + plotHeight - group.saving/max*plotHeight })); const line = points.map((point) => `${point.x},${point.y}`).join(' '); const area = `${left},${top+plotHeight} ${line} ${left+plotWidth},${top+plotHeight}`;
  const grid = [0,.25,.5,.75,1].map((ratio) => { const y=top+plotHeight-ratio*plotHeight; return `<line class="chart-grid-line" x1="${left}" y1="${y}" x2="${left+plotWidth}" y2="${y}"></line><text class="chart-axis-label" x="0" y="${y+4}">${managementEscape(managementMoney(max*ratio).replace(/,00$/, ''))}</text>`; }).join(''); const labels = points.map((point) => { const [year,month]=point.key.split('-'); return `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="5"></circle><text class="chart-axis-label" text-anchor="middle" x="${point.x}" y="${height-18}">${month}/${String(year).slice(2)}</text>`; }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><title>Evolução mensal do desconto</title>${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>${labels}</svg>`;
}

function renderManagementDashboard() { const entries = filteredManagementOrders(); renderManagementKpis(entries); renderActivityBars(entries); renderSupplierDonut(entries); renderDiscountLine(entries); }

async function loadManagementData() {
  const { data, error } = await managementClient.from('purchase_orders').select('id,order_number,gross_value,discount_value,total_value,status,created_at,supplier:suppliers!purchase_orders_supplier_id_fkey(id,legal_name),request:purchase_requests!purchase_orders_purchase_request_id_fkey(id,activity:activities(id,code,description))').in('status', ['aprovado','enviado','recebido']).order('created_at');
  if (error) return showManagementNotice(`Não foi possível carregar o Dashboard: ${error.message}`);
  managementOrders = data || []; populateActivityFilter(); renderManagementDashboard();
}

managementForm.addEventListener('input', renderManagementDashboard); managementForm.addEventListener('change', renderManagementDashboard); managementForm.addEventListener('reset', () => setTimeout(renderManagementDashboard)); loadManagementData();
