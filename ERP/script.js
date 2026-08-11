const dashboardClient = window.erpSupabase;
const dashboardLoginForm = document.querySelector('[data-login-form]');
const dashboardLoginMessage = document.querySelector('[data-login-message]');
const dashboardNotice = document.querySelector('[data-dashboard-notice]');
const dashboardUserName = document.querySelector('[data-user-name]');
const dashboardUserEmail = document.querySelector('[data-user-email]');

const dashboardEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const dashboardMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dashboardDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value)) : '—';
const dashboardRcCode = (number) => `RC-${String(number).padStart(4, '0')}`;
const dashboardMaterial = (request) => request.lines?.map((line) => `${line.item?.material_number ? `MAT-${String(line.item.material_number).padStart(4, '0')} · ` : ''}${line.item?.description || ''}`).filter(Boolean).join(', ') || '—';

function showDashboardError(text) {
  dashboardNotice.textContent = text; dashboardNotice.dataset.type = 'error'; dashboardNotice.classList.add('is-visible');
}

function setDashboardAuthenticated(user) {
  document.body.classList.remove('auth-pending', 'login-required'); document.body.classList.add('authenticated');
  const email = user.email || ''; dashboardUserEmail.textContent = email; dashboardUserName.textContent = user.user_metadata?.name || email.split('@')[0] || 'usuário';
  loadDashboard();
}

function setDashboardLoginRequired(message = '') {
  document.body.classList.remove('auth-pending', 'authenticated'); document.body.classList.add('login-required'); dashboardLoginMessage.textContent = message;
}

async function loadDashboard() {
  const [requestsResult, suppliersResult] = await Promise.all([
    dashboardClient.from('purchase_requests').select('id,request_number,status,priority,created_at,lines:purchase_request_items(quantity,item:items(description,material_number)),quotes(id,net_value,selected,supplier:suppliers(legal_name)),orders:purchase_orders(id,order_number,status,sent_at)').order('created_at', { ascending: false }),
    dashboardClient.from('suppliers').select('id', { count: 'exact', head: true }).eq('active', true)
  ]);
  if (requestsResult.error) return showDashboardError(`Não foi possível carregar o overview: ${requestsResult.error.message}`);
  if (suppliersResult.error) return showDashboardError(`Não foi possível contar os fornecedores: ${suppliersResult.error.message}`);

  const requests = requestsResult.data || [];
  const open = requests.filter((request) => request.status !== 'concluida');
  const withoutQuotes = open.filter((request) => !request.quotes?.length);
  const readyForOrder = open.filter((request) => request.quotes?.length && !request.orders?.length);
  const waitingToSend = requests.filter((request) => request.orders?.some((order) => !order.sent_at && order.status !== 'cancelado'));
  document.querySelector('[data-open-rcs]').textContent = open.length;
  document.querySelector('[data-without-quotes]').textContent = withoutQuotes.length;
  document.querySelector('[data-ready-orders]').textContent = readyForOrder.length;
  document.querySelector('[data-active-suppliers]').textContent = suppliersResult.count || 0;
  document.querySelector('[data-backlog-quotes]').textContent = withoutQuotes.length;
  document.querySelector('[data-backlog-orders]').textContent = readyForOrder.length;
  document.querySelector('[data-backlog-send]').textContent = waitingToSend.length;

  const rows = document.querySelector('[data-overview-rows]');
  rows.innerHTML = requests.length ? requests.map((request) => {
    const quotes = request.quotes || []; const orders = request.orders || [];
    const lowest = quotes.length ? Math.min(...quotes.map((quote) => Number(quote.net_value))) : null;
    let stage = 'Aguardando cotação'; let statusClass = 'pending'; let target = 'quotes.html'; let action = 'Registrar cotação';
    if (quotes.length && !orders.length) { stage = 'Cotação pronta'; statusClass = 'approval'; target = 'orders.html'; action = 'Escolher fornecedor'; }
    if (orders.length) { stage = orders.some((order) => order.sent_at) ? 'Pedido enviado' : 'Pedido a enviar'; statusClass = orders.some((order) => order.sent_at) ? 'approved' : 'approval'; target = 'orders.html'; action = orders.some((order) => order.sent_at) ? 'Ver pedido' : 'Gerar PDF'; }
    return `<tr><td><strong>${dashboardRcCode(request.request_number)}</strong></td><td>${dashboardEscape(dashboardMaterial(request))}</td><td>${quotes.length}</td><td>${lowest === null ? '—' : dashboardMoney(lowest)}</td><td><span class="status ${statusClass}">${stage}</span></td><td>${dashboardDate(request.created_at)}</td><td><a class="row-link" href="${target}">${action} →</a></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">Nenhuma requisição cadastrada.</td></tr>';
}

dashboardLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); dashboardLoginMessage.textContent = 'Verificando acesso…'; const form = new FormData(dashboardLoginForm);
  const { data, error } = await dashboardClient.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  if (error) return setDashboardLoginRequired('E-mail ou senha inválidos.'); setDashboardAuthenticated(data.user);
});
document.querySelector('[data-sign-out]').addEventListener('click', async () => { await dashboardClient.auth.signOut(); setDashboardLoginRequired(); });
dashboardClient.auth.getSession().then(({ data: { session } }) => session?.user ? setDashboardAuthenticated(session.user) : setDashboardLoginRequired());
