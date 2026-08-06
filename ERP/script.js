const client = window.erpSupabase;
const dialog = document.querySelector('[data-form-dialog]');
const openButtons = document.querySelectorAll('[data-open-form]');
const closeButton = document.querySelector('[data-close-form]');
const form = document.querySelector('#purchase-form');
const requestList = document.querySelector('#request-list');
const openCount = document.querySelector('#open-count');
const loginForm = document.querySelector('[data-login-form]');
const loginMessage = document.querySelector('[data-login-message]');
const userName = document.querySelector('[data-user-name]');
const userEmail = document.querySelector('[data-user-email]');

const setAuthenticated = (user) => {
  document.body.classList.remove('auth-pending', 'login-required');
  document.body.classList.add('authenticated');
  const email = user.email || '';
  userEmail.textContent = email;
  userName.textContent = user.user_metadata?.name || email.split('@')[0] || 'usuário';
};

const setLoginRequired = (message = '') => {
  document.body.classList.remove('auth-pending', 'authenticated');
  document.body.classList.add('login-required');
  loginMessage.textContent = message;
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = 'Verificando acesso…';
  const data = new FormData(loginForm);
  const { data: authData, error } = await client.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') });
  if (error) return setLoginRequired('E-mail ou senha inválidos.');
  setAuthenticated(authData.user);
});

document.querySelector('[data-sign-out]').addEventListener('click', async () => {
  await client.auth.signOut();
  setLoginRequired();
});

openButtons.forEach((button) => button.addEventListener('click', () => dialog.showModal()));
closeButton.addEventListener('click', () => dialog.close());

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const description = data.get('description');
  const category = data.get('category');
  const value = Number(String(data.get('value')).replace(',', '.')) || 0;
  const row = document.createElement('tr');
  row.innerHTML = `<td>#CP-${1050 + requestList.children.length} · ${description}</td><td>${category}</td><td>${userName.textContent}</td><td>${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td><span class="status pending">Em cotação</span></td>`;
  requestList.prepend(row);
  openCount.textContent = String(Number(openCount.textContent) + 1);
  form.reset();
  dialog.close();
});

client.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) setAuthenticated(session.user);
  else setLoginRequired();
});
