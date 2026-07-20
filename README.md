# HUB Arquivos IFBA

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional**. Ele forneceu os arquivos oficiais, descreveu os problemas, pediu ajustes, testou no navegador/localhost/GitHub Pages e decidiu a direção do produto.

O projeto deve ser tratado como uma ferramenta experimental de apoio. Para decisões acadêmicas, consulte sempre os documentos e canais oficiais do IFBA.

## Versão atual

**v0.2.42**

Esta versão torna o carregamento do DOOM resiliente a falhas do CDN e prepara uma instalação local verificável do js-dos. O loader tenta a cópia local primeiro, usa múltiplas fontes remotas independentes como contingência e registra com precisão qual fonte falhou. Para publicar sem depender de terceiros, execute `bash scripts/vendor_doom_assets.sh` antes do commit.

## Sobre o projeto

O **HUB Arquivos IFBA** é um site estático criado para reunir documentos, links e ferramentas úteis para estudantes do IFBA Campus Vitória da Conquista. O foco inicial é o curso de Bacharelado em Sistemas de Informação, com recursos que também atendem a outros cursos do campus.

O projeto não possui backend. A interface, a busca, as preferências e os aplicativos funcionam no navegador e podem ser publicados diretamente no GitHub Pages.

## Recursos principais

### Busca geral

A busca localiza documentos, links, contatos, apps e respostas rápidas. Ela também oferece:

- resultados em Cards ou Diretório;
- quantidade configurável de colunas no desktop;
- trechos centrados no termo pesquisado;
- miniatura da primeira página quando há espaço suficiente;
- download direto, prévia, abertura e favoritos;
- pesquisas salvas;
- URLs compartilháveis, como `?q=calendario+academico`;
- restauração de consulta, filtros, visualização, página, prévia e rolagem pelos botões Voltar/Avançar;
- sugestões contextuais quando nenhum resultado é encontrado;
- navegação por teclado;
- sintaxe de pesquisa com operadores simples;
- ordenação previsível por faixas de relevância: título exato, expressão no título, palavras no título, metadados, texto e associação semântica;
- deduplicação de resultados com mesmo título e destino.

Exemplos:

- `matricula` e `matrícula` — busca flexível, ignorando diferenças entre maiúsculas/minúsculas e acentos vocálicos;
- `matriclua` ou `matricul` — correção conservadora para **matrícula**, sempre declarada acima dos resultados;
- `resolucao` e `resolução` — busca flexível equivalente, incluindo cedilha e acentos; expressões entre aspas continuam estritas;
- `"matriz 2024"` — expressão exata;
- `matricula AND ajuste` — exige os dois termos;
- `matricula OR trancamento` — aceita qualquer um dos termos;
- `matricula -janeiro` — exclui resultados contendo o termo indicado.

Atalhos de teclado disponíveis na busca, em computadores:

- `/` — direciona o foco para a busca principal;
- `Ctrl + K` ou `Cmd + K` — abre a busca rápida;
- `Esc` — fecha a prévia aberta ou limpa a consulta;
- `↑` e `↓` — percorrem os resultados;
- `Enter` — abre o resultado selecionado;
- `Ctrl + Enter` ou `Cmd + Enter` — abre o resultado em nova aba;
- `←`, `→`, `Home` e `End` — continuam disponíveis quando o foco está nos cards.

### Apps acadêmicos

- **Média e Prova Final** — calculadora e tabela em um único app;
- **Onde resolvo isso?** — orientações rápidas sobre setores, documentos e canais;
- **Calendário Acadêmico 2026** — visualizações em linha do tempo, mês, ano, cards e documento oficial;
- **Barema Explorer** — consulta e simulação de atividades complementares;
- **Fluxogramas Curriculares** — matrizes interativas e visualização dos PDFs oficiais.

### Acervo

O Acervo possui duas visualizações:

- **Grade:** cards com miniatura, metadados, prévia, abertura, download e favorito;
- **Diretório:** tabela semelhante a um gerenciador de arquivos, com paginação, ordenação, número de linhas e colunas redimensionáveis.

No Diretório, é possível ordenar diretamente pelos cabeçalhos de nome, categoria, data e tamanho.

### Sidebar, links e favoritos

No desktop, a navegação usa uma sidebar redimensionável. Ao arrastá-la totalmente para a esquerda, ela entra no modo compacto com apenas ícones. No celular, a navegação aparece em uma sidebar aberta pelo header compacto.

A sidebar inclui:

- busca rápida global como primeiro elemento, com até três resultados instantâneos e acesso direto à busca completa do Acervo;
- Início, identificado pelo ícone de casa;
- Apps;
- Links;
- Favoritos;
- tema Automático, Escuro ou Claro;
- restauração de preferências;
- acesso ao Portal do Campus e ao SUAP.

A ordem personalizada da seção **Links** da página inicial é compartilhada com a sidebar e com os apps independentes. Favoritos, ordem e estados dos menus são armazenados apenas no navegador do usuário.

### Itens recentes e paleta de comandos

A página registra de forma local os últimos documentos, apps, links e matrizes acessados. No desktop, o card **Continuar de onde parou** aparece ao lado da busca quando há histórico.

A paleta de comandos pode ser aberta por:

- `Ctrl + K`;
- `Ctrl + Shift + P`.

Ela permite localizar documentos, abrir apps, navegar para seções e executar ações do HUB usando o teclado.

### Funcionamento offline

O site utiliza um `service-worker.js` para armazenar recursos essenciais no cache do navegador.

- a página principal e os recursos essenciais ficam disponíveis após a primeira visita;
- apps acessados podem continuar funcionando sem conexão;
- PDFs e planilhas podem ficar disponíveis depois de serem abertos ao menos uma vez com internet;
- não há botão de instalação nem interface de gerenciamento offline nesta versão;
- PDFs e planilhas não são pré-carregados: entram no cache somente após a primeira abertura;
- quando uma nova versão do site é detectada, o HUB oferece o botão **Atualizar agora** em vez de depender de `Ctrl + Shift + R`.

O comportamento exato depende das políticas de cache e armazenamento do navegador.





## Alterações da v0.2.42

- Corrigida a tela “O emulador não pôde ser baixado”, causada pela dependência exclusiva dos endpoints do domínio `v8.js-dos.com`.
- O loader usa o endpoint oficial `latest` primeiro, mantém a versão 8.4.1 fixada como contingência e acrescenta jsDelivr e UNPKG como fontes independentes do pacote npm.
- O fallback 6.22 passou a usar os endpoints atuais documentados e mantém o arquivo do DOSBox correspondente à fonte carregada.
- Falhas de carregamento agora identificam cada fonte tentada, distinguindo timeout, bloqueio de rede e script que não criou `window.Dos`.
- `scripts/vendor_doom_assets.sh` instala `js-dos` e `emulators` na mesma versão 8.4.1, baixa o bundle em área temporária, valida ZIP, configuração e WebAssembly e só substitui uma instalação anterior após sucesso completo.
- Criado `scripts/check_doom_runtime.py`, que confere arquivos obrigatórios, integridade do bundle e checksums antes da publicação.
- O runtime local é a configuração recomendada para o GitHub Pages, removendo a dependência operacional de CDNs durante o jogo.

## Alterações da v0.2.38

- WASD passou a ser enviado diretamente pela `CommandInterface`, sem depender do foco ou dos listeners internos do canvas.
- W/S avançam e recuam; A/D combinam `strafe` com esquerda/direita para deslocamento lateral no padrão moderno de FPS.
- Fontes simultâneas de uma mesma ação são rastreadas separadamente, evitando que soltar A interrompa o strafe enquanto D ainda está pressionado, e vice-versa.
- Ctrl esquerdo e direito são roteados explicitamente para atirar.
- Ao iniciar um disparo por Ctrl ou pelo botão móvel **ATIRAR**, o HUB também envia um pulso de Enter, permitindo selecionar opções dos menus com o mesmo comando de tiro.
- Espaço é roteado explicitamente para usar objetos, acionar mecanismos e abrir portas.
- Enter confirma menus e Esc abre/fecha o menu por meio do mesmo roteamento controlado.
- A ajuda desktop agora mostra **Ctrl ou Mouse 1**, **Espaço**, **Enter** e **Esc**, com descrições completas.
- Atualizado o teste de regressão para simular Ctrl, WASD, Espaço, Enter e múltiplas fontes simultâneas.
- Atualizados versão, service worker, monitor de desempenho, documentação e assets com hash.

## Alterações da v0.2.37

- Desativados os controles virtuais nativos presentes no bundle do js-dos, evitando joystick e botões duplicados sob o HUD do HUB.
- O player v8 agora usa modo kiosk, escala nativa de controles zerada e configuração de camadas móveis vazia.
- O HUD customizado só entra no estado pronto após o evento `ci-ready`, quando a `CommandInterface` realmente pode receber teclas.
- Adicionado botão **OK**, mapeado para Enter, para abrir o menu inicial e confirmar opções dentro do DOOM.
- O joystick continua usando cima/baixo para navegar nos menus; **MENU** envia Esc para voltar.
- Corrigida a limpeza de ponteiros dos botões mantidos pressionados quando a aba perde foco, evitando botões visualmente presos.
- Corrigido o posicionamento de MENU/ARMA e da área de visão no modo canhoto em orientação horizontal.
- O WASD exibido no painel desktop agora é funcional: W/A/S/D são convertidos para os comandos direcionais do DOOM.
- Removida a memória permanente de descoberta do Easter Egg. Cada nova abertura exige pesquisar `doom`, selecionar o resultado oculto e passar pela transição.
- A página do jogo aceita apenas uma autorização temporária emitida pelo resultado da busca; acesso direto ou recarga posterior volta para a pesquisa.
- Atualizados testes de regressão, validação estrutural, versão, cache e assets com hash.

## Alterações da v0.2.36

- O painel de controles do DOOM apresenta o movimento em layout WASD, com W acima de A/S/D.

- O seletor **Rápida / Detalhada** passou de uma coluna flexível para uma coluna `max-content`.
- O pill usa `width: fit-content`, impedindo expansão artificial em telas muito largas ou com zoom reduzido.
- **Colunas**, **Personalizar ordem** e **Restaurar padrão** continuam na mesma fileira no desktop.
- O rótulo inicial foi reduzido para **Colunas**, inclusive antes da inicialização do JavaScript.
- Adicionado teste de regressão para impedir que o seletor volte a usar largura fracionária.
- Atualizados `VERSION`, cache, assets com hash, documentação e validação contínua para v0.2.36.

## Alterações da v0.2.34

- Os controles de Links permanecem em uma única fileira no desktop; o rótulo contextual foi simplificado para **Colunas**.
- Os cinco Apps da página inicial permanecem em uma única linha no desktop, sem ocultar o quinto item atrás de “Ver mais”.
- O visualizador PDF recebeu o modo **Contínuo**, que organiza todas as páginas em uma única coluna navegável por rolagem do mouse ou gesto vertical.
- O modo contínuo mantém página atual, campo numérico, Voltar/Avançar, URL compartilhável, destaques e preferência local sincronizados com a rolagem.
- Páginas do modo contínuo são renderizadas progressivamente perto do viewport, com concorrência limitada e descarte LRU para evitar uso ilimitado de memória.
- Corrigida uma condição de corrida que podia iniciar duas renderizações da mesma página contínua durante mudanças rápidas de viewport.
- O fallback sem `IntersectionObserver` agenda apenas páginas próximas à posição atual, e a LRU não perde o rastreamento de páginas ainda visíveis.
- Adicionados testes de regressão para a fileira dos controles, os cinco Apps e o ciclo de vida do modo contínuo.
- Buscas assíncronas agora usam uma geração própria: respostas antigas não podem substituir uma consulta mais recente, o resultado secreto do DOOM ou uma restauração posterior do histórico.
- Restaurações rápidas pelos botões Voltar/Avançar descartam operações obsoletas e mantêm consulta, filtros, página, prévia, expansão e rolagem coerentes.
- Aberturas concorrentes de documentos recebem uma geração independente; um carregamento lento não pode abrir por cima do documento selecionado depois.
- A prévia distingue entradas criadas com `pushState` de aberturas compartilhadas por substituição, evitando que Fechar abandone o HUB.
- O modal de prévia recebeu foco inicial, retorno de foco, contenção de `Tab`, bloqueio dos atalhos globais enquanto aberto e descarte seguro de hidratações antigas.
- A renderização incremental por chaves passou a considerar conteúdo, trechos, URLs e metadados completos, evitando cards reutilizados com dados desatualizados.
- O visualizador remove promessas rejeitadas das LRUs, limpa o segundo ponteiro fantasma após pinch e restaura o estado visual ao entrar ou sair do BFCache.
- Botões touch do DOOM capturam o ponteiro, evitando ações presas quando o dedo desliza para fora do botão.
- O índice completo de busca volta a ser tentado após falhas transitórias; timeout de inicialização encerra o Worker defeituoso e permite uma nova criação posterior.
- Requisições opcionais e instalação do shell receberam timeout. Metadados não mantêm uma navegação indefinidamente pendente em rede instável.
- Navegações offline com parâmetros compartilháveis usam o shell correto; visualizador e apps recebem seus próprios fallbacks.
- Estratégias do service worker consultam caches específicos, mantêm a recência dos limites e não recuperam o fallback de uma versão antiga por busca global.
- A solicitação `SKIP_WAITING` permanece viva por `event.waitUntil`, tornando a troca de versão mais confiável.
- A busca rápida lateral tenta primeiro o catálogo resumido, evitando carregar o manifesto completo quando o índice principal não está disponível.
- Falhas fatais da inicialização principal agora aparecem como estado controlado, em vez de deixarem skeletons permanentes.
- Adicionados testes de regressão para concorrência da busca, histórico, preview, pinch, BFCache, lifecycle do Worker, cache offline, ponteiros touch e atualização incremental do DOM.
- Corrigida a auditoria de especificidade CSS, que confundia cores hexadecimais com seletores por ID e podia bloquear uma publicação sem regressão visual real.
- Atualizados `VERSION`, cache, assets com hash, documentação e orçamentos para v0.2.34.

## Alterações da v0.2.33

- Corrigidos os imports dinâmicos do `app.js` com hash: PDF.js sob demanda e fallback da busca agora resolvem a partir da pasta real do asset, sem duplicar `assets/build/` no endereço.
- Links públicos com `?doc=` ou `?share=` passam a ser executados durante a inicialização; expiração, documento ausente e abertura da prévia têm tratamento explícito.
- A normalização flexível passa a considerar também a cedilha, permitindo consultas como `resolucao`, `educacao` e suas formas acentuadas. Expressões entre aspas continuam estritas.
- O mecanismo de busca foi otimizado com vocabulário e campos reutilizados, buckets de candidatos e Damerau–Levenshtein com memória linear. O pior caso do corpus sintético caiu de cerca de 200 ms para pouco mais de 20 ms neste ambiente.
- O Web Worker de busca deixa de ser criado durante o carregamento inicial, possui timeout de inicialização, atualização e consulta, e é encerrado quando fica sem responder para que o fallback local não aguarde repetidamente.
- Miniaturas PDF agora encerram a tarefa/documento do PDF.js após renderizar; falhas e timeouts do carregador permitem nova tentativa, e páginas extraídas são limpas após uso.
- O visualizador rejeita parâmetros `file` e `returnTo` vazios, evitando tentar abrir o próprio HTML como PDF ou fazer o botão Voltar recarregar o visualizador. Páginas removidas da LRU também liberam recursos do PDF.js.
- Corrigidas mensagens de erro montadas com HTML interpolado no visualizador, DOOM, Calendário e Fluxogramas; conteúdo variável agora usa `textContent` e nós DOM.
- O service worker mantém viva a atualização `stale-while-revalidate` com `event.waitUntil` e atualiza a recência antes de limitar caches, tornando os limites de PDFs, imagens e metadados efetivamente LRU.
- O aviso pós-atualização agora informa a versão nova carregada, não a versão antiga que exibiu o botão, e evita notificações duplicadas para o mesmo worker.
- O DOOM ganhou timeout de CSS, verificação alternativa do bundle local em hosts que recusam `HEAD` e tratamento de BFCache para não destruir uma sessão preservada pelo navegador.
- Preferências de visualização e colunas dos Links são reaplicadas quando a janela cruza o limite celular/desktop; o resize é agrupado em um único frame.
- O monitor de desempenho só cria observers, coleta métricas e grava relatórios quando `?perf=1` ou o modo local foi explicitamente ativado.
- O verificador do host publicado passa a reconhecer respostas HTML comprimidas por gzip/Brotli, usa a versão real de `VERSION` e testa revalidação também nas páginas dos apps.
- Calendário, Fluxogramas, recentes e restauração de preferências toleram navegadores com armazenamento local bloqueado; a sincronização visual dos favoritos é agrupada por frame para evitar varreduras repetidas durante grandes atualizações do DOM.
- A instalação do service worker diferencia o shell essencial dos recursos offline opcionais: uma falha isolada em um app não bloqueia toda a atualização do HUB.
- O script de publicação e o CI também verificam sintaxe de todos os JavaScripts, scripts Python e fluxo Bash antes do push.
- Todos os botões estáticos receberam `type` explícito; erros dos apps não usam mais handlers inline.
- Adicionados testes de regressão para busca, segurança do markup, ciclo de vida do runtime, links públicos, resolução de assets de produção e preferências responsivas.
- Atualizados `VERSION`, cache, assets com hash, documentação, CI e validações para v0.2.33.


## Alterações da v0.2.32

- A detecção móvel do DOOM agora considera `userAgentData.mobile`, user agents móveis, ponteiro coarse, ausência de hover, quantidade de pontos touch e largura efetiva do viewport; `?touch=1` e `?desktop=1` continuam disponíveis para testes.
- O HUD touch aparece automaticamente assim que a sessão móvel é iniciada, inclusive durante o carregamento do emulador, sem depender de teclado virtual.
- O joystick esquerdo passa a controlar avanço, recuo e deslocamento lateral; uma área touch à direita permite arrastar horizontalmente para olhar, seguindo o padrão de jogos móveis em primeira pessoa.
- Botões virtuais de atirar, usar, correr, strafe, menu e troca de arma continuam disponíveis, com multitouch, opacidade, sensibilidade, modo canhoto e vibração configuráveis.
- O player foi isolado abaixo do HUD por camada própria; mensagens de erro e a tela de retomada permanecem acima dos controles.
- Corrigido o intervalo em que o canvas podia existir antes da interface de comandos do js-dos: eventos touch agora possuem fallback de teclado com códigos compatíveis com o navegador.
- Corrigida a retomada após perda de foco: o painel de ajustes fecha e a camada “toque para retomar” fica acima do HUD.
- A seção Links recebeu um seletor de colunas contextual. As quantidades das visualizações **Rápida** e **Detalhada** são armazenadas separadamente, também distinguindo preferências de celular e desktop.
- A personalização de colunas é suspensa enquanto a ordem dos links está sendo editada e restaurada ao concluir.
- Adicionados testes permanentes para detecção móvel, composição do HUD, fallback de entrada e persistência das colunas dos Links.
- Atualizados `VERSION`, cache, assets com hash, documentação, CI e validações para v0.2.32.


## Alterações da v0.2.31

- Links internos iniciados por `#` nunca mais recebem `target="_blank"`, mesmo quando aparecem em listas que normalmente abrem recursos externos em nova aba.
- Os itens **Média e Prova Final** e **Onde resolvo isso?** da sidebar passam a usar navegação interna real, sem abrir uma segunda aba e sem retornar ao topo durante a inicialização.
- Criado um roteador leve para âncoras locais, compartilhado pela sidebar, cards, favoritos, busca rápida e paleta de comandos.
- O estado do histórico agora inclui `routeHash`; Voltar/Avançar restaura tanto a busca quanto a seção interna correta, sem disputar com `scrollY`.
- Pesquisas continuam usando `#buscar`, enquanto a atualização silenciosa da rolagem preserva âncoras como `#media-final`, `#onde-resolvo`, `#apps` e `#links`.
- O destino legado inexistente `#resolver` foi redirecionado para `#onde-resolvo`.
- Destinos internos receberam margem de rolagem apropriada no celular para não ficarem escondidos sob a barra superior.
- A validação passa a conferir âncoras declaradas no catálogo, o roteador interno e a ausência do padrão antigo que forçava apps internos a abrir em nova aba.
- Atualizados `VERSION`, cache, assets com hash, documentação e validações para v0.2.31.


## Alterações da v0.2.30

- O gerador passa a pré-calcular versões normalizadas de títulos, metadados, tokens e trechos. O navegador reutiliza esses campos em vez de repetir remoção de acentos, tokenização e preparação de vocabulário a cada consulta.
- O acervo foi dividido em `documents/manifest-summary.json`, carregado para exibição inicial, e `documents/search-index.json`, baixado apenas na primeira pesquisa textual ou quando um trecho precisa ser aberto. O manifesto completo continua disponível para compatibilidade e manutenção.
- A primeira consulta aguarda a sincronização do índice completo com o Web Worker; respostas antigas continuam descartadas por identificador, evitando resultados parciais ou fora de ordem.
- Resultados e linhas extensas usam virtualização nativa por viewport a partir de 48 itens, com `content-visibility`, dimensões intrínsecas e contenção. Cards e linhas são atualizados por chave e assinatura, reaproveitando nós já existentes em vez de reconstruir toda a coleção.
- O visualizador mostra primeiro uma renderização leve da página e a substitui pela versão nítida quando ela termina. Trocas de página ou escala cancelam tanto a prévia quanto o render final obsoletos; permanecem as LRU de cinco páginas/textos e três bitmaps.
- `scripts/build_production_assets.py` gera nomes com hash de conteúdo para JavaScript e CSS em `assets/build/` e `apps/build/`, reescreve HTML, imports dinâmicos, Worker e precache e produz `assets/build-manifest.json`. O build é determinístico e pode ser executado novamente sem alterar arquivos quando as fontes não mudam.
- Assets com hash recebem orientação de cache anual com `immutable`; HTML, `VERSION`, catálogo e índice textual continuam com revalidação. O service worker mantém estratégias distintas por classe de recurso e não inclui o índice pesado nem o runtime PDF no precache.
- O painel local ativado por `?perf=1` registra FCP, LCP, CLS, INP quando suportado, TTFB, tarefas longas, latência de busca, transferência, nós DOM e memória exposta pelo navegador. `PERFORMANCE_DEVICE_TESTING.md` define o roteiro comparável para Android e iPhone.
- `scripts/verify_production_host.py --url ...` testa no endereço publicado compressão Brotli/gzip, revalidação dos arquivos mutáveis e cache `immutable` dos assets com hash. A etapa depende de uma URL de produção real e não é simulada pela validação local.
- O orçamento automatizado valida a divisão dos índices, campos normalizados, virtualização, reaproveitamento de DOM, renderização progressiva, hashes, recursos iniciais e benchmark sintético de 320 documentos e 2.240 trechos.
- Atualizados `VERSION`, cache, documentação, CI e validações para v0.2.30.

## Alterações da v0.2.28

- Consultas simples recebem correção ortográfica conservadora por distância Damerau–Levenshtein, usando apenas vocabulário institucional confiável de títulos, tags, tipos, setores, apps e conceitos curados.
- A correção não é silenciosa: a interface mostra **Resultados para “…”** e evita alterar expressões entre aspas, operadores `AND`/`OR` e termos excluídos.
- Diferenças de acentuação continuam sendo normalizadas sem custo, enquanto a cedilha permanece significativa.
- Todos os trechos reais de um mesmo PDF são consolidados em um único card; correspondências vindas apenas de título, tags ou metadados não inflam artificialmente a contagem.
- Documentos com vários trechos exibem uma lista expansível com página, seção, contexto e ação direta **Abrir página**.
- O estado expandido dos trechos passa a integrar `history.state` e é restaurado pelos botões Voltar/Avançar.
- O visualizador recebe consulta, seção, documento e endereço de retorno; abre na página correta e destaca termos na camada de texto do PDF quando disponíveis.
- O botão de retorno do visualizador leva novamente à busca compartilhável e tenta centralizar o documento de origem.
- O visualizador lembra localmente a última página de cada PDF quando a abertura não indica uma página específica.
- No celular, o visualizador ganhou toolbar inferior recolhível, swipe entre páginas no zoom ajustado, duplo toque, pinch-to-zoom e arraste do documento ampliado.
- Skeletons ficaram restritos a operações com espera real: manifesto documental, miniatura PDF visível e página do visualizador em renderização. Apps e links embutidos deixam de receber placeholders artificiais.
- Mantidos os mesmos limites de desempenho da v0.2.27; a nova versão permanece dentro do orçamento automatizado.
- Atualizados `VERSION`, parâmetros de cache, documentação e validações para v0.2.28.

## Alterações da v0.2.27

- A busca principal mantém a consulta na URL por meio de `?q=...`; filtros ativos também são representados por parâmetros próprios e podem ser compartilhados.
- Os botões Voltar e Avançar restauram consulta, filtros, modo Cards/Diretório, ordenação, quantidade de linhas, página, resultado selecionado, documento em prévia, página da prévia e posição de rolagem.
- Consultas sem correspondência agora apresentam recomendações contextuais clicáveis; termos relacionados a RU, alimentação ou assistência sugerem **assistência estudantil**, **auxílio alimentação** e **CAENS**.
- Consolidada a navegação global por teclado com `/`, `Esc`, `↑`, `↓`, `Enter` e `Ctrl/Cmd + K`, sem capturar teclas dentro de campos de edição.
- Criado `performance-budget.json` com limites explícitos para JavaScript, CSS, requisições iniciais e dimensões de miniaturas.
- Criado `scripts/check_performance_budget.py`, executado também no fluxo de validação do GitHub Actions.
- Metadados documentais permanecem carregados depois da primeira pintura, e nenhum asset do emulador é carregado antes de **INICIAR DOOM**.
- O DOOM registra localmente apenas se o segredo já foi descoberto e encurta a transição cinematográfica nas visitas seguintes, sem revelar o Easter Egg na interface comum.
- O gamepad móvel ganhou ajustes persistentes de opacidade e sensibilidade, vibração opcional e disposição canhota.
- A área do jogo bloqueia rolagem acidental durante a partida, mas mantém os controles do painel de ajustes utilizáveis.
- O aviso para girar o aparelho aparece somente quando o modo retrato deixa a área de jogo realmente estreita.
- Uma falha inesperada do emulador pode acionar uma única tentativa de recuperação, com mensagem discreta e preservação do cronômetro da sessão.
- Atualizados `VERSION`, parâmetros de cache, documentação e validações para v0.2.27.

## Orçamento de desempenho

Os limites ficam em `performance-budget.json` e são verificados por `python3 scripts/check_performance_budget.py`:

- JavaScript inicial: até 270.000 bytes brutos, 70.000 gzip e 58.000 Brotli;
- CSS inicial: até 192 KiB brutos, 40.000 gzip e 34.000 Brotli;
- primeira carga: até 15 requisições, incluindo o manifesto documental adiado;
- busca sintética: mediana até 35 ms, p95 até 65 ms e pior caso até 120 ms;
- miniaturas: WebP pré-gerados de 160, 320 e 520 px, com fallback limitado a canvas de 520 × 760 px;
- visualizador PDF: cinco páginas/textos e três bitmaps na LRU, com cancelamento de renderizações antigas;
- documentos: metadados fora de `data.js`, carregados depois da primeira pintura;
- DOOM: zero requisições de engine antes de **INICIAR DOOM**.

Para cabeçalhos de compressão e cache do servidor, consulte `PERFORMANCE_HOSTING.md`.

## Alterações da v0.2.25

- A consulta exata `doom` deixou de redirecionar imediatamente e agora exibe o resultado falso **DOOM — Documento Operacional Oculto do Ministério**.
- Ao abrir o resultado, a busca simula uma falha de classificação, a tela escurece, surge **ANOMALIA DETECTADA NO ACERVO**, uma barra curta é executada e um som discreto é reproduzido após a interação do usuário.
- Criada uma tela intermediária em estilo terminal com os dados do arquivo e as ações **INICIAR DOOM** e **VOLTAR AOS ESTUDOS**.
- O emulador não é mais carregado automaticamente: rede, motor e bundle só são requisitados depois de **INICIAR DOOM**.
- Adicionado botão visível para encerrar, tela cheia aplicada ao contêiner completo, captura de teclado somente após clique e liberação automática quando a janela ou aba perde o foco.
- A sessão tenta pausar ao perder o foco e exige novo clique para retomar os controles.
- Os controles passaram a usar teclas desenhadas com `<kbd>` e uma lista organizada, em vez de uma frase corrida.
- Ao encerrar, o HUB mostra o tempo de procrastinação e oferece **Voltar para a busca**, **Jogar novamente** e **Fingir que isso nunca aconteceu**.
- A consulta, os filtros e a posição aproximada da página são preservados em `sessionStorage` para restaurar a busca ao sair do jogo.
- Mantido o carregamento em camadas: assets locais, js-dos v8.4.1, endereço `latest` e modo de compatibilidade 6.22.
- Mantida a proteção do service worker contra respostas HTML no lugar de JavaScript, CSS, WASM, workers, `.data` ou `.jsdos`.
- Atualizados `VERSION`, cache, documentação, testes responsivos e validações para v0.2.25.

## Alterações da v0.2.23

- Pesquisar exatamente `doom` na busca principal ou enviar essa consulta pela busca da sidebar abre automaticamente o Easter Egg.
- Mantida somente uma opção: **DOOM clássico**. Não há seletor de jogos, alternativas de engine nem recomendação para instalar GZDoom.
- Criada a página estável `apps/doom/`, reutilizando a sidebar, o header mobile, os temas, os botões, os cards e os espaçamentos compartilhados do HUB.
- O jogo inicia automaticamente pelo js-dos v8 e começa com uma sessão limpa, sem reaproveitar configurações antigas do emulador.
- **Reiniciar** encerra a instância atual, limpa o estado legado e inicia uma nova sessão.
- O service worker usa rede primeiro para os recursos externos do js-dos, reduzindo o risco de reutilizar uma resposta externa quebrada, com fallback do cache quando disponível.
- Atualizados `VERSION`, parâmetros de cache, documentação e validações para v0.2.23.

## Alterações da v0.2.22

- O botão **Relatar problema** agora reutiliza exatamente a mesma estrutura visual e responsiva de **Restaurar preferências**, tanto na página principal quanto nos apps independentes. Apenas ícone, texto e ação são diferentes.

- O botão **Relatar problema** passou a se adaptar à largura da sidebar da mesma forma que **Restaurar preferências**.
- O texto reduz gradualmente, usa reticências quando necessário e não força a largura da navegação.
- O ícone 🐞 mantém tamanho legível, alinhamento central e não encolhe no modo de sidebar somente com ícones.
- O mesmo comportamento foi aplicado às sidebars do Calendário, Fluxogramas e Barema.
- Atualizados `VERSION`, parâmetros de cache e `service-worker.js`.

## Alterações da v0.2.20

- Removida a sincronização residual que copiava automaticamente o texto da busca principal para a busca da sidebar.
- Os campos principal e lateral agora permanecem realmente independentes durante a digitação.
- Ao enviar uma consulta pela sidebar, ela é executada na busca completa do Acervo e o campo lateral é limpo para evitar a duplicação visual do termo.
- Atualizados `VERSION`, parâmetros de cache e `service-worker.js`.

## Alterações da v0.2.19

- A seção anteriormente chamada **Atalhos** voltou a se chamar **Links** em toda a interface, sidebar, apps e documentação.
- A busca rápida da sidebar passou a mostrar no máximo três sugestões de cada vez.
- O cabeçalho com quantidade de resultados e botão de ajuda foi removido para deixar o painel mais compacto.
- Pressionar Enter, tocar na lupa ou usar **Pesquisar no Acervo** envia a consulta para a busca detalhada; tocar diretamente em uma sugestão continua abrindo aquele item.
- No celular, o botão **Pesquisar no Acervo** fica sempre disponível no rodapé do painel quando existe uma consulta válida.
- O campo da sidebar e o campo principal deixaram de copiar texto um para o outro enquanto o usuário digita. A consulta só é transferida quando a busca detalhada é realmente executada.
- Mantida a navegação explícita pelas sugestões com toque, clique ou teclado.

## Alterações da v0.2.18

- Criado `css/design-system.css`, `js/design-system.js` e `DESIGN_SYSTEM.md` para centralizar tokens, botões, campos, superfícies, foco, avisos e ações compartilhadas entre a página principal e os apps.
- Removido código obsoleto do antigo seletor visual de escopo e adicionada a auditoria `scripts/audit_css.py` para desencorajar novos IDs, `!important` e seletores excessivamente profundos.
- Criado `scripts/update_content.py`, que recria o manifesto, apresenta um resumo de metadados e executa as validações sem fazer commit ou push automaticamente.
- A busca principal passou a ordenar resultados por faixas estáveis: título exato, expressão no título, todas as palavras no título, parte do título, metadados, trecho e associação semântica.
- Resultados duplicados com o mesmo tipo, título e destino são removidos antes da exibição.
- A justificativa do resultado distingue **trecho do documento** de **conteúdo relacionado**, evitando apresentar associação semântica como correspondência literal.
- O service worker passou a avisar quando uma nova versão está pronta. O usuário escolhe **Atualizar agora**, e recebe confirmação após a recarga.
- O cache essencial passou a incluir a página principal, os três apps e seus dados estruturados, sem pré-carregar PDFs ou planilhas grandes.
- Adicionado **Reportar problema** na sidebar da página principal e dos apps. O botão abre uma Issue do GitHub já preenchida com página, versão, tema, tamanho da tela e navegador.
- A ação **Reportar problema** também aparece na paleta de comandos.

## Alterações da v0.2.17

- A busca rápida da sidebar foi simplificada.
- Removidos do painel os blocos de pesquisas recentes e itens acessados recentemente.
- Pesquisas salvas continuam disponíveis quando o campo está vazio.
- Removido o botão visual de escopo e seu menu.
- A busca rápida pesquisa em todas as categorias por padrão; os prefixos opcionais `doc:`, `app:`, `link:` e `contato:` continuam disponíveis.
- Mantidos os resultados instantâneos, **Ver todos os resultados**, navegação por teclado e painel flutuante da sidebar compactada.
- O campo ganhou mais espaço horizontal com a retirada do controle de escopo.

## Alterações da v0.2.16

- A busca da sidebar passou a exibir um painel de resultados instantâneos sem obrigar o usuário a sair da página atual.
- São mostrados até oito resultados compactos, priorizando correspondências de título, Apps, documentos, contatos, links e, por último, conteúdo interno dos documentos.
- Quando o campo está vazio, o painel apresenta pesquisas recentes, pesquisas salvas e itens acessados recentemente.
- Adicionados escopos persistentes: Tudo, Documentos, Apps, Links e Contatos.
- A busca rápida aceita os mesmos operadores da busca principal: aspas, `AND`, `OR` e exclusão com `-termo`.
- Adicionados prefixos opcionais: `doc:`, `app:`, `link:` e `contato:`.
- O rodapé do painel oferece **Ver todos os resultados**, transferindo a consulta e o escopo para a busca detalhada da página inicial.
- A navegação pode ser feita com `↑`, `↓`, `Home`, `End`, `Enter`, `Ctrl/Cmd + Enter` e `Esc`.
- A tecla `/` direciona o foco para a busca rápida da sidebar.
- No modo compacto da sidebar, a lupa abre um painel flutuante; no celular, o painel permanece integrado ao menu lateral.
- A busca rápida foi compartilhada com Calendário, Fluxogramas e Barema, preservando pesquisas recentes, salvas, escopo e itens recentes no navegador.
- O carregamento do índice documental ocorre somente quando o usuário digita pelo menos dois caracteres, reduzindo trabalho desnecessário na abertura do site.

## Alterações da v0.2.15

- A sidebar passou a começar com um campo de busca real, em vez de apenas um link para a seção de pesquisa.
- Na página principal, a busca da sidebar atualiza diretamente os resultados; nos apps independentes, o termo é enviado para a busca global do HUB.
- No modo compacto da sidebar, a lupa abre um pequeno campo flutuante para digitação.
- O ícone do menu **Favoritos** passou a usar o emoji `⭐`.
- O botão de favoritar permanece na mesma linha de Prévia, Abrir e Baixar nos resultados do Acervo.
- O botão **Abrir** dos documentos passou a usar `document-viewer.html`, evitando que a ação seja tratada como download direto pelo navegador.
- O visualizador interno oferece navegação de páginas, zoom e download explícito.

## Alterações da v0.2.14

- Adicionado **Buscar** como primeiro item da sidebar, usando o ícone `🔍`.
- Ao abrir a busca pela sidebar, o campo principal recebe foco automaticamente.
- O item **Início** passou a usar o ícone `🏠`.
- A mesma ordem e os mesmos ícones foram aplicados às sidebars do Calendário, Fluxogramas e Barema.
- A paleta de comandos passou a apresentar **Buscar** e **Início** como destinos separados.

## Alterações da v0.2.13

- O ícone de **Restaurar preferências** mantém tamanho fixo, alinhamento central e boa legibilidade em todas as larguras da sidebar.
- O botão **Portal do Campus** foi simplificado para **Portal**.
- Adicionado acesso direto ao **SUAP** (`suap.ifba.edu.br`) com ícone próprio.
- Portal e SUAP aparecem lado a lado na sidebar normal e um abaixo do outro no modo compacto com apenas ícones.
- O mesmo comportamento foi aplicado às sidebars do Calendário, Fluxogramas e Barema.

## Alterações da v0.2.12

- Busca e **Itens recentes** passam a ocupar linhas independentes no mobile, sem sobreposição causada pelo comportamento sticky do card de busca.
- O grid mobile usa altura baseada no conteúdo e espaçamento uniforme entre os dois cards.
- Miniaturas de documentos nos resultados passam da proporção `9:16` para `1:1,414`, próxima à proporção de uma folha A4.

## Alterações da v0.2.11

- Busca e itens recentes passam a se empilhar em telas estreitas e intermediárias, evitando conteúdo além da largura disponível.
- Filtros da busca usam duas colunas em larguras intermediárias e uma coluna no celular.
- Miniaturas de documentos nos resultados preservam a proporção vertical `9:16`, inclusive quando são reduzidas.
- A visualização **Documento** do Calendário agora rola diretamente até o PDF e oculta corretamente a mensagem de carregamento.
- Espaçamentos dos painéis e cards do Calendário foram uniformizados.
- Todos os chips de eventos da visualização mensal usam texto preto no modo claro.
- Emojis dos pop-ups do Calendário foram centralizados e redimensionados corretamente.
- Botões de Prévia e os botões verde-azulados de **Onde resolvo isso?** usam texto branco no modo claro.
- A Tabela da Prova Final passou a usar uma superfície branca no modo claro, preservando as cores das faixas.

## Alterações da v0.2.10

- Fluxogramas carregam automaticamente o PDF ao selecionar **Documento** ou trocar o arquivo escolhido.
- Calendário ganhou visualização **Documento**, com carregamento automático do PDF oficial.
- Sidebars do Calendário, Barema e Fluxogramas passaram a exibir a mesma lista de Apps da página principal, incluindo **Média e Prova Final** e **Onde resolvo isso?**.
- Tema claro revisado: botões verde-escuros usam texto branco, pop-ups do Calendário acompanham o tema e eventos da visualização mensal usam texto preto.
- Controles do Calendário foram reorganizados para evitar sobreposição entre tipo de curso, busca e modos de visualização.
- Cards de resultados foram reestruturados para manter o trecho encontrado em largura total, inclusive a partir de três colunas.
- A visualização Documento dos Fluxogramas e do Calendário foi revisada para usar os caminhos corretos dos PDFs.

## Estrutura principal

```text
hub-arquivos-ifba/
├── index.html
├── app.js
├── data.js
├── styles.css
├── service-worker.js
├── offline.html
├── VERSION
├── README.md
├── DESIGN_SYSTEM.md
├── LICENSE
├── css/
│   ├── design-system.css
│   ├── sidebar-quick-search.css
│   └── enhancements.css
├── js/
│   ├── storage.js
│   ├── design-system.js
│   ├── where-data.js
│   ├── enhancements.js
│   └── experience.js
├── apps/
│   ├── doom/
│   ├── app-shell.css
│   ├── app-shell.js
│   ├── catalog.json
│   ├── calendario/
│   │   ├── index.html
│   │   ├── data/
│   │   └── docs/
│   ├── barema/
│   │   ├── index.html
│   │   ├── data/
│   │   └── docs/
│   └── fluxogramas/
│       ├── index.html
│       ├── data/
│       └── docs/
├── assets/
├── documents/
├── scripts/
│   ├── generate_documents_manifest.py
│   ├── build_index_from_txt.py
│   ├── check_index_status.py
│   ├── check_inline_scripts.py
│   ├── validate_site.py
│   ├── update_content.py
│   ├── audit_css.py
│   └── responsive_smoke_test.mjs
└── .github/workflows/
    └── validate.yml
```

Os arquivos HTML versionados que ainda existem diretamente em `apps/` servem apenas como compatibilidade/redirecionamento para os endereços estáveis.

## Endereços estáveis dos apps

```text
apps/calendario/
apps/fluxogramas/
apps/barema/
apps/doom/
```

Esses endereços devem ser usados em novos links. A versão do app pode mudar sem alterar sua URL pública.

## Acervo geral: pasta `documents/`

A pasta `documents/` guarda os arquivos que aparecem na busca e no Acervo principal.

Depois de adicionar, remover ou renomear documentos, execute:

```bash
python3 scripts/update_content.py --json-report
```

Esse comando recria o manifesto, verifica o índice, aponta metadados ausentes e executa as validações principais. Para apenas conferir o estado atual, sem recriar o manifesto:

```bash
python3 scripts/update_content.py --check-only
```

O comando atualiza:

```text
documents/manifest.json
documents/manifest.csv
```

O manifesto inclui metadados como nome, caminho, data, formato e tamanho do arquivo. Esses dados alimentam a busca e a visualização em Diretório.

## PDFs dos Fluxogramas

Os documentos usados pelo app Fluxogramas ficam em:

```text
apps/fluxogramas/docs/
```

Como o app está em `apps/fluxogramas/`, o caminho interno correto é:

```text
docs/nome-do-arquivo.pdf
```

Não use caminhos duplicados como:

```text
fluxogramas/fluxogramas/docs/nome-do-arquivo.pdf
```

Na Matriz 2024 de Sistemas de Informação, a lógica de pré-requisitos deve seguir o campo **PRÉ-REQUISITOS** do `bsi-ementario-2024.pdf`.

Na Matriz 2017, a referência principal é o PPC oficial de 2017, especialmente o ementário. A inferência automática de pré-requisitos permanece desativada para evitar relações inventadas.

Exemplos de links diretos:

```text
apps/fluxogramas/#sistemas-de-informacao/matriz-2024
apps/fluxogramas/#sistemas-de-informacao/matriz-2017
```

## Arquivos do Calendário

O PDF oficial fica em:

```text
apps/calendario/docs/calendario-academico-ifba-vca-2026.pdf
```

Os dados estruturados usados pelas visualizações ficam em:

```text
apps/calendario/data/calendar-data.js
```

Ao alterar eventos ou status de dias, os dados devem ser novamente conferidos com o PDF oficial.

## Arquivos do Barema

Os XLSX originais ficam em:

```text
apps/barema/docs/barema-ppc-2024.xlsx
apps/barema/docs/barema-ppc-2010-2017.xlsx
```

O app usa dados internos extraídos dessas planilhas e mantém os arquivos originais disponíveis para consulta e download.

## Preferências salvas no navegador

O projeto usa `localStorage` para lembrar escolhas do usuário, incluindo:

- tema Automático, Escuro ou Claro;
- sidebar aberta, compactada ou redimensionada;
- menus Apps, Links e Favoritos abertos ou recolhidos;
- ordem personalizada dos Links;
- favoritos;
- pesquisas salvas;
- itens recentes;
- visualizações e filtros do Acervo;
- ordenação, página, número de linhas e largura das colunas do Diretório;
- número de colunas dos resultados da busca;
- estado expandido ou recolhido de Apps, Acervo e Onde resolvo isso?;
- curso, matriz, documento e modo dos Fluxogramas;
- tipo de curso, visualização, busca e ordenação do Calendário;
- versão e modo do Barema.

Use **Restaurar preferências** no final da sidebar para apagar apenas as configurações do HUB e dos apps neste navegador.

## Validação antes de publicar

Execute:

```bash
python3 scripts/validate_site.py
python3 scripts/audit_css.py
node --check app.js
node --check data.js
node --check js/storage.js
node --check js/design-system.js
node --check js/where-data.js
node --check js/enhancements.js
node --check js/experience.js
node --check js/sidebar-quick-search.js
python3 scripts/check_inline_scripts.py
```

O workflow `.github/workflows/validate.yml` repete as verificações em pushes e pull requests. Ele também pode:

- verificar a sintaxe do JavaScript inline dos apps;
- abrir a página principal e os apps com Chromium;
- testar larguras de 390 px, 768 px e 1440 px;
- detectar estouro horizontal e erros JavaScript de página.

## Como rodar localmente

```bash
cd ~/Documents/hub-arquivos-ifba
python3 -m http.server 8003
```

Abra:

```text
http://localhost:8003/
```

Endereços diretos:

```text
http://localhost:8003/apps/calendario/
http://localhost:8003/apps/fluxogramas/
http://localhost:8003/apps/barema/
```

Se a porta estiver ocupada:

```bash
fuser -k 8003/tcp
```

O HUB verifica atualizações do service worker e mostra **Uma nova versão do HUB está disponível**. Use **Atualizar agora** para ativá-la. `Ctrl + Shift + R` permanece apenas como alternativa de diagnóstico.

## Como atualizar usando o ZIP

Exemplo para a v0.2.25:

```bash
cd ~/Documents/hub-arquivos-ifba

mkdir -p /tmp/hub-update
rm -rf /tmp/hub-update/*

unzip ~/Downloads/hub-arquivos-ifba-v0.2.25.zip -d /tmp/hub-update

rsync -a --delete \
  --exclude ".git/" \
  --exclude "documents/" \
  /tmp/hub-update/ ~/Documents/hub-arquivos-ifba/
```

O `--exclude "documents/"` preserva o Acervo principal já existente no repositório local.

Opcionalmente, para hospedar também o emulador e o bundle no próprio HUB:

```bash
cd ~/Documents/hub-arquivos-ifba
bash scripts/vendor_doom_assets.sh
```

Antes de publicar os arquivos baixados em um repositório público, confira os termos de redistribuição aplicáveis ao emulador e ao conteúdo do jogo.

Depois teste e publique:

```bash
cd ~/Documents/hub-arquivos-ifba
python3 -m http.server 8003
```

Em outro terminal:

```bash
cd ~/Documents/hub-arquivos-ifba
git status
git add .
git commit -m "Fix DOOM loading in v0.2.25"
git pull --rebase origin main
git push
```

## Reportar problemas

O botão **🐞 Reportar problema**, no final da sidebar, abre uma nova Issue no GitHub com o contexto técnico já preenchido. O usuário ainda precisa descrever o problema e os passos para reproduzi-lo. A ação também pode ser localizada pela paleta de comandos.

Nenhum conteúdo digitado no HUB é enviado automaticamente; a Issue só é criada quando o usuário confirma o envio no GitHub.

## Design system e CSS

Novos componentes devem seguir `DESIGN_SYSTEM.md`. O objetivo é reutilizar os tokens e componentes compartilhados antes de criar exceções por página. Execute `python3 scripts/audit_css.py` antes de publicar mudanças visuais.

## Fontes oficiais e responsabilidade

Este site não substitui:

- Coordenação de curso;
- setores administrativos do IFBA;
- SUAP;
- editais oficiais;
- PPCs e regulamentos oficiais;
- calendários acadêmicos publicados pela instituição;
- documentos assinados ou publicados nos canais institucionais.

Antes de tomar decisões sobre matrícula, trancamento, estágio, TCC, aproveitamento, quebra de pré-requisito ou conclusão de curso, confira a fonte oficial.

## Limitações conhecidas

- O site é estático e não possui backend.
- O funcionamento offline depende do cache do navegador.
- A busca depende dos dados existentes no manifesto e nos índices locais.
- O tamanho exibido no Diretório depende de o manifesto incluir esse metadado.
- Os fluxogramas interativos usam dados extraídos e curados a partir de documentos oficiais e ainda exigem validação humana.
- PDFs complexos podem gerar falhas de extração de texto ou interpretação.
- O projeto foi gerado por IA e precisa de testes humanos contínuos.

## Licença

O código-fonte deste projeto é disponibilizado sob a Licença MIT.

Importante: esta licença se aplica ao código do site/repositório. Documentos institucionais, PDFs, calendários acadêmicos, matrizes curriculares e outros materiais públicos ou de terceiros incluídos ou referenciados pelo projeto podem possuir regras próprias de uso e direitos autorais. Esses materiais não são automaticamente cobertos pela Licença MIT do código. O Easter Egg do DOOM pode utilizar emulador e bundle locais ou externos; esses componentes e o conteúdo do jogo seguem suas próprias licenças e direitos.

## Créditos

- **Código, estrutura, interface e lógica:** gerados por IA generativa.
- **Ideias, requisitos, testes, feedback, curadoria e direção do produto:** mantenedor humano.
- **Fontes acadêmicas:** documentos e canais oficiais do IFBA Campus Vitória da Conquista.
