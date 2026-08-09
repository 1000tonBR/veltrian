const supplierClient = window.erpSupabase;
const notice = document.querySelector('[data-notice]');
const showNotice = (text, type = 'success') => { notice.textContent = text; notice.dataset.type = type; };
let suppliers = [];

function renderSuppliers(entries = suppliers) {
  const body = document.querySelector('[data-suppliers-rows]');
  body.innerHTML = entries.length ? entries.map((supplier) => `<tr><td>${supplier.legal_name}</td><td>${supplier.tax_id || '—'}</td><td>${supplier.contact_name || supplier.contact_email || '—'}</td><td>${[supplier.city, supplier.state].filter(Boolean).join('/') || '—'}</td><td>${supplier.payment_terms || '—'}</td><td><span class="status ${supplier.active ? 'approved' : 'pending'}">${supplier.active ? 'Ativo' : 'Inativo'}</span></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Nenhum fornecedor encontrado.</td></tr>';
}

async function loadSuppliers() {
  const { data, error } = await supplierClient.from('suppliers').select('*').order('legal_name');
  if (error) return showNotice(`Não foi possível carregar os fornecedores: ${error.message}`, 'error');
  suppliers = data || []; renderSuppliers();
}

document.querySelector('[data-supplier-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  Object.keys(values).forEach((key) => { if (values[key] === '') values[key] = null; });
  const { error } = await supplierClient.from('suppliers').insert(values);
  if (error) return showNotice(`Fornecedor não salvo: ${error.message}`, 'error');
  event.currentTarget.reset(); showNotice('Fornecedor cadastrado com sucesso.'); loadSuppliers();
});

document.querySelector('[data-supplier-filter]').addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderSuppliers(suppliers.filter((supplier) => [supplier.legal_name, supplier.trade_name, supplier.tax_id, supplier.city].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term))));
});

loadSuppliers();
