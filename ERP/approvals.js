const approvalClient = window.erpSupabase;
const approvalNotice = document.querySelector('[data-notice]');
const approvalDialog = document.querySelector('[data-approval-dialog]');
const approvalStatusFilter = document.querySelector('[data-approval-status]');
const approvalTextFilter = document.querySelector('[data-approval-filter]');
let approvalOrders = [];
let activeApprovalOrder = null;
let approvalProfile = null;
let approvalNoticeTimer;

const approvalEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const approvalMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const approvalDate = (value, includeTime = true) => value ? new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(`${value}${String(value).includes('T') ? '' : 'T12:00:00'}`)) : '—';
const approvalOrderCode = (number) => `PC-${String(number).padStart(4, '0')}`;
const approvalRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const approvalPerson = (person) => person?.full_name || person?.email || '—';
const approvalMaterial = (request) => request?.lines?.map((line) => `${line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')} · ` : ''}${line.item?.description || ''}`).filter(Boolean).join(', ') || '—';
const canApprove = () => ['administrador', 'aprovador'].includes(approvalProfile?.role);

function showApprovalNotice(text, type = 'success') {
  clearTimeout(approvalNoticeTimer); approvalNotice.textContent = text; approvalNotice.dataset.type = type; approvalNotice.classList.remove('is-visible');
  requestAnimationFrame(() => approvalNotice.classList.add('is-visible')); approvalNoticeTimer = setTimeout(() => approvalNotice.classList.remove('is-visible'), 5000);
}

function approvalStatus(status) {
  const labels = { em_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado', reprovado: 'Rejeitado', enviado: 'PDF emitido', recebido: 'Recebido', cancelado: 'Cancelado', rascunho: 'Rascunho' };
  const classes = { em_aprovacao: 'awaiting', aprovado: 'pdf-ready', reprovado: 'rejected', enviado: 'issued', recebido: 'approved', cancelado: 'cancelled', rascunho: 'pending' };
  return `<span class="status ${classes[status] || 'pending'}">${labels[status] || approvalEscape(status)}</span>`;
}

function filteredApprovalOrders() {
  const status = approvalStatusFilter.value; const term = approvalTextFilter.value.trim().toLocaleLowerCase('pt-BR');
  return approvalOrders.filter((order) => {
    if (status && order.status !== status) return false;
    const values = [approvalOrderCode(order.order_number), approvalRcCode(order.request?.request_number), order.supplier?.legal_name, approvalMaterial(order.request), approvalPerson(order.request?.requester), approvalPerson(order.creator)];
    return values.some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
  });
}

function renderApprovalOrders() {
  const entries = filteredApprovalOrders(); const body = document.querySelector('[data-approvals-rows]');
  body.innerHTML = entries.length ? entries.map((order) => `<tr><td><strong>${approvalOrderCode(order.order_number)}</strong></td><td>${approvalRcCode(order.request?.request_number)}</td><td>${approvalEscape(order.supplier?.legal_name)}</td><td>${approvalEscape(approvalMaterial(order.request))}</td><td><strong>${approvalMoney(order.total_value)}</strong></td><td>${approvalEscape(approvalPerson(order.request?.requester))}</td><td>${approvalEscape(approvalPerson(order.creator))}</td><td>${approvalStatus(order.status)}</td><td>${approvalDate(order.created_at)}</td><td><button type="button" class="row-button" data-review-order="${order.id}">${order.status === 'em_aprovacao' ? 'Analisar' : 'Ver detalhes'}</button></td></tr>`).join('') : '<tr><td colspan="10" class="empty-cell">Nenhum pedido corresponde ao filtro.</td></tr>';
}

function renderApprovalMetrics() {
  document.querySelector('[data-approval-pending]').textContent = approvalOrders.filter((order) => order.status === 'em_aprovacao').length;
  document.querySelector('[data-approval-approved]').textContent = approvalOrders.filter((order) => ['aprovado', 'enviado', 'recebido'].includes(order.status)).length;
  document.querySelector('[data-approval-rejected]').textContent = approvalOrders.filter((order) => order.status === 'reprovado').length;
}

function openApprovalDialog(id) {
  const order = approvalOrders.find((entry) => entry.id === id); if (!order) return;
  activeApprovalOrder = order; const request = order.request || {}; const quotes = [...(request.quotes || [])].sort((a, b) => Number(a.net_value) - Number(b.net_value)); const lastDecision = [...(order.approvals || [])].sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0];
  document.querySelector('[data-approval-title]').textContent = `${approvalOrderCode(order.order_number)} · ${approvalRcCode(request.request_number)}`;
  document.querySelector('[data-approval-detail-summary]').innerHTML = `<div class="approval-detail-grid"><span>Material<strong>${approvalEscape(approvalMaterial(request))}</strong></span><span>Atividade<strong>${approvalEscape(request.activity ? `${request.activity.code} · ${request.activity.description}` : '—')}</strong></span><span>Solicitante<strong>${approvalEscape(approvalPerson(request.requester))}</strong></span><span>Fornecedor escolhido<strong>${approvalEscape(order.supplier?.legal_name)}</strong></span><span>Valor líquido<strong>${approvalMoney(order.total_value)}</strong></span><span>Situação<strong>${approvalStatus(order.status)}</strong></span></div>`;
  document.querySelector('[data-approval-quotes]').innerHTML = quotes.length ? quotes.map((quote, index) => `<article class="approval-quote ${quote.id === order.quote_id ? 'selected' : ''}"><span>${quote.id === order.quote_id ? 'Escolhida' : index === 0 ? 'Menor preço' : `Opção ${index + 1}`}</span><strong>${approvalEscape(quote.supplier?.legal_name)}</strong><b>${approvalMoney(quote.net_value)}</b><small>Bruto: ${approvalMoney(quote.quoted_value)} · Desconto: ${approvalMoney(quote.discount_value)} · Entrega: ${approvalDate(quote.delivery_date, false)} · Frete: ${approvalEscape(quote.freight_type)} · Pagamento: ${approvalEscape(quote.payment_terms)}</small></article>`).join('') : '<p>Nenhuma cotação vinculada.</p>';
  const reasonSection = document.querySelector('[data-approval-reason-section]'); reasonSection.hidden = !order.selection_reason; document.querySelector('[data-approval-selection-reason]').textContent = order.selection_reason || '';
  const historySection = document.querySelector('[data-approval-history-section]'); historySection.hidden = !lastDecision; document.querySelector('[data-approval-history-title]').textContent = lastDecision ? `${lastDecision.decision === 'aprovado' ? 'Aprovado' : 'Rejeitado'} por ${approvalPerson(lastDecision.approver)}` : ''; document.querySelector('[data-approval-history-text]').textContent = lastDecision ? `${lastDecision.comments || 'Sem comentários'} · ${approvalDate(lastDecision.decided_at)}` : '';
  const showActions = order.status === 'em_aprovacao' && canApprove(); document.querySelector('[data-approval-actions]').hidden = !showActions; document.querySelector('[data-approval-comments-wrap]').hidden = !showActions; document.querySelector('[data-approval-comments]').value = '';
  approvalDialog.showModal();
}

async function decideOrder(decision) {
  if (!activeApprovalOrder || !canApprove()) return showApprovalNotice('Seu usuário não possui perfil de aprovador.', 'error');
  const comments = document.querySelector('[data-approval-comments]').value.trim();
  if (decision === 'reprovado' && !comments) return showApprovalNotice('Informe o motivo da rejeição para devolver o pedido.', 'error');
  const { error } = await approvalClient.rpc('decide_purchase_order', { p_order_id: activeApprovalOrder.id, p_decision: decision, p_comments: comments || null });
  if (error) return showApprovalNotice(`Decisão não registrada: ${error.message}`, 'error');
  approvalDialog.close(); showApprovalNotice(decision === 'aprovado' ? 'Pedido aprovado com sucesso. O PDF foi liberado.' : 'Pedido rejeitado. Ele voltou para a etapa de pedidos.'); setTimeout(() => window.location.reload(), 1600);
}

async function loadApprovalProfile() {
  const { data: { user } } = await approvalClient.auth.getUser(); if (!user) return;
  const { data, error } = await approvalClient.from('profiles').select('id,full_name,email,role').eq('id', user.id).single();
  if (error) return showApprovalNotice(`Não foi possível validar o perfil: ${error.message}`, 'error');
  approvalProfile = data; document.querySelector('[data-approval-access]').textContent = canApprove() ? 'Você pode aprovar ou rejeitar pedidos.' : 'Acesso para consulta. Somente aprovadores decidem.';
}

async function loadApprovalOrders() {
  const { data, error } = await approvalClient.from('purchase_orders').select('id,order_number,purchase_request_id,quote_id,supplier_id,gross_value,discount_value,total_value,status,selection_reason,created_at,sent_at,supplier:suppliers!purchase_orders_supplier_id_fkey(id,legal_name),creator:profiles!purchase_orders_created_by_fkey(id,full_name,email),approvals:order_approvals(id,decision,comments,decided_at,approver:profiles!order_approvals_approver_id_fkey(id,full_name,email)),request:purchase_requests!purchase_orders_purchase_request_id_fkey(id,request_number,requester:profiles!purchase_requests_requested_by_fkey(id,full_name,email),activity:activities(id,code,description),lines:purchase_request_items(quantity,item:items(id,material_number,description)),quotes(id,supplier_id,quoted_value,discount_value,net_value,delivery_date,freight_type,payment_terms,supplier:suppliers!quotes_supplier_id_fkey(id,legal_name)))').order('created_at', { ascending: false });
  if (error) return showApprovalNotice(`Não foi possível carregar as aprovações: ${error.message}`, 'error');
  approvalOrders = data || []; renderApprovalMetrics(); renderApprovalOrders();
}

document.querySelector('[data-approvals-rows]').addEventListener('click', (event) => { const button = event.target.closest('[data-review-order]'); if (button) openApprovalDialog(button.dataset.reviewOrder); });
approvalStatusFilter.addEventListener('change', renderApprovalOrders); approvalTextFilter.addEventListener('input', renderApprovalOrders);
document.querySelector('[data-close-approval]').addEventListener('click', () => approvalDialog.close()); document.querySelector('[data-approve-order]').addEventListener('click', () => decideOrder('aprovado')); document.querySelector('[data-reject-order]').addEventListener('click', () => decideOrder('reprovado'));
Promise.all([loadApprovalProfile(), loadApprovalOrders()]);
