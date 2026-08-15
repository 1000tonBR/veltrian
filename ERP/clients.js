const clientDatabase = window.erpSupabase;
const clientNotice = document.querySelector('[data-notice]');
const clientForm = document.querySelector('[data-client-form]');
const clientResponsible = document.querySelector('[data-client-responsible]');
const clientSaveButton = document.querySelector('[data-save-client]');
const clientCancelButton = document.querySelector('[data-cancel-client]');
let clients = [];
let clientProfiles = [];
let editingClientId = null;
let currentClientUserId = null;
let clientNoticeTimer;

const clientEscape = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const clientDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const clientPerson = (person) => person?.full_name || person?.email || '—';

function showClientNotice(text, type = 'success') {
  clearTimeout(clientNoticeTimer); clientNotice.textContent = text; clientNotice.dataset.type = type; clientNotice.classList.remove('is-visible'); requestAnimationFrame(() => clientNotice.classList.add('is-visible')); clientNoticeTimer = setTimeout(() => clientNotice.classList.remove('is-visible'), 5000);
}
function refreshClients(text) { showClientNotice(text); setTimeout(() => window.location.reload(), 1400); }

function renderClients(entries = clients) {
  const body = document.querySelector('[data-clients-rows]');
  body.innerHTML = entries.length ? entries.map((client) => `<tr><td>${client.client_number ? `CLI-${String(client.client_number).padStart(4, '0')}` : '—'}</td><td>${clientEscape(client.legal_name)}</td><td>${clientEscape(client.business_sector)}</td><td>${clientEscape(client.tax_id)}</td><td>${clientEscape(clientPerson(client.responsible))}</td><td>${clientEscape(client.contact_name || client.contact_email || client.contact_phone)}</td><td>${clientEscape([client.city,client.state].filter(Boolean).join('/') || '—')}</td><td><span class="status ${client.active ? 'approved' : 'pending'}">${client.active ? 'Ativo' : 'Inativo'}</span></td><td>${clientDate(client.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-edit-client="${client.id}">Editar</button><button type="button" class="row-button danger" data-delete-client="${client.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="10" class="empty-cell">Nenhum cliente encontrado.</td></tr>';
}

function renderResponsibleOptions(selected = '') {
  clientResponsible.innerHTML = `<option value="">Selecione o responsável</option>${clientProfiles.map((profile) => `<option value="${profile.id}" ${profile.id === (selected || currentClientUserId) ? 'selected' : ''}>${clientEscape(clientPerson(profile))}</option>`).join('')}`;
}

async function loadClientReferences() {
  const [{ data: profiles, error: profileError }, { data: { user } }] = await Promise.all([clientDatabase.from('profiles').select('id,full_name,email').order('full_name'), clientDatabase.auth.getUser()]);
  if (profileError) return showClientNotice(`Não foi possível carregar os usuários: ${profileError.message}`, 'error');
  clientProfiles = profiles || []; currentClientUserId = user?.id || null; renderResponsibleOptions();
}

async function loadClients() {
  const { data, error } = await clientDatabase.from('clients').select('*,responsible:profiles!clients_responsible_id_fkey(id,full_name,email)').order('legal_name');
  if (error) return showClientNotice(`Não foi possível carregar os clientes: ${error.message}`, 'error'); clients = data || []; renderClients();
}

function resetClientForm() {
  editingClientId = null; clientForm.reset(); renderResponsibleOptions(); document.querySelector('[data-client-kicker]').textContent = 'Novo cliente'; clientSaveButton.textContent = 'Salvar cliente'; clientCancelButton.hidden = true;
}

function editClient(id) {
  const client = clients.find((entry) => entry.id === id); if (!client) return; editingClientId = id;
  [...clientForm.elements].forEach((field) => { if (field.name && field.name !== 'responsible_id') field.value = client[field.name] ?? ''; }); renderResponsibleOptions(client.responsible_id); clientForm.elements.active.value = String(client.active); document.querySelector('[data-client-kicker]').textContent = 'Edição de cliente'; clientSaveButton.textContent = 'Salvar alterações'; clientCancelButton.hidden = false; clientForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteClient(id) {
  const client = clients.find((entry) => entry.id === id); if (!confirm(`Excluir o cliente “${client?.legal_name || ''}”? Esta ação não poderá ser desfeita.`)) return;
  const { error } = await clientDatabase.from('clients').delete().eq('id', id); if (error) return showClientNotice(`Cliente não excluído: ${error.message}`, 'error'); refreshClients('Cliente excluído com sucesso. Atualizando os dados…');
}

clientForm.addEventListener('submit', async (event) => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(clientForm)); values.active = values.active === 'true'; Object.keys(values).forEach((key) => { if (values[key] === '') values[key] = null; });
  const query = editingClientId ? clientDatabase.from('clients').update(values).eq('id', editingClientId) : clientDatabase.from('clients').insert(values); const { error } = await query;
  if (error) return showClientNotice(`Cliente não salvo: ${error.message}`, 'error'); const message = editingClientId ? 'Cliente atualizado com sucesso. Atualizando os dados…' : 'Cliente salvo com sucesso. Atualizando os dados…'; resetClientForm(); refreshClients(message);
});

document.querySelector('[data-clients-rows]').addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-client]'); const remove = event.target.closest('[data-delete-client]'); if (edit) editClient(edit.dataset.editClient); if (remove) deleteClient(remove.dataset.deleteClient); });
clientCancelButton.addEventListener('click', resetClientForm); document.querySelector('[data-client-filter]').addEventListener('input', (event) => { const term = event.target.value.trim().toLocaleLowerCase('pt-BR'); renderClients(clients.filter((client) => [`cli-${String(client.client_number || '').padStart(4,'0')}`,client.client_number,client.legal_name,client.trade_name,client.business_sector,client.tax_id,clientPerson(client.responsible),client.city].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term)))); });
Promise.all([loadClientReferences(), loadClients()]);
