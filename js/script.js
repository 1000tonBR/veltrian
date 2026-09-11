document.addEventListener('DOMContentLoaded', () => {
  const translations = {
    pt: {
      'meta.description': 'Veltrian: performance industrial, supply chain e inteligência de negócios para operações mais eficientes.',
      'skip.content': 'Pular para o conteúdo',
      'brand.home': 'Veltrian, início',
      'nav.label': 'Navegação principal',
      'nav.about': 'A Veltrian',
      'nav.solutions': 'Soluções',
      'nav.method': 'Como atuamos',
      'nav.contact': 'Falar com especialista',
      'language.label': 'Selecionar idioma',
      'menu.open': 'Abrir menu',
      'menu.close': 'Fechar menu',
      'hero.eyebrow': 'Estratégia. Performance. Conexões.',
      'hero.title': 'Conectamos experiência industrial a <em>resultados reais.</em>',
      'hero.lead': 'Transformamos estratégia, processos e conexões em performance sustentável para a indústria.',
      'hero.contact': 'Falar com especialista',
      'hero.services': 'Conheça nossos serviços',
      'pillars.label': 'Pilares de atuação',
      'pillars.performance.title': 'Performance industrial',
      'pillars.performance.text': 'Aumentamos eficiência, confiabilidade e produtividade dos ativos.',
      'pillars.supply.text': 'Otimização de suprimentos, estoques e gestão de materiais.',
      'pillars.assets.title': 'Gestão de ativos',
      'pillars.assets.text': 'Estratégia e execução para maximizar o ciclo de vida dos ativos.',
      'pillars.business.title': 'Desenvolvimento de negócios',
      'pillars.business.text': 'Conectamos soluções, fornecedores e oportunidades de valor.',
      'about.eyebrow': 'A Veltrian',
      'about.title': 'Decisões melhores começam com uma operação que faz sentido.',
      'about.text': 'Somos uma consultoria de performance industrial e gestão de negócios. Atuamos ao lado de líderes que buscam ganhos sustentáveis, com uma visão integrada de pessoas, processos e tecnologia.',
      'about.link': 'Nossa forma de atuar',
      'solutions.eyebrow': 'Soluções sob medida',
      'solutions.title': 'Do diagnóstico à transformação.',
      'solutions.lead': 'Foco no que realmente move a sua operação: produtividade, fluxo, previsibilidade e geração de valor.',
      'services.performance.title': 'Performance industrial',
      'services.performance.text': 'Processos mais eficientes, indicadores que direcionam e uma rotina de melhoria contínua.',
      'services.supply.text': 'Uma cadeia conectada, com maior nível de serviço, equilíbrio de estoques e agilidade.',
      'services.materials.title': 'Planejamento de materiais',
      'services.materials.text': 'Mais confiança para planejar demanda, materiais, capacidade e prioridades de produção.',
      'services.bi.text': 'Dados claros, painéis relevantes e decisões orientadas por informação confiável.',
      'method.eyebrow': 'Como atuamos',
      'method.title': 'Uma parceria que transforma intenção em resultado.',
      'method.lead': 'Unimos profundidade analítica e execução prática para gerar avanços percebidos no dia a dia da operação.',
      'method.step1.title': 'Entendemos o contexto',
      'method.step1.text': 'Escuta, diagnóstico e leitura objetiva dos desafios.',
      'method.step2.title': 'Construímos o caminho',
      'method.step2.text': 'Prioridades, metas e um plano aplicável à realidade do negócio.',
      'method.step3.title': 'Implementamos juntos',
      'method.step3.text': 'Ritmo de execução, acompanhamento e autonomia para o time.',
      'presence.imageAlt': 'Ambiente corporativo contemporâneo com sala de reuniões',
      'presence.eyebrow': 'Estratégia que se vê na prática',
      'presence.title': 'Uma visão que conecta pessoas, processos e resultado.',
      'presence.text': 'Ambientes de alta performance nascem de decisões claras, execução consistente e parceiros que entendem a realidade do negócio.',
      'presence.link': 'Conheça nossa forma de atuar',
      'contact.eyebrow': 'Vamos conversar',
      'contact.title': 'O próximo resultado pode começar agora.',
      'contact.text': 'Conte o que a sua operação precisa resolver. A Veltrian ajuda a transformar desafios em direção.',
      'contact.whatsappAria': 'Falar com a Veltrian pelo WhatsApp, no número +55 16 99792-9477',
      'contact.email': 'E-mail',
      'contact.emailAria': 'Enviar e-mail para joaopaulo@veltrian.com.br',
      'footer.home': 'Voltar ao início',
      'footer.rights': 'Todos os direitos reservados.'
    },
    es: {
      'meta.description': 'Veltrian: rendimiento industrial, cadena de suministro e inteligencia de negocios para operaciones más eficientes.',
      'skip.content': 'Saltar al contenido',
      'brand.home': 'Veltrian, inicio',
      'nav.label': 'Navegación principal',
      'nav.about': 'Veltrian',
      'nav.solutions': 'Soluciones',
      'nav.method': 'Cómo trabajamos',
      'nav.contact': 'Hablar con un especialista',
      'language.label': 'Seleccionar idioma',
      'menu.open': 'Abrir menú',
      'menu.close': 'Cerrar menú',
      'hero.eyebrow': 'Estrategia. Rendimiento. Conexiones.',
      'hero.title': 'Conectamos la experiencia industrial con <em>resultados reales.</em>',
      'hero.lead': 'Transformamos estrategia, procesos y conexiones en rendimiento sostenible para la industria.',
      'hero.contact': 'Hablar con un especialista',
      'hero.services': 'Conozca nuestros servicios',
      'pillars.label': 'Pilares de actuación',
      'pillars.performance.title': 'Rendimiento industrial',
      'pillars.performance.text': 'Aumentamos la eficiencia, la confiabilidad y la productividad de los activos.',
      'pillars.supply.text': 'Optimización de suministros, inventarios y gestión de materiales.',
      'pillars.assets.title': 'Gestión de activos',
      'pillars.assets.text': 'Estrategia y ejecución para maximizar el ciclo de vida de los activos.',
      'pillars.business.title': 'Desarrollo de negocios',
      'pillars.business.text': 'Conectamos soluciones, proveedores y oportunidades de valor.',
      'about.eyebrow': 'Veltrian',
      'about.title': 'Las mejores decisiones comienzan con una operación que tiene sentido.',
      'about.text': 'Somos una consultora de rendimiento industrial y gestión empresarial. Trabajamos junto a líderes que buscan resultados sostenibles, con una visión integrada de personas, procesos y tecnología.',
      'about.link': 'Nuestra forma de trabajar',
      'solutions.eyebrow': 'Soluciones a medida',
      'solutions.title': 'Del diagnóstico a la transformación.',
      'solutions.lead': 'Nos enfocamos en lo que realmente impulsa su operación: productividad, flujo, previsibilidad y generación de valor.',
      'services.performance.title': 'Rendimiento industrial',
      'services.performance.text': 'Procesos más eficientes, indicadores que orientan y una rutina de mejora continua.',
      'services.supply.text': 'Una cadena conectada, con mayor nivel de servicio, equilibrio de inventarios y agilidad.',
      'services.materials.title': 'Planificación de materiales',
      'services.materials.text': 'Más confianza para planificar la demanda, los materiales, la capacidad y las prioridades de producción.',
      'services.bi.text': 'Datos claros, paneles relevantes y decisiones orientadas por información confiable.',
      'method.eyebrow': 'Cómo trabajamos',
      'method.title': 'Una alianza que transforma la intención en resultados.',
      'method.lead': 'Unimos profundidad analítica y ejecución práctica para generar avances perceptibles en el día a día de la operación.',
      'method.step1.title': 'Entendemos el contexto',
      'method.step1.text': 'Escucha, diagnóstico y evaluación objetiva de los desafíos.',
      'method.step2.title': 'Construimos el camino',
      'method.step2.text': 'Prioridades, metas y un plan aplicable a la realidad del negocio.',
      'method.step3.title': 'Implementamos juntos',
      'method.step3.text': 'Ritmo de ejecución, seguimiento y autonomía para el equipo.',
      'presence.imageAlt': 'Entorno corporativo contemporáneo con sala de reuniones',
      'presence.eyebrow': 'Estrategia visible en la práctica',
      'presence.title': 'Una visión que conecta personas, procesos y resultados.',
      'presence.text': 'Los entornos de alto rendimiento nacen de decisiones claras, ejecución consistente y aliados que comprenden la realidad del negocio.',
      'presence.link': 'Conozca nuestra forma de trabajar',
      'contact.eyebrow': 'Hablemos',
      'contact.title': 'El próximo resultado puede comenzar ahora.',
      'contact.text': 'Cuéntenos qué necesita resolver su operación. Veltrian ayuda a transformar los desafíos en dirección.',
      'contact.whatsappAria': 'Hablar con Veltrian por WhatsApp, en el número +55 16 99792-9477',
      'contact.email': 'Correo electrónico',
      'contact.emailAria': 'Enviar un correo electrónico a joaopaulo@veltrian.com.br',
      'footer.home': 'Volver al inicio',
      'footer.rights': 'Todos los derechos reservados.'
    },
    en: {
      'meta.description': 'Veltrian: industrial performance, supply chain and business intelligence for more efficient operations.',
      'skip.content': 'Skip to content',
      'brand.home': 'Veltrian, home',
      'nav.label': 'Main navigation',
      'nav.about': 'About Veltrian',
      'nav.solutions': 'Solutions',
      'nav.method': 'How we work',
      'nav.contact': 'Talk to a specialist',
      'language.label': 'Select language',
      'menu.open': 'Open menu',
      'menu.close': 'Close menu',
      'hero.eyebrow': 'Strategy. Performance. Connections.',
      'hero.title': 'We connect industrial expertise to <em>real results.</em>',
      'hero.lead': 'We turn strategy, processes and connections into sustainable performance for industry.',
      'hero.contact': 'Talk to a specialist',
      'hero.services': 'Explore our services',
      'pillars.label': 'Areas of expertise',
      'pillars.performance.title': 'Industrial performance',
      'pillars.performance.text': 'We increase asset efficiency, reliability and productivity.',
      'pillars.supply.text': 'Procurement, inventory and materials management optimization.',
      'pillars.assets.title': 'Asset management',
      'pillars.assets.text': 'Strategy and execution to maximize asset life cycles.',
      'pillars.business.title': 'Business development',
      'pillars.business.text': 'We connect solutions, suppliers and opportunities that create value.',
      'about.eyebrow': 'Veltrian',
      'about.title': 'Better decisions begin with an operation that makes sense.',
      'about.text': 'We are an industrial performance and business management consultancy. We work alongside leaders seeking sustainable gains through an integrated view of people, processes and technology.',
      'about.link': 'How we work',
      'solutions.eyebrow': 'Tailored solutions',
      'solutions.title': 'From diagnosis to transformation.',
      'solutions.lead': 'We focus on what truly moves your operation: productivity, flow, predictability and value creation.',
      'services.performance.title': 'Industrial performance',
      'services.performance.text': 'More efficient processes, actionable indicators and a continuous improvement routine.',
      'services.supply.text': 'A connected chain with better service levels, balanced inventory and agility.',
      'services.materials.title': 'Materials planning',
      'services.materials.text': 'Greater confidence when planning demand, materials, capacity and production priorities.',
      'services.bi.text': 'Clear data, relevant dashboards and decisions guided by reliable information.',
      'method.eyebrow': 'How we work',
      'method.title': 'A partnership that turns intent into results.',
      'method.lead': 'We combine analytical depth and hands-on execution to create progress that teams can see in daily operations.',
      'method.step1.title': 'We understand the context',
      'method.step1.text': 'Listening, diagnosis and an objective assessment of the challenges.',
      'method.step2.title': 'We build the path',
      'method.step2.text': 'Priorities, targets and a plan grounded in the reality of the business.',
      'method.step3.title': 'We implement together',
      'method.step3.text': 'Execution rhythm, follow-up and autonomy for the team.',
      'presence.imageAlt': 'Contemporary corporate setting with a meeting room',
      'presence.eyebrow': 'Strategy made visible in practice',
      'presence.title': 'A vision that connects people, processes and results.',
      'presence.text': 'High-performance environments grow from clear decisions, consistent execution and partners who understand the realities of the business.',
      'presence.link': 'Discover how we work',
      'contact.eyebrow': 'Let’s talk',
      'contact.title': 'Your next result can start now.',
      'contact.text': 'Tell us what your operation needs to solve. Veltrian turns challenges into a clear direction.',
      'contact.whatsappAria': 'Talk to Veltrian on WhatsApp at +55 16 99792-9477',
      'contact.email': 'Email',
      'contact.emailAria': 'Email joaopaulo@veltrian.com.br',
      'footer.home': 'Back to the top',
      'footer.rights': 'All rights reserved.'
    }
  };

  const localeCodes = { pt: 'pt-BR', es: 'es', en: 'en' };
  const whatsappMessages = {
    pt: 'Olá, gostaria de conversar com a Veltrian.',
    es: 'Hola, me gustaría conversar con Veltrian.',
    en: 'Hello, I would like to talk to Veltrian.'
  };
  const header = document.querySelector('[data-header]');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const description = document.querySelector('meta[name="description"]');
  const whatsapp = document.querySelector('[data-contact-whatsapp]');
  let language = 'pt';

  try {
    const storedLanguage = window.localStorage.getItem('veltrian-language');
    if (storedLanguage && translations[storedLanguage]) language = storedLanguage;
  } catch (_) {
    language = 'pt';
  }

  const translate = (key) => translations[language][key] ?? translations.pt[key] ?? key;

  const applyLanguage = (nextLanguage) => {
    if (!translations[nextLanguage]) return;
    language = nextLanguage;
    document.documentElement.lang = localeCodes[language];
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((element) => {
      element.innerHTML = translate(element.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
      element.alt = translate(element.dataset.i18nAlt);
    });
    document.querySelectorAll('[data-language]').forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (description) description.content = translate('meta.description');
    if (whatsapp) {
      whatsapp.href = `https://wa.me/5516997929477?text=${encodeURIComponent(whatsappMessages[language])}`;
    }
    nav?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', translate('menu.open'));
    try {
      window.localStorage.setItem('veltrian-language', language);
    } catch (_) {
      // A troca de idioma continua funcionando mesmo sem armazenamento local.
    }
  };

  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => applyLanguage(button.dataset.language));
  });

  const setHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 16);
  setHeader();
  window.addEventListener('scroll', setHeader, { passive: true });

  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') ?? false;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', translate(open ? 'menu.close' : 'menu.open'));
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', translate('menu.open'));
  }));

  document.querySelectorAll('.ano').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

  const cards = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      entry.target.style.transitionDelay = `${index * 80}ms`;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: .15 });
  cards.forEach((card) => observer.observe(card));

  applyLanguage(language);
});
