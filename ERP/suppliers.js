const supplierClient = window.erpSupabase;
const notice = document.querySelector('[data-notice]');
const form = document.querySelector('[data-supplier-form]');
const saveButton = document.querySelector('[data-save-supplier]');
const cancelButton = document.querySelector('[data-cancel-edit]');
const formKicker = document.querySelector('[data-form-kicker]');
let suppliers = [];
let editingId = null;

const showNotice = (text, type = 'success') => { notice.textContent = text; notice.dataset.type = type; };
const escapeHtml = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));

function renderSuppliers(entries = suppliers) {
  const body = document.querySelector('[data-suppliers-rows]');
  body.innerHTML = entries.length ? entries.map((supplier) => `<tr>
    <td>${escapeHtml(supplier.legal_name)}</td><td>${escapeHtml(supplier.tax_id)}</td>
    <td>${escapeHtml(supplier.contact_name || supplier.contact_email)}</td>
    <td>${escapeHtml([supplier.city, supplier.state].filter(Boolean).join('/') || '—')}</td>
    <td>${escapeHtml(supplier.payment_terms)}</td>
    <td><span class="status ${supplier.active ? 'approved' : 'pending'}">${supplier.active ? 'Ativo' : 'Inativo'}</span></td>
    <td class="table-actions"><button type="button" class="row-button" data-edit-supplier="${supplier.id}">Editar</button><button type="button" class="row-button danger" data-delete-supplier="${supplier.id}">Excluir</button></td>
  </tr>`).join('') : '<tr><td colspan="7" class="empty-cell">Nenhum fornecedor encontrado.</td></tr>';
}

async function loadSuppliers() {
  const { data, error } = await supplierClient.from('suppliers').select('*').order('legal_name');
  if (error) return showNotice(`Não foi possível carregar os fornecedores: ${error.message}`, 'error');
  suppliers = data || [];
  renderSuppliers();
}

function resetForm() {
  editingId = null;
  form.reset();
  formKicker.textContent = 'Novo fornecedor';
  saveButton.textContent = 'Salvar fornecedor';
  cancelButton.hidden = true;
}

function startEdit(id) {
  const supplier = suppliers.find((entry) => entry.id === id);
  if (!supplier) return;
  editingId = id;
  [...form.elements].forEach((field) => { if (field.name) field.value = supplier[field.name] ?? ''; });
  formKicker.textContent = 'Edição de fornecedor';
  saveButton.textContent = 'Salvar alterações';
  cancelButton.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteSupplier(id) {
  const supplier = suppliers.find((entry) => entry.id === id);
  if (!window.confirm(`Excluir o fornecedor “${supplier?.legal_name || ''}”? Esta ação não poderá ser desfeita.`)) return;
  const { error } = await supplierClient.from('suppliers').delete().eq('id', id);
  if (error) return showNotice(`Fornecedor não excluído: ${error.message}`, 'error');
  if (editingId === id) resetForm();
  showNotice('Fornecedor excluído com sucesso.');
  loadSuppliers();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  Object.keys(values).forEach((key) => { if (values[key] === '') values[key] = null; });
  const request = editingId
    ? supplierClient.from('suppliers').update(values).eq('id', editingId)
    : supplierClient.from('suppliers').insert(values);
  const { error } = await request;
  if (error) return showNotice(`Fornecedor não salvo: ${error.message}`, 'error');
  showNotice(editingId ? 'Fornecedor atualizado com sucesso.' : 'Fornecedor cadastrado com sucesso.');
  resetForm();
  loadSuppliers();
});

document.querySelector('[data-suppliers-rows]').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-supplier]');
  const remove = event.target.closest('[data-delete-supplier]');
  if (edit) startEdit(edit.dataset.editSupplier);
  if (remove) deleteSupplier(remove.dataset.deleteSupplier);
});

cancelButton.addEventListener('click', resetForm);
document.querySelector('[data-supplier-filter]').addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderSuppliers(suppliers.filter((supplier) => [supplier.legal_name, supplier.trade_name, supplier.tax_id, supplier.city].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
});

loadSuppliers();
