# Arquitetura recomendada para busca robusta

O objetivo não é copiar o Paperless-ngx inteiro. O ideal é aproveitar as ideias certas e construir um fluxo menor, voltado para universidade.

## Easter Egg do DOOM — v0.2.44

A consulta exata `doom` é interceptada antes da busca comum e renderiza um único resultado anômalo dentro da grade. Consultas maiores, como `doom pdf`, continuam passando pela busca normal. A mesma regra vale quando a consulta da sidebar é enviada à busca principal.

O clique no resultado salva a consulta, filtros e posição da página em `sessionStorage`, simula uma falha de classificação e abre a transição **ANOMALIA DETECTADA NO ACERVO**. Depois disso, `apps/doom/` apresenta um terminal de confirmação. O motor só é carregado após **INICIAR DOOM**. Cada nova entrada exige novamente pesquisar e selecionar o resultado; a descoberta não fica gravada para encurtar o fluxo.

A página tenta os recursos nesta ordem:

1. runtime local validado em `apps/doom/vendor/` e bundle em `apps/doom/game/`;
2. js-dos v8.4.1 fixado e bundle público pela rede;
3. endereço `latest` para os arquivos do motor v8;
4. modo de compatibilidade js-dos 6.22.

No celular, o HUD personalizado desativa os controles nativos do js-dos. O joystick esquerdo envia simultaneamente setas e aliases WASD, usa zona morta fixa de 16% e reafirma as teclas mantidas enquanto o dedo permanece pressionado. A visão usa `sendMouseRelativeMotion` a partir do deslocamento horizontal do dedo: o usuário arrasta a área direita como em um FPS mobile, movimentos curtos recebem ganho adicional e eventos agrupados do navegador são aproveitados para maior suavidade. A sensibilidade da visão é independente do joystick.

Ao perder foco, a sessão libera entradas mantidas, tenta pausar o motor e exige retomada explícita. O encerramento mostra o tempo da sessão e pode restaurar a busca anterior.

O service worker nunca usa `offline.html` como substituto para `.js`, `.css`, `.wasm`, `.worker`, `.data` ou `.jsdos`. Requisições externas do emulador não são interceptadas pelo service worker do HUB. Os assets locais podem ser preparados com `bash scripts/vendor_doom_assets.sh` e validados por `python3 scripts/check_doom_runtime.py`.


## Tolerância, agrupamento e abertura direta — v0.2.28

A busca simples normaliza acentos e pode corrigir um erro de digitação apenas quando há uma alternativa institucional claramente dominante. O vocabulário é montado com títulos, tags, tipos documentais, setores, apps, respostas curadas e `conceptMap`; texto bruto de páginas não domina a correção. Transposições contam como uma edição, permitindo casos como `matriclua` → `matrícula`. Consultas avançadas com aspas, exclusões ou operadores explícitos não são reescritas.

A consulta digitada permanece na URL. Quando há correção, o motor usa a forma corrigida para pontuar e destacar, mas a interface anuncia **Resultados para “…”**, evitando uma mudança silenciosa.

Cada PDF produz no máximo um resultado. O agrupamento conserva somente trechos que tiveram correspondência interna real; título, tags ou metadados podem localizar o documento, mas não criam páginas fictícias. Cards com dois ou mais trechos apresentam um `<details>` expansível e o estado aberto fica em `history.state`.

Os links para `document-viewer.html` recebem `file`, `page`, `q`, `section`, `doc` e `returnTo`. O visualizador abre na página indicada, cria uma camada textual selecionável, destaca termos quando o PDF fornece texto e oferece retorno à busca com `focusDoc`. No celular, swipe muda a página somente no zoom ajustado; quando ampliado, o mesmo gesto desloca o documento. Pinch, duplo toque e toolbar inferior complementam a navegação.

Skeletons são reservados a três esperas assíncronas perceptíveis: manifesto, miniatura PDF que entrou no viewport e página em renderização. Conteúdo estático embutido é exibido imediatamente.

## Pipeline de desempenho — v0.2.38

O build gera três representações complementares do acervo:

- `documents/manifest-summary.json`: catálogo leve, sem o texto integral dos trechos, usado para cards, Diretório, filtros e metadados iniciais;
- `documents/search-index.json`: campos normalizados, vocabulário e trechos completos, carregados somente na primeira busca textual ou quando uma passagem precisa ser hidratada;
- `documents/manifest.json`: representação completa preservada para compatibilidade, inspeção e rotinas de manutenção.

Títulos, metadados e chunks já recebem formas normalizadas e tokens durante `scripts/generate_documents_manifest.py`. `js/search-engine.js` consome esses campos prontos e só usa a normalização em tempo de execução como fallback para dados antigos.

A busca principal usa `js/search-worker.js`. Antes da primeira consulta textual, o índice completo é carregado e confirmado pelo Worker. O motor executa correção, pontuação e agrupamento fora do thread principal, devolve até 160 resultados e identifica cada requisição; respostas anteriores à consulta mais recente são descartadas.

A página inicial mantém somente o núcleo de navegação no carregamento imediato. Recursos de experiência, favoritos, busca lateral, monitor de desempenho, runtime PDF, Worker e índice de trechos entram após a primeira pintura ou sob demanda.

Coleções com 48 itens ou mais recebem virtualização nativa por viewport com `content-visibility`, contenção e tamanho intrínseco. A renderização de Cards, linhas de busca, Diretório e acervo usa chaves e assinaturas: nós equivalentes são movidos/reutilizados, e apenas os itens cujo conteúdo mudou são substituídos.

O gerador cria `thumbnailUrl` e `thumbnailSrcset` para PDFs quando PyMuPDF e Pillow estão disponíveis. São geradas larguras de 160, 320 e 520 px em WebP; a primeira página via PDF.js permanece como fallback cancelável quando a miniatura deixa o viewport.

O visualizador PDF faz uma renderização de baixa resolução para resposta rápida e depois a troca por um canvas nítido produzido fora da tela. Mudança de página ou zoom cancela as duas tarefas obsoletas. LRU separadas guardam até cinco objetos de página/texto e três bitmaps renderizados, liberados ao sair.

`scripts/build_production_assets.py` cria cópias de JavaScript e CSS com hash de conteúdo em `assets/build/` e `apps/build/`, reescreve referências em HTML, imports dinâmicos, Worker e `service-worker.js`, e registra o mapeamento em `assets/build-manifest.json`. Arquivos com hash podem usar cache anual `immutable`; HTML, `VERSION` e os índices continuam revalidados.

O service worker separa caches de shell, metadados, imagens, documentos e runtime. Metadados usam stale-while-revalidate; navegações e PDFs usam network-first com fallback; assets executáveis com hash e miniaturas usam cache-first. O índice pesado, runtime PDF e recursos do emulador não pertencem ao precache inicial.

`performance-budget.json` fixa tamanhos bruto/gzip/Brotli, quantidade de requisições, arquitetura dos índices, limiares de virtualização, caches e tempos de busca. `scripts/benchmark_search.cjs` mede 320 documentos e 2.240 trechos. O CI reconstrói os assets com hash, verifica determinismo e falha quando qualquer orçamento é ultrapassado.

Para medições reais, `?perf=1` ativa um painel local descrito em `PERFORMANCE_DEVICE_TESTING.md`. Para hospedagem, `scripts/verify_production_host.py --url https://...` valida compressão e cabeçalhos no endereço efetivamente publicado.

## URL compartilhável e histórico de busca — v0.2.27

A consulta principal permanece no endereço, por exemplo `?q=calendario+academico`. Filtros diferentes de `all` também recebem parâmetros próprios. A URL contém apenas o estado que faz sentido compartilhar; detalhes transitórios permanecem em `history.state`.

Cada entrada de navegação pode restaurar:

- consulta e filtros;
- visualização Cards ou Diretório;
- ordenação, quantidade de linhas e página do Diretório;
- índice do resultado selecionado;
- documento e página abertos na prévia;
- posição vertical da página.

Digitação contínua cria uma única entrada de busca e passa a atualizá-la com `replaceState`; submissões, sugestões e pesquisas salvas criam entradas deliberadas com `pushState`. O evento `popstate` recalcula a lista a partir da fonte atual e reabre a prévia quando necessário, em vez de armazenar HTML de resultados no histórico.

## Estado vazio contextual — v0.2.27

Quando a busca não encontra correspondências, a interface repete a consulta de modo seguro e oferece até três pesquisas relacionadas. Regras institucionais específicas são priorizadas e, na ausência delas, o sistema utiliza sugestões curadas por proximidade lexical. Cada sugestão executa uma nova busca navegável e compartilhável.

## Atalhos globais — v0.2.27

Em desktop, `/` foca a busca principal; `Ctrl/Cmd + K` abre a busca rápida da sidebar; `Esc` fecha a prévia ou limpa a consulta; `↑` e `↓` selecionam resultados; `Enter` abre o selecionado. Os atalhos não interferem em `input`, `textarea`, `select` ou elementos editáveis.

## Orçamento de desempenho — v0.2.38

`performance-budget.json` é a fonte dos limites da página inicial. `scripts/check_performance_budget.py` mede tamanhos bruto, gzip e Brotli, estima requisições, valida a divisão de módulos, miniaturas, caches do visualizador e isolamento do emulador, e executa o benchmark de busca. A validação falha quando um limite é ultrapassado.

## Princípio

A IA não deve ser a autoridade. A autoridade é o documento oficial.

A busca deve retornar:

1. documento;
2. página;
3. trecho;
4. fonte;
5. data;
6. status de verificação.

## Pipeline recomendado

1. Coleta
   - baixar PDF oficial;
   - registrar URL original;
   - registrar data do documento e data de coleta.

2. Normalização
   - salvar PDF original;
   - gerar versão OCR quando necessário;
   - extrair texto por página.

3. Quebra em trechos
   - separar por página, título e seção;
   - guardar heading, número da página e texto.

4. Indexação textual
   - busca exata por palavras;
   - sinônimos acadêmicos;
   - tags.

5. Indexação semântica
   - gerar embeddings localmente;
   - guardar vetores;
   - combinar resultado textual + resultado semântico.

6. Ranking
   - priorizar fonte verificada;
   - priorizar documento mais recente;
   - priorizar página/título com correspondência forte;
   - penalizar documento antigo, arquivado ou sem fonte.

7. Exibição
   - nunca mostrar só uma resposta solta;
   - sempre mostrar trecho destacado;
   - deixar claro se o item é documento, link, app ou guia.

## Quando olhar o Paperless-ngx

Use Paperless-ngx como inspiração principalmente para:

- modelo de tags;
- tipos de documento;
- correspondentes/origens;
- fluxo de consumo de documentos;
- OCR e limpeza;
- filtros e busca.

Não vale a pena copiar o código inteiro para este projeto, porque o escopo é diferente: Paperless-ngx é um gerenciador completo de documentos pessoais/administrativos; este hub é um buscador acadêmico público e verificado.

## Independência dos campos de busca — v0.2.23

A busca rápida da sidebar e a busca detalhada do Acervo não espelham texto durante a digitação. Cada campo mantém seu próprio valor. A consulta lateral só é transferida para o campo principal quando o usuário pressiona Enter, toca na lupa ou escolhe **Pesquisar no Acervo**. Depois da transferência, o campo lateral é limpo.

## Busca rápida da sidebar (v0.2.19)

A sidebar utiliza `js/sidebar-quick-search.js` como componente compartilhado entre a página principal, Calendário, Fluxogramas e Barema.

Responsabilidades:

- mostrar até três resultados instantâneos;
- priorizar título, Apps, documentos, contatos/links e conteúdo documental;
- carregar `documents/manifest.json` apenas após dois caracteres;
- preservar a diferença entre `c` e `ç`;
- aceitar aspas, `AND`, `OR`, `-termo` e os prefixos `doc:`, `app:`, `link:` e `contato:`;
- exibir apenas pesquisas salvas quando o campo está vazio;
- pesquisar em todas as categorias por padrão, sem seletor visual de escopo;
- permitir escopos opcionais pelos prefixos `doc:`, `app:`, `link:` e `contato:`;
- transferir a consulta para a busca detalhada por Enter, pela lupa ou por **Pesquisar no Acervo**;
- manter navegação por teclado e painel flutuante na sidebar compactada;
- manter o campo lateral independente do campo principal enquanto o usuário digita;
- não exibir cabeçalho de contagem ou ajuda dentro do painel compacto.

Chaves locais usadas:

- `hubRecentSearchesV1`;
- `hubSavedSearchesV1`;
- `hubRecentItemsV1`;
- `hubSidebarPendingSavedSearchV1`.


## Faixas previsíveis de relevância — v0.2.19

A busca detalhada ordena os resultados nesta sequência:

1. título exatamente igual à consulta;
2. expressão completa ou frase entre aspas no título;
3. todas as palavras diretas no título;
4. pelo menos uma palavra direta no título;
5. categoria, tipo documental, correspondente ou outros metadados;
6. trecho interno do documento;
7. associação semântica.

A intenção detectada e os bônus específicos atuam apenas dentro da mesma faixa. Resultados com mesmo tipo, título e destino são deduplicados. A interface diferencia “trecho do documento” de “conteúdo relacionado”.
