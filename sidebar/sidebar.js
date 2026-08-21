(() => {
  'use strict';

  if (window.HUB_SHARED_SIDEBAR?.active) return;

  const scriptUrl = new URL(document.currentScript?.src || 'sidebar/sidebar.js', location.href);
  const rootUrl = new URL('../', scriptUrl);
  const registryUrl = new URL('hub-registry.json', scriptUrl);
  const PREF = Object.freeze({
    collapsed: 'hubSidebarCollapsed',
    width: 'hubSidebarWidth',
    apps: 'hubSidebarAppsOpen',
    favorites: 'hubSidebarFavoritesOpen',
    links: 'hubSidebarLinksOpen',
    theme: 'hubThemeMode',
    favoritesData: 'hubFavoritesV2'
  });
  const DEFAULT_EXTERNAL_LINKS = Object.freeze([
    { id: 'portal', title: 'Portal', url: 'https://portal.ifba.edu.br/conquista', emoji: '🏫' },
    { id: 'suap', title: 'SUAP', url: 'https://suap.ifba.edu.br', emoji: '🔐' }
  ]);
  const ISSUE_REPORT_WHATSAPP = '5577981357782';

  function compactReportText(value, limit = 520) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
  }

  function buildIssueReportMessage({ title = '', context = '' } = {}) {
    let extra = {};
    try { extra = window.HUB_REPORT_CONTEXT?.() || {}; } catch {}
    const lines = [
      '🐞 Reporte de issue — HUB SI',
      '',
      `Área: ${compactReportText(extra.area || title || document.title || 'HUB SI', 120)}`,
      `Contexto: ${compactReportText(extra.context || context || currentAppId() || 'hub', 120)}`,
      extra.diagnosticId ? `Diagnostic ID: ${compactReportText(extra.diagnosticId, 80)}` : '',
      extra.mode ? `Modo: ${compactReportText(extra.mode, 60)}` : '',
      extra.detectedIntent ? `Intenção: ${compactReportText(extra.detectedIntent, 80)}` : '',
      extra.entity ? `Entidade: ${compactReportText(extra.entity, 140)}` : '',
      extra.version ? `Versão: ${compactReportText(extra.version, 100)}` : '',
      `Página: ${location.href}`,
      extra.conversationTitle ? `Conversa: ${compactReportText(extra.conversationTitle, 120)}` : '',
      extra.lastUserMessage ? `Última pergunta: ${compactReportText(extra.lastUserMessage)}` : '',
      extra.lastAssistantMessage ? `Última resposta: ${compactReportText(extra.lastAssistantMessage)}` : '',
      '',
      'Descrição do problema:',
      ''
    ].filter(line => line !== '');
    return lines.join('\n');
  }

  function setupIssueReportButton(button, options = {}) {
    if (!button || button.dataset.whatsappIssueBound) return;
    button.dataset.whatsappIssueBound = '1';
    button.addEventListener('click', () => {
      const message = buildIssueReportMessage(options);
      const href = `https://wa.me/${ISSUE_REPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
      const opened = window.open(href, '_blank', 'noopener,noreferrer');
      if (!opened) location.href = href;
    });
  }
  const FALLBACK_REGISTRY = Object.freeze(
    /* HUB REGISTRY FALLBACK START */
    {
      "schemaVersion": 2,
      "version": "2.0.33",
      "hubVersion": "0.3.9",
      "sourceOfTruth": true,
      "generatedBy": "hub-assistente-v2.0.33",
      "apps": [
        {
          "id": "app-assistente-hub",
          "title": "Assistente do HUB",
          "description": "Consulta direta de salas, horários, professores, setores e documentos do IFBA.",
          "url": "apps/assistente/",
          "category": "Assistente",
          "openMode": "new-tab",
          "emoji": "🤖",
          "icon": "🤖",
          "tags": [
            "assistente",
            "chat",
            "horários",
            "salas",
            "professores",
            "documentos",
            "IFBA"
          ]
        },
        {
          "id": "app-media-final",
          "title": "Média e Prova Final",
          "description": "Um único app com calculadora de média parcial e final, além da tabela rápida para consultar quanto é necessário tirar na prova final.",
          "url": "#media-final",
          "category": "Calculadora e tabela",
          "tags": [
            "média",
            "média final",
            "nota",
            "notas",
            "prova final",
            "tabela da final",
            "quanto preciso tirar",
            "calculadora",
            "consulta rápida",
            "app",
            "ferramenta",
            "MP",
            "PF",
            "MF"
          ],
          "emoji": "🧮",
          "icon": "🧮"
        },
        {
          "id": "barema",
          "title": "Barema de Atividades Complementares",
          "description": "Explorador e simulador das versões do Barema de Atividades Complementares, com consulta compacta, modo planilha e cálculo de limites por categoria.",
          "url": "apps/barema/",
          "category": "Barema",
          "openMode": "new-tab",
          "tags": [
            "barema",
            "atividades complementares",
            "horas complementares",
            "certificados",
            "PPC 2024",
            "estágio",
            "monitoria",
            "curso de idioma",
            "artigo",
            "evento",
            "doação de sangue",
            "DCE",
            "colegiado",
            "simulador",
            "app",
            "ferramenta"
          ],
          "emoji": "🎓",
          "icon": "🎓"
        },
        {
          "id": "calendario",
          "title": "Calendário Acadêmico 2026",
          "description": "App independente para consultar o calendário acadêmico IFBA VCA 2026 por busca, tipo de curso, cards, linha do tempo, mês, ano completo e exportação .ics.",
          "url": "apps/calendario/",
          "category": "Calendário",
          "openMode": "new-tab",
          "tags": [
            "calendário",
            "calendario",
            "acadêmico",
            "academico",
            "datas",
            "2026",
            "graduação",
            "graduacao",
            "subsequente",
            "integrado",
            "matrícula",
            "matricula",
            "trancamento",
            "provas finais",
            "feriado",
            "feriados",
            "SUAP",
            "notas",
            "colação",
            "colacao",
            "jornada pedagógica",
            "são joão",
            "sao joao",
            "app",
            "ferramenta"
          ],
          "emoji": "📅",
          "icon": "📅"
        },
        {
          "id": "fluxogramas",
          "title": "Fluxogramas Curriculares",
          "description": "App independente para navegar pelos fluxogramas curriculares dos cursos do IFBA VCA em modo interativo e também conferir os PDFs originais.",
          "url": "apps/fluxogramas/",
          "category": "Fluxogramas",
          "openMode": "new-tab",
          "tags": [
            "fluxograma",
            "fluxogramas",
            "grade curricular",
            "matriz curricular",
            "disciplinas",
            "pré-requisitos",
            "pre requisitos",
            "curso",
            "sistemas de informação",
            "engenharia elétrica",
            "engenharia mecânica",
            "engenharia civil",
            "engenharia ambiental",
            "licenciatura em química",
            "app",
            "ferramenta"
          ],
          "emoji": "🗺️",
          "icon": "🗺️"
        }
      ],
      "links": [
        {
          "id": "link-protocolo",
          "title": "Protocolo",
          "description": "Formulário de protocolo para solicitações acadêmicas.",
          "url": "https://docs.google.com/forms/d/e/1FAIpQLSfLEx2SPGF76TRT7I31dQ8ZR3N8k038rKTqti36rOpWCVjynQ/viewform?pli=1",
          "category": "Formulário",
          "tags": [
            "protocolo",
            "formulário",
            "solicitação",
            "requerimento"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-fluxograma-atual",
          "title": "Fluxograma atual",
          "description": "Fluxograma interativo da matriz 2024 de Sistemas de Informação.",
          "url": "apps/fluxogramas/#sistemas-de-informacao/matriz-2024",
          "category": "Fluxograma",
          "tags": [
            "fluxograma",
            "matriz atual",
            "grade atual",
            "PPC 2024",
            "currículo",
            "disciplinas",
            "pré-requisitos",
            "guia do universitário"
          ]
        },
        {
          "id": "link-fluxograma-antigo",
          "title": "Fluxograma antigo",
          "description": "Fluxograma interativo da matriz 2017 de Sistemas de Informação.",
          "url": "apps/fluxogramas/#sistemas-de-informacao/matriz-2017",
          "category": "Fluxograma",
          "tags": [
            "fluxograma",
            "matriz antiga",
            "grade antiga",
            "PPC 2017",
            "currículo",
            "disciplinas",
            "pré-requisitos"
          ]
        },
        {
          "id": "link-quadro-horario-2026-2",
          "title": "Quadro de horários 2026.2",
          "description": "Planilha oficial compartilhada com o quadro de horários do semestre 2026.2.",
          "url": "https://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y",
          "category": "Planilha",
          "tags": [
            "quadro de horário",
            "quadro de horarios",
            "horário",
            "2026.2",
            "aulas",
            "disciplinas",
            "planilha",
            "sharepoint",
            "semestre",
            "horários"
          ],
          "format": "XLSX",
          "openMode": "new-tab"
        },
        {
          "id": "link-calendario-app",
          "title": "Calendário Acadêmico 2026",
          "description": "Atalho direto para o app de calendário acadêmico do HUB, com busca, visualização mensal/anual e eventos do calendário IFBA VCA 2026.",
          "url": "apps/calendario/",
          "category": "App",
          "openMode": "new-tab",
          "tags": [
            "calendário",
            "calendario",
            "acadêmico",
            "academico",
            "2026",
            "datas",
            "eventos",
            "app",
            "ferramenta",
            "IFBA",
            "VCA"
          ]
        },
        {
          "id": "link-calculadora-media-app",
          "title": "Média e Prova Final",
          "description": "Atalho direto para a calculadora de média parcial, prova final e média final do HUB.",
          "url": "#media-final",
          "category": "App",
          "tags": [
            "calculadora",
            "média",
            "media",
            "nota",
            "notas",
            "prova final",
            "média final",
            "MP",
            "PF",
            "MF",
            "app",
            "ferramenta"
          ]
        },
        {
          "id": "link-barema-app",
          "title": "Barema Explorer",
          "description": "App do HUB para consultar e simular atividades complementares nas versões Barema PPC 2024 e PPC 2010-2017, com visualização interativa e planilha.",
          "url": "apps/barema/",
          "category": "App",
          "openMode": "new-tab",
          "tags": [
            "barema",
            "barema explorer",
            "atividades complementares",
            "horas complementares",
            "certificados",
            "PPC 2024",
            "PPC 2010",
            "PPC 2017",
            "planilha",
            "simulador",
            "app",
            "ferramenta"
          ]
        },
        {
          "id": "link-barema-atual-planilha",
          "title": "Planilha do Barema atual — PPC 2024",
          "description": "Arquivo XLSX do Barema de Atividades Complementares aplicável ao PPC 2024.",
          "url": "apps/barema/docs/barema-ppc-2024.xlsx",
          "category": "Planilha",
          "tags": [
            "barema",
            "barema atual",
            "atividades complementares",
            "horas complementares",
            "certificados",
            "PPC 2024",
            "planilha",
            "xlsx"
          ],
          "format": "XLSX",
          "openMode": "new-tab",
          "emoji": "📊",
          "icon": "📊"
        },
        {
          "id": "link-barema-antigo-planilha",
          "title": "Planilha do Barema antigo — matrizes 2010–2017",
          "description": "Arquivo XLSX do Barema de Atividades Complementares aplicável aos PPCs 2010-2017.",
          "url": "apps/barema/docs/barema-ppc-2010-2017.xlsx",
          "category": "Planilha",
          "tags": [
            "barema",
            "barema antigo",
            "atividades complementares",
            "horas complementares",
            "certificados",
            "PPC antigo",
            "PPC 2017",
            "planilha",
            "PPC 2010",
            "xlsx"
          ],
          "format": "XLSX",
          "openMode": "new-tab",
          "emoji": "📊",
          "icon": "📊"
        },
        {
          "id": "link-email-coordenacao",
          "title": "E-mail da Coordenação",
          "description": "Contato oficial da Coordenação do curso: csi.vdc@ifba.edu.br. Telefone: 0800 077 0084, ramal 1261.",
          "url": "mailto:csi.vdc@ifba.edu.br",
          "category": "Contato",
          "tags": [
            "coordenação",
            "contato",
            "e-mail",
            "curso",
            "SI"
          ]
        },
        {
          "id": "link-instagram-bsi",
          "title": "Instagram do curso: @bsi.vdc",
          "description": "Perfil do Bacharelado em Sistemas de Informação do IFBA Vitória da Conquista.",
          "url": "https://www.instagram.com/bsi.vdc/",
          "category": "Rede social",
          "tags": [
            "instagram",
            "curso",
            "SI",
            "notícias",
            "comunicação"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-instagram-dasi",
          "title": "Instagram DASI",
          "description": "Diretório Acadêmico de Sistemas de Informação.",
          "url": "https://www.instagram.com/dasi.ifba/",
          "category": "Rede social",
          "tags": [
            "instagram",
            "DASI",
            "diretório acadêmico",
            "estudantes"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-instagram-btech",
          "title": "Instagram BTECH",
          "description": "Empresa Júnior do curso.",
          "url": "https://www.instagram.com/btechjr/",
          "category": "Rede social",
          "tags": [
            "instagram",
            "BTECH",
            "empresa júnior",
            "estudantes"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-instagram-sinistra",
          "title": "Instagram SINISTRA",
          "description": "Atlética Acadêmica.",
          "url": "https://www.instagram.com/sinistraifba/",
          "category": "Rede social",
          "tags": [
            "instagram",
            "SINISTRA",
            "atlética",
            "esportes",
            "estudantes"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-caens-estagios",
          "title": "CAENS — Estágios",
          "description": "Página com informações e atualizações relacionadas a estágios.",
          "url": "https://ifbaconquista.blogspot.com/?m=1",
          "category": "Estágios",
          "tags": [
            "CAENS",
            "estágio",
            "estágios",
            "blog",
            "setor"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-whatsapp-capne",
          "title": "WhatsApp do CAPNE",
          "description": "Contato por WhatsApp do CAPNE.",
          "url": "https://wa.me/5577998447168",
          "category": "WhatsApp",
          "tags": [
            "CAPNE",
            "whatsapp",
            "acessibilidade",
            "inclusão",
            "contato"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-whatsapp-caens",
          "title": "WhatsApp do CAENS",
          "description": "Contato por WhatsApp do CAENS.",
          "url": "https://wa.me/5577991318174",
          "category": "WhatsApp",
          "tags": [
            "CAENS",
            "whatsapp",
            "estágio",
            "contato"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-whatsapp-cores",
          "title": "WhatsApp da CORES",
          "description": "Contato por WhatsApp da CORES.",
          "url": "https://wa.me/5577999299331",
          "category": "WhatsApp",
          "tags": [
            "CORES",
            "whatsapp",
            "contato"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-whatsapp-servicos-sociais",
          "title": "WhatsApp de Serviços Sociais",
          "description": "Contato por WhatsApp de Serviços Sociais.",
          "url": "https://wa.me/5577991318185",
          "category": "WhatsApp",
          "tags": [
            "serviços sociais",
            "assistência estudantil",
            "whatsapp",
            "contato"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-linktree-dasi",
          "title": "Linktree DASI",
          "description": "Página com links úteis do Diretório Acadêmico de Sistemas de Informação.",
          "url": "https://linktr.ee/dasi.ifba",
          "category": "Linktree",
          "tags": [
            "DASI",
            "diretório acadêmico",
            "linktree",
            "estudantes",
            "instagram"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-linktree-btech",
          "title": "Linktree BTECH",
          "description": "Página com links úteis da Empresa Júnior BTECH.",
          "url": "https://linktr.ee/btechjr",
          "category": "Linktree",
          "tags": [
            "BTECH",
            "empresa júnior",
            "linktree",
            "estudantes",
            "instagram"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-linktree-sinistra",
          "title": "LinkMe SINISTRA",
          "description": "Página com links úteis da Atlética Acadêmica SINISTRA.",
          "url": "https://linkme.bio/Sinistra",
          "category": "Linktree",
          "tags": [
            "SINISTRA",
            "atlética",
            "linktree",
            "esportes",
            "instagram"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-ensalamento-professores",
          "title": "Ensalamento dos Professores",
          "description": "Painel do Power BI para consultar ensalamento/horários de professores.",
          "url": "https://app.powerbi.com/view?r=eyJrIjoiN2JhMWNmYjMtOWRiNy00OTFlLTg5ODItMWU1ZWZhYzVhNWFjIiwidCI6IjZmZjM3NGY1LWUzZWItNGM2Zi1iN2I1LTUwOTE2NDA5MzdmOCJ9",
          "category": "Power BI",
          "tags": [
            "ensalamento",
            "professores",
            "horários",
            "horario",
            "aulas",
            "power bi",
            "painel",
            "salas"
          ],
          "openMode": "new-tab"
        },
        {
          "id": "link-provas-atividades-passadas",
          "title": "Provas e Atividades Passadas",
          "description": "Pasta no Google Drive com provas, listas e atividades antigas compartilhadas para consulta estudantil.",
          "url": "https://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA",
          "category": "Drive",
          "tags": [
            "provas passadas",
            "atividades passadas",
            "listas",
            "exercícios",
            "drive",
            "google drive",
            "materiais",
            "estudo",
            "prova"
          ],
          "openMode": "new-tab"
        }
      ],
      "externalLinks": [
        {
          "id": "portal",
          "title": "Portal",
          "url": "https://portal.ifba.edu.br/conquista",
          "emoji": "🏫",
          "icon": "🏫"
        },
        {
          "id": "suap",
          "title": "SUAP",
          "url": "https://suap.ifba.edu.br",
          "emoji": "🔐",
          "icon": "🔐"
        }
      ]
    }
    /* HUB REGISTRY FALLBACK END */
  );
  const GENERIC_APP_ICONS = new Set(['', '💼', '🧰', '📦', '🗃️', '🗂️']);
  const FORCED_APP_EMOJI_RULES = Object.freeze([
    [['assistente', 'chatbot', 'bot do hub'], '🤖'],
    [['media final', 'prova final', 'calculadora', 'calculo da media'], '🧮'],
    [['barema', 'atividade complementar'], '🎓'],
    [['calendario'], '📅'],
    [['fluxograma', 'matriz curricular'], '🗺️'],
    [['doom', 'jogo'], '🎮']
  ]);
  const APP_EMOJI_RULES = Object.freeze([
    [['horario'], '🕒'],
    [['sala'], '🚪'],
    [['professor', 'docente'], '👨‍🏫'],
    [['biblioteca'], '📚'],
    [['documento', 'acervo', 'arquivo', 'leitor pdf'], '📄'],
    [['estagio'], '💼'],
    [['tcc', 'trabalho de conclusao'], '📝'],
    [['setor', 'contato'], '☎️'],
    [['mapa'], '🗺️'],
    [['acessibilidade'], '♿'],
    [['link'], '🔗']
  ]);

  const read = (key, fallback = '') => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const isExternal = value => window.HUB_URLS?.isExternal?.(value) ?? /^(?:https?:|mailto:|tel:)/i.test(String(value || ''));
  const linkTargetAttrs = (item = {}, href = '') => {
    const raw = String(item.url || item.href || '').trim();
    if (raw.startsWith('#')) return '';
    const newTab = item.openMode === 'new-tab' || item.target === '_blank' || item.newTab === true || isExternal(href);
    return newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
  };
  const rootHref = value => window.HUB_URLS?.resolve?.(value, { root:rootUrl }) || (() => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (isExternal(raw)) return raw;
    if (raw.startsWith('#')) return new URL(`index.html${raw}`, rootUrl).href;
    return new URL(raw.replace(/^\.\//, ''), rootUrl).href;
  })();
  const currentRelativePath = (() => {
    try { return decodeURIComponent(location.pathname).replace(decodeURIComponent(rootUrl.pathname), '').replace(/^\//, ''); }
    catch { return location.pathname; }
  })();

  let registry = FALLBACK_REGISTRY;
  let width = 276;

  function currentAppId() {
    const match = (registry.apps || []).find(app => {
      const target = String(app.url || '').split(/[?#]/)[0].replace(/^\.\//, '').replace(/\/$/, '');
      return target && currentRelativePath.replace(/\/$/, '').startsWith(target);
    });
    return match?.id || '';
  }

  function shellMarkup() {
    return `
      <header class="mobile-topbar">
        <a class="brand" href="${escapeHtml(rootHref('index.html#inicio'))}" aria-label="Ir para o início"><span class="brand-mark"><img src="${escapeHtml(rootHref('assets/logo-pixel.png'))}" alt="Logo HUB SI"></span><span class="brand-text"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a>
        <span id="hubMobileNetworkStatus" class="hub-mobile-network-status" role="status" hidden></span><div class="mobile-header-actions"><button id="mobileThemeButton" class="mobile-icon-button" type="button" aria-label="Escolher tema" aria-expanded="false" aria-controls="mobileThemeMenu">◐</button><div id="mobileThemeMenu" class="mobile-theme-menu" hidden><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div><button id="mobileSidebarToggle" class="mobile-icon-button" type="button" aria-controls="siteSidebar" aria-expanded="false" aria-label="Abrir menu">☰</button></div>
      </header>
      <aside id="siteSidebar" class="site-sidebar" aria-label="Menu principal">
        <div class="sidebar-head"><a class="brand sidebar-brand" href="${escapeHtml(rootHref('index.html#inicio'))}" aria-label="Ir para o início"><span class="brand-mark"><img src="${escapeHtml(rootHref('assets/logo-pixel.png'))}" alt="Logo HUB SI"></span><span class="brand-text sidebar-label"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a><button id="sidebarCollapseButton" class="sidebar-collapse" type="button" aria-label="Ocultar menu" title="Ocultar menu">‹</button><button id="mobileSidebarClose" class="sidebar-mobile-close" type="button" aria-label="Fechar menu">×</button></div>
        <nav class="sidebar-nav" aria-label="Navegação principal">
          <form id="sidebarSearchForm" class="sidebar-search-form" role="search" aria-label="Buscar no HUB"><button id="sidebarSearchButton" class="sidebar-search-submit" type="submit" aria-label="Buscar" title="Buscar"><span aria-hidden="true">🔍</span></button><input id="sidebarSearchInput" type="search" autocomplete="off" placeholder="Buscar no HUB..." aria-label="Buscar documentos, apps, links e contatos"></form>
          <div id="hubNetworkStatus" class="hub-network-status" role="status" aria-live="polite" hidden></div>
          <a href="${escapeHtml(rootHref('index.html#inicio'))}"><span class="nav-icon" aria-hidden="true">🏠</span><span class="sidebar-label">Início</span></a>
          <a href="${escapeHtml(rootHref('index.html#acervo'))}"><span class="nav-icon" aria-hidden="true">🗂️</span><span class="sidebar-label">Acervo</span></a>
          <div class="sidebar-menu-group" data-sidebar-group="apps"><div class="sidebar-menu-row"><a id="appsSectionLink" class="sidebar-menu-link" href="${escapeHtml(rootHref('index.html#apps'))}"><span class="nav-icon" aria-hidden="true">🧰</span><span class="sidebar-label">Apps</span></a><button id="appsMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="true" aria-controls="appsMenu" aria-label="Mostrar ou ocultar apps"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="appsMenu" class="sidebar-submenu sidebar-apps-list" aria-label="Aplicativos"></div></div>
          <div class="sidebar-menu-group sidebar-links-group" data-sidebar-group="links"><div class="sidebar-menu-row"><a id="linksSectionLink" class="sidebar-menu-link" href="${escapeHtml(rootHref('index.html#links'))}"><span class="nav-icon" aria-hidden="true">🔗</span><span class="sidebar-label">Links</span></a><button id="linksMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="false" aria-controls="sidebarLinksList" aria-label="Mostrar ou ocultar links"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="sidebarLinksList" class="sidebar-submenu sidebar-links-list" aria-label="Links externos"></div></div>
          <div class="sidebar-menu-group" data-sidebar-group="favorites"><button id="favoritesMenuToggle" class="sidebar-menu-toggle" type="button" aria-expanded="true" aria-controls="sidebarFavoritesList"><span class="nav-icon" aria-hidden="true">⭐</span><span class="sidebar-label">Favoritos</span><span id="sidebarFavoritesCount" class="sidebar-count" aria-label="0 favoritos">0</span><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button><div id="sidebarFavoritesList" class="sidebar-submenu sidebar-favorites-list" aria-live="polite"></div></div>
        </nav>
        <div class="sidebar-bottom"><div class="sidebar-utility-actions"><button id="reportIssueButton" class="reset-preferences" type="button" aria-label="Relatar problema" title="Relatar problema"><span class="reset-preferences-icon" aria-hidden="true">🐞</span><span class="preference-label">Reportar</span></button><button id="resetPreferencesButton" class="reset-preferences" type="button" aria-label="Restaurar preferências" title="Restaurar preferências"><span class="reset-preferences-icon" aria-hidden="true">↺</span><span class="preference-label">Redefinir</span></button></div><div class="theme-panel"><span class="theme-label">Tema</span><div class="theme-switch" role="group" aria-label="Tema do site"><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div></div><div id="sidebarExternalLinks" class="sidebar-external-links" aria-label="Sistemas institucionais"></div></div>
        <div id="sidebarResizeHandle" class="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Redimensionar menu lateral" tabindex="0"></div>
      </aside>
      <button id="sidebarReopenButton" class="sidebar-reopen" type="button" aria-label="Mostrar menu" title="Mostrar menu">›</button><div id="sidebarOverlay" class="sidebar-overlay" aria-hidden="true"></div>
      <dialog id="hubResetDialog" class="hub-reset-dialog" aria-labelledby="hubResetTitle">
        <form method="dialog" id="hubResetForm">
          <header><strong id="hubResetTitle">Redefinir dados deste navegador</strong><button value="cancel" aria-label="Fechar">×</button></header>
          <p>Escolha o que deseja apagar. Nada é removido do servidor.</p>
          <label><input type="checkbox" name="interface" checked> <span><b>Interface</b><small>Tema, largura e estado da sidebar.</small></span></label>
          <label><input type="checkbox" name="favorites"> <span><b>Favoritos</b><small>Favoritos globais do HUB e do Assistente.</small></span></label>
          <label><input type="checkbox" name="assistant"> <span><b>Histórico do Assistente</b><small>Conversa e rascunho salvos em IndexedDB.</small></span></label>
          <label><input type="checkbox" name="apps"> <span><b>Dados dos apps</b><small>Preferências e progresso locais dos demais apps.</small></span></label>
          <label class="hub-reset-all"><input type="checkbox" name="all"> <span><b>Tudo</b><small>Apaga todas as opções acima.</small></span></label>
          <footer><button value="cancel">Cancelar</button><button id="hubResetConfirm" value="default" type="button">Redefinir selecionados</button></footer>
        </form>
      </dialog>`;
  }

  function ensureMount() {
    let mount = document.getElementById('hubSidebarMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'hubSidebarMount';
      document.body.prepend(mount);
    }

    // A sidebar compartilhada é a única implementação autorizada. Qualquer shell
    // legado presente no HTML do app é removido antes de montar o componente comum.
    for (const node of document.querySelectorAll('.mobile-topbar, #siteSidebar, #sidebarReopenButton, #sidebarOverlay')) {
      if (!mount.contains(node)) node.remove();
    }
    mount.replaceChildren();
    mount.insertAdjacentHTML('afterbegin', shellMarkup());
    document.body.classList.add('hub-app-shell-ready');
    return mount;
  }

  function normalized(value = '') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function appIcon(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url, item.category].filter(Boolean).join(' '));
    for (const [keywords, emoji] of FORCED_APP_EMOJI_RULES) if (keywords.some(keyword => search.includes(keyword))) return emoji;
    const explicit = String(item.emoji || item.icon || '').trim();
    if (!GENERIC_APP_ICONS.has(explicit)) return explicit;
    for (const [keywords, emoji] of APP_EMOJI_RULES) if (keywords.some(keyword => search.includes(keyword))) return emoji;
    return '🧩';
  }

  function isObsoleteApp(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url].filter(Boolean).join(' '));
    return search.includes('onde resolvo');
  }

  function externalLinkKind(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url].filter(Boolean).join(' '));
    if (search.includes('suap')) return 'suap';
    if (search.includes('portal ifba') || search.includes('portal do ifba') || search.includes('portal ifba edu br')) return 'portal';
    return '';
  }

  function mergedExternalLinks() {
    const configured = Array.isArray(registry.externalLinks) ? registry.externalLinks : [];
    const byKind = new Map(configured.map(item => [externalLinkKind(item), item]).filter(([kind]) => kind));
    const result = DEFAULT_EXTERNAL_LINKS.map(item => ({ ...item, ...(byKind.get(item.id) || {}), id: item.id, emoji: item.emoji }));
    const known = new Set(result.map(item => normalized(item.url)));
    for (const item of configured) if (!externalLinkKind(item) && !known.has(normalized(item.url))) result.push(item);
    return result;
  }

  function renderApps() {
    const box = document.getElementById('appsMenu');
    if (!box) return;
    const current = currentAppId();
    const apps = (Array.isArray(registry.apps) ? registry.apps : []).filter(item => !isObsoleteApp(item));
    box.innerHTML = apps.map(item => {
      const href = rootHref(item.url);
      const active = item.id === current;
      return `<a class="${active ? 'active' : ''}" href="${escapeHtml(href)}"${linkTargetAttrs(item, href)}><span aria-hidden="true">${escapeHtml(appIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'App')}</span></a>`;
    }).join('');
  }

  function linkIcon(item = {}) {
    return String(item.emoji || item.icon || '🔗');
  }

  function renderLinks() {
    const box = document.getElementById('sidebarLinksList');
    if (!box) return;
    const items = registry.links || [];
    box.innerHTML = items.length ? items.map(item => {
      const href = rootHref(item.url);
      return `<a href="${escapeHtml(href)}"${linkTargetAttrs(item, href)}><span aria-hidden="true">${escapeHtml(linkIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'Link')}</span></a>`;
    }).join('') : '<p class="sidebar-empty">Nenhum atalho cadastrado.</p>';
  }

  function readFavorites() {
    const value = window.HUB_USER_STATE?.getFavorites?.() || (() => { try { return JSON.parse(read(PREF.favoritesData, '[]')); } catch { return []; } })();
    return Array.isArray(value) ? value.filter(item => item?.kind !== 'app' || !isObsoleteApp(item)) : [];
  }

  function renderFavorites() {
    const box = document.getElementById('sidebarFavoritesList');
    const count = document.getElementById('sidebarFavoritesCount');
    if (!box) return;
    const items = readFavorites();
    if (count) { count.textContent = String(items.length); count.setAttribute('aria-label', `${items.length} favoritos`); }
    box.innerHTML = items.length ? items.slice(0, 30).map(item => {
      const fallbackAssistant = item.kind === 'answer' && item.messageId ? `apps/assistente/?favorite=${encodeURIComponent(item.messageId)}` : '';
      const href = rootHref(item.url || fallbackAssistant);
      const icon = item.kind === 'document' ? '📄' : item.kind === 'app' ? appIcon(item) : item.kind === 'answer' ? '💬' : item.kind === 'tool' ? '🧰' : '🔗';
      const content = href
        ? `<a href="${escapeHtml(href)}"${linkTargetAttrs(item, href)}><span aria-hidden="true">${escapeHtml(icon)}</span><span class="sidebar-label">${escapeHtml(item.title || 'Favorito')}</span></a>`
        : `<span class="sidebar-favorite-static"><span aria-hidden="true">${escapeHtml(icon)}</span><span class="sidebar-label">${escapeHtml(item.title || 'Favorito')}</span></span>`;
      return `<div class="sidebar-favorite-row">${content}<button class="sidebar-favorite-remove" type="button" data-remove-favorite="${escapeHtml(item.id || '')}" aria-label="Remover favorito">×</button></div>`;
    }).join('') : '<p class="sidebar-empty">Nenhum favorito salvo.</p>';
  }

  function renderExternalLinks() {
    const box = document.getElementById('sidebarExternalLinks');
    if (!box) return;
    box.innerHTML = mergedExternalLinks().map(item => `<a class="campus-portal sidebar-external-link" href="${escapeHtml(rootHref(item.url))}" target="_blank" rel="noopener" title="${escapeHtml(item.title || '')}"><span aria-hidden="true">${escapeHtml(linkIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'Link')}</span></a>`).join('');
  }

  function setGroup(buttonId, panelId, key, defaultOpen) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    if (!button || !panel || button.dataset.sharedSidebarBound) return;
    button.dataset.sharedSidebarBound = '1';
    const apply = (open, persist = true) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.closest('.sidebar-menu-group')?.classList.toggle('is-open', open);
      if (persist) write(key, open ? '1' : '0');
    };
    apply(read(key, defaultOpen ? '1' : '0') === '1', false);
    button.addEventListener('click', () => apply(button.getAttribute('aria-expanded') !== 'true'));
  }

  function applyTheme(mode = read(PREF.theme, 'auto')) {
    const clean = ['auto', 'dark', 'light'].includes(mode) ? mode : 'auto';
    const resolved = clean === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : clean;
    document.documentElement.dataset.themeMode = clean;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === clean));
    const mobile = document.getElementById('mobileThemeButton');
    if (mobile) mobile.textContent = clean === 'dark' ? '☾' : clean === 'light' ? '☀' : '◐';
    write(PREF.theme, clean);
  }

  function applyWidth(value, persist = true) {
    width = Math.min(420, Math.max(72, Math.round(Number(value) || 276)));
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
    document.body.classList.toggle('sidebar-icons-only', width <= 96);
    document.documentElement.classList.toggle('sidebar-icons-only-preload', width <= 96);
    if (persist) write(PREF.width, String(width));
    return width;
  }

  function bind() {
    if (document.body.dataset.sharedSidebarBound) return;
    document.body.dataset.sharedSidebarBound = '1';
    applyWidth(read(PREF.width, '276'), false);
    document.body.classList.toggle('sidebar-collapsed', read(PREF.collapsed, '0') === '1');
    setGroup('appsMenuToggle', 'appsMenu', PREF.apps, true);
    setGroup('linksMenuToggle', 'sidebarLinksList', PREF.links, false);
    setGroup('favoritesMenuToggle', 'sidebarFavoritesList', PREF.favorites, true);
    applyTheme();

    const setCollapsed = value => { document.body.classList.toggle('sidebar-collapsed', value); write(PREF.collapsed, value ? '1' : '0'); };
    const setMobileOpen = open => {
      document.body.classList.toggle('mobile-sidebar-open', open);
      document.getElementById('mobileSidebarToggle')?.setAttribute('aria-expanded', String(open));
      document.getElementById('sidebarOverlay')?.setAttribute('aria-hidden', String(!open));
    };
    document.getElementById('sidebarCollapseButton')?.addEventListener('click', () => setCollapsed(true));
    document.getElementById('sidebarReopenButton')?.addEventListener('click', () => setCollapsed(false));
    document.getElementById('mobileSidebarToggle')?.addEventListener('click', () => setMobileOpen(!document.body.classList.contains('mobile-sidebar-open')));
    document.getElementById('mobileSidebarClose')?.addEventListener('click', () => setMobileOpen(false));
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => setMobileOpen(false));
    document.getElementById('siteSidebar')?.addEventListener('click', event => { if (event.target.closest('a') && matchMedia('(max-width:920px)').matches) setMobileOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileOpen(false); });

    const mobileThemeButton = document.getElementById('mobileThemeButton');
    const mobileThemeMenu = document.getElementById('mobileThemeMenu');
    mobileThemeButton?.addEventListener('click', event => { event.stopPropagation(); const open = Boolean(mobileThemeMenu?.hidden); if (mobileThemeMenu) mobileThemeMenu.hidden = !open; mobileThemeButton.setAttribute('aria-expanded', String(open)); });
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => { applyTheme(button.dataset.themeChoice); if (mobileThemeMenu) mobileThemeMenu.hidden = true; mobileThemeButton?.setAttribute('aria-expanded', 'false'); }));
    document.addEventListener('click', event => { if (!event.target.closest('#mobileThemeMenu, #mobileThemeButton')) { if (mobileThemeMenu) mobileThemeMenu.hidden = true; mobileThemeButton?.setAttribute('aria-expanded', 'false'); } });

    const resetDialog = document.getElementById('hubResetDialog');
    const resetForm = document.getElementById('hubResetForm');
    document.getElementById('resetPreferencesButton')?.addEventListener('click', () => {
      if (resetDialog?.showModal) resetDialog.showModal();
      else if (confirm('Redefinir todos os dados locais do HUB neste navegador?')) window.HUB_USER_STATE?.reset?.({ all:true }).then(() => location.reload());
    });
    resetForm?.querySelector('input[name="all"]')?.addEventListener('change', event => {
      resetForm.querySelectorAll('input[type="checkbox"]:not([name="all"])').forEach(input => { input.checked = event.currentTarget.checked; input.disabled = event.currentTarget.checked; });
    });
    document.getElementById('hubResetConfirm')?.addEventListener('click', async () => {
      const data = new FormData(resetForm);
      const selection = { interface:data.has('interface'), favorites:data.has('favorites'), assistant:data.has('assistant'), apps:data.has('apps'), all:data.has('all') };
      if (!Object.values(selection).some(Boolean)) return;
      await window.HUB_USER_STATE?.reset?.(selection);
      resetDialog?.close();
      location.reload();
    });
    setupIssueReportButton(document.getElementById('reportIssueButton'), { title: document.title, context: currentAppId() || 'hub' });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-favorite]');
      if (!button) return;
      if (window.HUB_USER_STATE?.removeFavorite) window.HUB_USER_STATE.removeFavorite(button.dataset.removeFavorite);
      else {
        const items = readFavorites().filter(item => String(item.id || '') !== button.dataset.removeFavorite);
        write(PREF.favoritesData, JSON.stringify(items));
      }
      renderFavorites();
    });
    // Apps legados podem gravar hubFavoritesV2 diretamente sem disparar evento.
    // Reconciliamos após cliques para manter a sidebar consistente na mesma aba.
    document.addEventListener('click', () => setTimeout(renderFavorites, 0), { passive:true });

    const resize = document.getElementById('sidebarResizeHandle');
    if (resize) {
      let dragging = false;
      resize.addEventListener('pointerdown', event => { if (matchMedia('(max-width:920px)').matches) return; dragging = true; resize.setPointerCapture(event.pointerId); document.body.classList.add('sidebar-resizing'); event.preventDefault(); });
      resize.addEventListener('pointermove', event => { if (dragging) applyWidth(event.clientX, false); });
      const finish = event => { if (!dragging) return; dragging = false; document.body.classList.remove('sidebar-resizing'); write(PREF.width, String(width)); try { resize.releasePointerCapture(event.pointerId); } catch {} };
      resize.addEventListener('pointerup', finish);
      resize.addEventListener('pointercancel', finish);
      resize.addEventListener('dblclick', () => applyWidth(276, true));
      resize.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') applyWidth(72, true); else if (event.key === 'End') applyWidth(420, true); else applyWidth(width + (event.key === 'ArrowRight' ? 10 : -10), true); });
    }

    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (read(PREF.theme, 'auto') === 'auto') applyTheme('auto'); });
    window.addEventListener('storage', event => { if (event.key === PREF.theme) applyTheme(event.newValue || 'auto'); if (event.key === PREF.favoritesData) renderFavorites(); if (event.key === PREF.width) applyWidth(event.newValue || 276, false); });
    window.addEventListener('hub:favorites-changed', renderFavorites);
  }

  function refresh() {
    renderApps();
    renderLinks();
    renderFavorites();
    renderExternalLinks();
    document.dispatchEvent(new CustomEvent('hub:sidebar-ready'));
  }

  async function loadRegistry() {
    try {
      const response = await fetch(registryUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      if (parsed && Array.isArray(parsed.apps)) registry = parsed;
    } catch (error) {
      console.warn('Registro compartilhado da sidebar indisponível:', error);
    }
    refresh();
  }

  function init() {
    ensureMount();
    bind();
    refresh();
    loadRegistry();
  }

  window.HUB_SHARED_SIDEBAR = { active: true, refresh, rootUrl: rootUrl.href };
  window.HUB_SHARED_SIDEBAR_ACTIVE = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
