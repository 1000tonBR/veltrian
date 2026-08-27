const client=window.erpSupabase,loginForm=document.querySelector('[data-login-form]'),message=document.querySelector('[data-login-message]');
document.querySelectorAll('.side-nav').forEach(nav=>{if(nav.querySelector('a[href="mrp.html"]'))return;const reports=nav.querySelector('a[href="reports.html"]');if(reports){const link=document.createElement('a');link.href='mrp.html';link.textContent='MRP';nav.insertBefore(link,reports)}});
const requireLogin=(text='')=>{document.body.classList.remove('auth-pending','authenticated');document.body.classList.add('login-required');message.textContent=text};
const enterApp=user=>{document.body.classList.remove('auth-pending','login-required');document.body.classList.add('authenticated');const email=document.querySelector('[data-user-email]');if(email)email.textContent=user.email||''};
loginForm?.addEventListener('submit',async event=>{event.preventDefault();const values=new FormData(loginForm),{data,error}=await client.auth.signInWithPassword({email:values.get('email'),password:values.get('password')});if(error)return requireLogin('E-mail ou senha inválidos.');enterApp(data.user)});
document.querySelector('[data-sign-out]')?.addEventListener('click',async()=>{await client.auth.signOut();requireLogin()});
client.auth.getSession().then(({data:{session}})=>session?.user?enterApp(session.user):requireLogin());
