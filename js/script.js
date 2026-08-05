document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('[data-header]');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const setHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 16);
  setHeader(); window.addEventListener('scroll', setHeader, { passive: true });
  toggle?.addEventListener('click', () => { const open = nav.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu'); });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { nav.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); }));
  document.querySelectorAll('.ano').forEach(el => el.textContent = new Date().getFullYear());
  const cards = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => entries.forEach((entry, index) => { if (entry.isIntersecting) { entry.target.style.transitionDelay = `${index * 80}ms`; entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .15 });
  cards.forEach(card => observer.observe(card));
});
