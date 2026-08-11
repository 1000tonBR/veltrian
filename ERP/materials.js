const materialClient = window.erpSupabase;
const materialNotice = document.querySelector('[data-notice]');
const materialForm = document.querySelector('[data-material-form]');
const materialSaveButton = document.querySelector('[data-save-material]');
const materialCancelButton = document.querySelector('[data-cancel-edit]');
const materialFormKicker = document.querySelector('[data-form-kicker]');
let materials = [];
let editingMaterialId = null;

const showMaterialNotice = (text, type = 'success') => { materialNotice.textContent = text; materialNotice.dataset.type = type; materialNotice.classList.add('is-visible'); };
const refreshMaterials = (text) => { showMaterialNotice(text); window.setTimeout(() => window.location.reload(), 1300); };
const escapeMaterial = (value) => String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const formatMaterialDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

function renderMaterials(entries = materials) {
  const body = document.querySelector('[data-materials-rows]');
  body.innerHTML = entries.length ? entries.map((material) => `<tr>
    <td>${material.material_number ? `MAT-${String(material.material_number).padStart(4, '0')}` : '—'}</td><td>${escapeMaterial(material.description)}</td><td>${escapeMaterial(material.default_quantity)}</td><td>${escapeMaterial(material.manufacturer)}</td><td>${escapeMaterial(material.serial_number)}</td>
    <td><span class="status ${material.active ? 'approved' : 'pending'}">${material.active ? 'Ativo' : 'Inativo'}</span></td><td>${formatMaterialDate(material.created_at)}</td><td class="table-actions"><button type="button" class="row-button" data-edit-material="${material.id}">Editar</button><button type="button" class="row-button danger" data-delete-material="${material.id}">Excluir</button></td>
  </tr>`).join('') : '<tr><td colspan="8" class="empty-cell">Nenhum material encontrado.</td></tr>';
}

async function loadMaterials() {
  const { data, error } = await materialClient.from('items').select('*').order('description');
  if (error) return showMaterialNotice(`Não foi possível carregar os materiais: ${error.message}`, 'error');
  materials = data || []; renderMaterials();
}

function resetMaterialForm() {
  editingMaterialId = null; materialForm.reset();
  materialFormKicker.textContent = 'Novo material'; materialSaveButton.textContent = 'Salvar material'; materialCancelButton.hidden = true;
}

function startMaterialEdit(id) {
  const material = materials.find((entry) => entry.id === id); if (!material) return;
  editingMaterialId = id;
  [...materialForm.elements].forEach((field) => {
    if (!field.name) return;
    field.value = field.name === 'active' ? String(material.active) : material[field.name] ?? '';
  });
  materialFormKicker.textContent = 'Edição de material'; materialSaveButton.textContent = 'Salvar alterações'; materialCancelButton.hidden = false;
  materialForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteMaterial(id) {
  const material = materials.find((entry) => entry.id === id);
  if (!window.confirm(`Excluir o material “${material?.description || ''}”? Esta ação não poderá ser desfeita.`)) return;
  const { error } = await materialClient.from('items').delete().eq('id', id);
  if (error) return showMaterialNotice(`Material não excluído: ${error.message}`, 'error');
  if (editingMaterialId === id) resetMaterialForm();
  refreshMaterials('Material excluído com sucesso. Atualizando os dados…');
}

materialForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(materialForm));
  values.active = values.active === 'true';
  values.default_quantity = values.default_quantity ? Number(values.default_quantity) : null;
  Object.keys(values).forEach((key) => { if (values[key] === '') values[key] = null; });
  const request = editingMaterialId ? materialClient.from('items').update(values).eq('id', editingMaterialId) : materialClient.from('items').insert(values);
  const { error } = await request;
  if (error) return showMaterialNotice(`Material não salvo: ${error.message}`, 'error');
  const message = editingMaterialId ? 'Material atualizado com sucesso. Atualizando os dados…' : 'Material salvo com sucesso. Atualizando os dados…';
  resetMaterialForm(); refreshMaterials(message);
});

document.querySelector('[data-materials-rows]').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-material]'); const remove = event.target.closest('[data-delete-material]');
  if (edit) startMaterialEdit(edit.dataset.editMaterial);
  if (remove) deleteMaterial(remove.dataset.deleteMaterial);
});
materialCancelButton.addEventListener('click', resetMaterialForm);
document.querySelector('[data-material-filter]').addEventListener('input', (event) => {
  const term = event.target.value.trim().toLocaleLowerCase('pt-BR');
  renderMaterials(materials.filter((material) => {
    const code = material.material_number ? `mat-${String(material.material_number).padStart(4, '0')}` : '';
    return [code, material.material_number, material.description, material.manufacturer, material.serial_number].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
  }));
});
loadMaterials();
