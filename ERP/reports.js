const reportClient = window.erpSupabase;
const reportForm = document.querySelector('[data-report-filters]');
const reportNotice = document.querySelector('[data-notice]');
let reportOrders = [];
let filteredReportOrders = [];
let reportNoticeTimer;

const reportEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const reportMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const reportNumber = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reportDate = (value) => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : '—';
const reportOrderCode = (number) => number ? `PC-${String(number).padStart(4, '0')}` : '—';
const reportRcCode = (number) => number ? `RC-${String(number).padStart(4, '0')}` : '—';
const reportMaterialCode = (number) => number ? `MAT-${String(number).padStart(4, '0')}` : '—';
const personName = (person) => person?.full_name || person?.email || '—';
const orderLines = (order) => order.request?.lines || [];
const orderMaterials = (order) => orderLines(order).map((line) => `${reportMaterialCode(line.item?.material_number)} · ${line.item?.description || 'Material removido'}`).join(', ') || '—';
const orderActivity = (order) => order.request?.activity ? `${order.request.activity.code} · ${order.request.activity.description}` : 'Sem atividade';
const discountRate = (order) => Number(order.gross_value || 0) > 0 ? (Number(order.discount_value || 0) / Number(order.gross_value)) * 100 : 0;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function showReportNotice(text, type = 'success') {
  if (!reportNotice) return;
  clearTimeout(reportNoticeTimer); reportNotice.textContent = text; reportNotice.dataset.type = type; reportNotice.classList.remove('is-visible');
  requestAnimationFrame(() => reportNotice.classList.add('is-visible')); reportNoticeTimer = setTimeout(() => reportNotice.classList.remove('is-visible'), 5000);
}

function uniqueOptions(entries, valueKey, labelKey) {
  const map = new Map();
  entries.forEach((entry) => { const value = typeof valueKey === 'function' ? valueKey(entry) : entry?.[valueKey]; const label = typeof labelKey === 'function' ? labelKey(entry) : entry?.[labelKey]; if (value && label) map.set(String(value), String(label)); });
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

function fillSelect(name, entries) {
  const select = reportForm.elements[name];
  const first = select.options[0].outerHTML;
  select.innerHTML = `${first}${entries.map(([value, label]) => `<option value="${reportEscape(value)}">${reportEscape(label)}</option>`).join('')}`;
}

function populateFilters() {
  fillSelect('activity', uniqueOptions(reportOrders.map((order) => order.request?.activity).filter(Boolean), 'id', (activity) => `${activity.code} · ${activity.description}`));
  fillSelect('supplier', uniqueOptions(reportOrders.map((order) => order.supplier).filter(Boolean), 'id', (supplier) => `${supplier.supplier_number ? `FOR-${String(supplier.supplier_number).padStart(4, '0')} · ` : ''}${supplier.legal_name}`));
  fillSelect('business_sector', uniqueOptions(reportOrders.map((order) => order.supplier).filter(Boolean), 'business_sector', 'business_sector'));
  fillSelect('material', uniqueOptions(reportOrders.flatMap(orderLines).map((line) => line.item).filter(Boolean), 'id', (item) => `${reportMaterialCode(item.material_number)} · ${item.description}`));
  fillSelect('requester', uniqueOptions(reportOrders.map((order) => order.request?.requester).filter(Boolean), 'id', personName));
  fillSelect('buyer', uniqueOptions(reportOrders.map((order) => order.creator).filter(Boolean), 'id', personName));
}

function filterOrders() {
  const values = new FormData(reportForm);
  const search = normalize(values.get('search'));
  const dateStart = values.get('date_start'); const dateEnd = values.get('date_end'); const deliveryEnd = values.get('delivery_end');
  const netMin = values.get('net_min') === '' ? null : Number(values.get('net_min')); const netMax = values.get('net_max') === '' ? null : Number(values.get('net_max'));
  const discountMin = values.get('discount_min') === '' ? null : Number(values.get('discount_min')); const discountPercentMin = values.get('discount_percent_min') === '' ? null : Number(values.get('discount_percent_min'));
  return reportOrders.filter((order) => {
    const created = String(order.created_at || '').slice(0, 10); const delivery = String(order.expected_delivery_date || order.quote?.delivery_date || '').slice(0, 10);
    const searchValues = [reportOrderCode(order.order_number), reportRcCode(order.request?.request_number), orderActivity(order), orderMaterials(order), order.supplier?.legal_name, order.supplier?.business_sector, personName(order.request?.requester), personName(order.creator), order.payment_terms, order.quote?.freight_type, order.status];
    if (search && !searchValues.some((value) => normalize(value).includes(search))) return false;
    if (dateStart && created < dateStart) return false; if (dateEnd && created > dateEnd) return false; if (deliveryEnd && (!delivery || delivery > deliveryEnd)) return false;
    if (values.get('activity') && order.request?.activity?.id !== values.get('activity')) return false;
    if (values.get('supplier') && order.supplier?.id !== values.get('supplier')) return false;
    if (values.get('business_sector') && order.supplier?.business_sector !== values.get('business_sector')) return false;
    if (values.get('material') && !orderLines(order).some((line) => line.item?.id === values.get('material'))) return false;
    if (values.get('requester') && order.request?.requester?.id !== values.get('requester')) return false;
    if (values.get('buyer') && order.creator?.id !== values.get('buyer')) return false;
    if (values.get('priority') && order.request?.priority !== values.get('priority')) return false;
    if (values.get('status') && order.status !== values.get('status')) return false;
    if (values.get('freight') === 'sem_frete' && order.quote?.freight_type) return false;
    if (values.get('freight') && values.get('freight') !== 'sem_frete' && order.quote?.freight_type !== values.get('freight')) return false;
    if (values.get('pdf_status') === 'sent' && !order.sent_at) return false; if (values.get('pdf_status') === 'pending' && order.sent_at) return false;
    if (values.get('payment_terms') && !normalize(order.payment_terms || order.quote?.payment_terms).includes(normalize(values.get('payment_terms')))) return false;
    if (netMin !== null && Number(order.total_value) < netMin) return false; if (netMax !== null && Number(order.total_value) > netMax) return false;
    if (discountMin !== null && Number(order.discount_value || 0) < discountMin) return false; if (discountPercentMin !== null && discountRate(order) < discountPercentMin) return false;
    return true;
  });
}

function summarize(entries, keyFn, labelFn) {
  const groups = new Map();
  entries.forEach((order) => {
    const key = keyFn(order); const current = groups.get(key) || { key, label: labelFn(order), orders: 0, gross: 0, discount: 0, net: 0 };
    current.orders += 1; current.gross += Number(order.gross_value || 0); current.discount += Number(order.discount_value || 0); current.net += Number(order.total_value || 0); groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => b.net - a.net);
}

function periodSummary(entries) {
  return summarize(entries, (order) => String(order.created_at || '').slice(0, 7) || 'Sem data', (order) => {
    const key = String(order.created_at || '').slice(0, 7); if (!key) return 'Sem data'; const [year, month] = key.split('-'); return `${month}/${year}`;
  }).sort((a, b) => b.key.localeCompare(a.key));
}

function renderSummary(entries) {
  const gross = entries.reduce((total, order) => total + Number(order.gross_value || 0), 0); const discount = entries.reduce((total, order) => total + Number(order.discount_value || 0), 0); const net = entries.reduce((total, order) => total + Number(order.total_value || 0), 0);
  document.querySelector('[data-report-count]').textContent = entries.length.toLocaleString('pt-BR'); document.querySelector('[data-report-gross]').textContent = reportMoney(gross); document.querySelector('[data-report-discount]').textContent = reportMoney(discount); document.querySelector('[data-report-net]').textContent = reportMoney(net);
  document.querySelector('[data-report-discount-rate]').textContent = `${reportNumber(gross ? (discount / gross) * 100 : 0)}% do bruto`; document.querySelector('[data-report-average]').textContent = `ticket médio ${reportMoney(entries.length ? net / entries.length : 0)}`; document.querySelector('[data-result-label]').textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
}

function detailRows(entries) {
  return entries.map((order) => ({
    Pedido: reportOrderCode(order.order_number), Data: reportDate(order.created_at), RC: reportRcCode(order.request?.request_number), Atividade: orderActivity(order), Materiais: orderMaterials(order), Fornecedor: order.supplier?.legal_name || '—', Ramo: order.supplier?.business_sector || '—', Solicitante: personName(order.request?.requester), Comprador: personName(order.creator), Bruto: Number(order.gross_value || 0), Desconto: Number(order.discount_value || 0), Líquido: Number(order.total_value || 0), 'Desconto %': discountRate(order), Frete: order.quote?.freight_type || '—', Pagamento: order.payment_terms || order.quote?.payment_terms || '—', Entrega: reportDate(order.expected_delivery_date || order.quote?.delivery_date), Status: String(order.status || '').replaceAll('_', ' '), 'PDF emitido': order.sent_at ? 'Sim' : 'Não'
  }));
}

function renderDetails(entries) {
  const body = document.querySelector('[data-report-details]');
  const statusClasses = { em_aprovacao: 'approval', aprovado: 'approved', reprovado: 'rejected', enviado: 'issued', recebido: 'approved', cancelado: 'cancelled', rascunho: 'pending' };
  body.innerHTML = entries.length ? entries.map((order) => `<tr><td><strong>${reportOrderCode(order.order_number)}</strong></td><td>${reportDate(order.created_at)}</td><td>${reportRcCode(order.request?.request_number)}</td><td>${reportEscape(orderActivity(order))}</td><td>${reportEscape(orderMaterials(order))}</td><td>${reportEscape(order.supplier?.legal_name)}</td><td>${reportEscape(order.supplier?.business_sector)}</td><td>${reportEscape(personName(order.request?.requester))}</td><td>${reportEscape(personName(order.creator))}</td><td>${reportMoney(order.gross_value)}</td><td class="report-saving">${reportMoney(order.discount_value)}</td><td><strong>${reportMoney(order.total_value)}</strong></td><td>${reportEscape(order.quote?.freight_type)}</td><td>${reportEscape(order.payment_terms || order.quote?.payment_terms)}</td><td>${reportDate(order.expected_delivery_date || order.quote?.delivery_date)}</td><td><span class="status ${statusClasses[order.status] || 'pending'}">${reportEscape(String(order.status || '').replaceAll('_', ' '))}</span></td></tr>`).join('') : '<tr><td colspan="16" class="empty-cell">Nenhum pedido corresponde aos filtros selecionados.</td></tr>';
}

function renderGroups(entries) {
  const activities = summarize(entries, (order) => order.request?.activity?.id || 'none', orderActivity);
  const suppliers = summarize(entries, (order) => order.supplier?.id || 'none', (order) => order.supplier?.legal_name || 'Fornecedor removido');
  const periods = periodSummary(entries); const totalNet = entries.reduce((total, order) => total + Number(order.total_value || 0), 0);
  document.querySelector('[data-report-activities]').innerHTML = activities.length ? activities.map((group) => `<tr><td>${reportEscape(group.label)}</td><td>${group.orders}</td><td>${reportMoney(group.gross)}</td><td class="report-saving">${reportMoney(group.discount)}</td><td><strong>${reportMoney(group.net)}</strong></td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Sem dados.</td></tr>';
  document.querySelector('[data-report-suppliers]').innerHTML = suppliers.length ? suppliers.map((group) => `<tr><td>${reportEscape(group.label)}</td><td>${group.orders}</td><td><strong>${reportMoney(group.net)}</strong></td><td>${reportNumber(totalNet ? (group.net / totalNet) * 100 : 0)}%</td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Sem dados.</td></tr>';
  document.querySelector('[data-report-discounts]').innerHTML = suppliers.length ? suppliers.map((group) => `<tr><td>${reportEscape(group.label)}</td><td>${reportMoney(group.gross)}</td><td class="report-saving"><strong>${reportMoney(group.discount)}</strong></td><td>${reportNumber(group.gross ? (group.discount / group.gross) * 100 : 0)}%</td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Sem dados.</td></tr>';
  document.querySelector('[data-report-periods]').innerHTML = periods.length ? periods.map((group) => `<tr><td>${group.label}</td><td>${group.orders}</td><td class="report-saving">${reportMoney(group.discount)}</td><td><strong>${reportMoney(group.net)}</strong></td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Sem dados.</td></tr>';
}

function applyFilters() { filteredReportOrders = filterOrders(); renderSummary(filteredReportOrders); renderDetails(filteredReportOrders); renderGroups(filteredReportOrders); }

function sheetFromRows(rows, widths = []) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: 'Nenhum registro corresponde aos filtros.' }]);
  if (widths.length) sheet['!cols'] = widths.map((wch) => ({ wch })); return sheet;
}

function exportReport() {
  if (!window.XLSX) return showReportNotice('O gerador do Excel não foi carregado. Verifique sua conexão.', 'error');
  const values = new FormData(reportForm); const gross = filteredReportOrders.reduce((sum, order) => sum + Number(order.gross_value || 0), 0); const discount = filteredReportOrders.reduce((sum, order) => sum + Number(order.discount_value || 0), 0); const net = filteredReportOrders.reduce((sum, order) => sum + Number(order.total_value || 0), 0);
  const activeFilters = [...values.entries()].filter(([, value]) => value !== '').map(([key, value]) => ({ Filtro: key, Valor: value }));
  const summaryRows = [{ Indicador: 'Gerado em', Valor: new Date().toLocaleString('pt-BR') }, { Indicador: 'Pedidos', Valor: filteredReportOrders.length }, { Indicador: 'Custo bruto', Valor: gross }, { Indicador: 'Desconto obtido', Valor: discount }, { Indicador: 'Custo líquido', Valor: net }, { Indicador: 'Desconto percentual', Valor: gross ? (discount / gross) * 100 : 0 }, ...activeFilters.map((filter) => ({ Indicador: `Filtro: ${filter.Filtro}`, Valor: filter.Valor }))];
  const activities = summarize(filteredReportOrders, (order) => order.request?.activity?.id || 'none', orderActivity).map((group) => ({ Atividade: group.label, Pedidos: group.orders, Bruto: group.gross, Desconto: group.discount, Líquido: group.net }));
  const suppliers = summarize(filteredReportOrders, (order) => order.supplier?.id || 'none', (order) => order.supplier?.legal_name || 'Fornecedor removido'); const totalNet = suppliers.reduce((sum, group) => sum + group.net, 0);
  const supplierRows = suppliers.map((group) => ({ Fornecedor: group.label, Pedidos: group.orders, Comprado: group.net, 'Participação %': totalNet ? (group.net / totalNet) * 100 : 0 }));
  const discountRows = suppliers.map((group) => ({ Fornecedor: group.label, Bruto: group.gross, Desconto: group.discount, 'Desconto %': group.gross ? (group.discount / group.gross) * 100 : 0 }));
  const periodRows = periodSummary(filteredReportOrders).map((group) => ({ Período: group.label, Pedidos: group.orders, Bruto: group.gross, Desconto: group.discount, Líquido: group.net }));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheetFromRows(summaryRows, [28, 25]), 'Resumo'); XLSX.utils.book_append_sheet(workbook, sheetFromRows(detailRows(filteredReportOrders), [13, 12, 13, 28, 42, 28, 22, 24, 24, 15, 15, 15, 14, 12, 24, 14, 15, 13]), 'Pedidos'); XLSX.utils.book_append_sheet(workbook, sheetFromRows(activities, [35, 12, 16, 16, 16]), 'Por Atividade'); XLSX.utils.book_append_sheet(workbook, sheetFromRows(supplierRows, [35, 12, 18, 16]), 'Por Fornecedor'); XLSX.utils.book_append_sheet(workbook, sheetFromRows(discountRows, [35, 18, 18, 16]), 'Descontos'); XLSX.utils.book_append_sheet(workbook, sheetFromRows(periodRows, [15, 12, 18, 18, 18]), 'Por Período');
  XLSX.writeFile(workbook, `veltrian-relatorios-${new Date().toISOString().slice(0, 10)}.xlsx`); showReportNotice('Relatório exportado para Excel com sucesso.');
}

async function loadReportData() {
  const { data, error } = await reportClient.from('purchase_orders').select('id,order_number,quote_id,purchase_request_id,gross_value,discount_value,total_value,status,payment_terms,expected_delivery_date,selection_reason,sent_at,created_at,supplier:suppliers!purchase_orders_supplier_id_fkey(id,supplier_number,legal_name,business_sector),quote:quotes!purchase_orders_quote_id_fkey(id,freight_type,delivery_date,payment_terms),creator:profiles!purchase_orders_created_by_fkey(id,full_name,email),request:purchase_requests!purchase_orders_purchase_request_id_fkey(id,request_number,priority,status,requester:profiles!purchase_requests_requested_by_fkey(id,full_name,email),activity:activities(id,code,description),lines:purchase_request_items(quantity,item:items(id,material_number,description,manufacturer)))').order('created_at', { ascending: false });
  if (error) return showReportNotice(`Não foi possível carregar os relatórios: ${error.message}`, 'error');
  reportOrders = data || []; populateFilters(); applyFilters();
}

reportForm.addEventListener('input', applyFilters); reportForm.addEventListener('change', applyFilters); reportForm.addEventListener('reset', () => setTimeout(applyFilters)); document.querySelector('[data-export-report]').addEventListener('click', exportReport);
loadReportData();
