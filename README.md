# HUB Arquivos IFBA

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional**. Ele forneceu os arquivos oficiais, descreveu os problemas, pediu ajustes, testou no navegador/localhost/GitHub Pages e decidiu a direção do produto.

O projeto deve ser tratado como uma ferramenta experimental de apoio. Para decisões acadêmicas, consulte sempre os documentos e canais oficiais do IFBA.

## Versão atual

**v0.2.22**

Esta versão melhora a adaptação da sidebar redimensionável: o botão **Relatar problema** acompanha a largura disponível, reduz o texto quando necessário e mantém o ícone centralizado e legível no modo compacto.

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
- navegação por teclado;
- sintaxe de pesquisa com operadores simples;
- ordenação previsível por faixas de relevância: título exato, expressão no título, palavras no título, metadados, texto e associação semântica;
- deduplicação de resultados com mesmo título e destino.

Exemplos:

- `matricula` — busca flexível, ignorando diferenças entre maiúsculas/minúsculas e acentos vocálicos;
- `marco` e `março` — termos diferentes, porque a cedilha é preservada;
- `"matriz 2024"` — expressão exata;
- `matricula AND ajuste` — exige os dois termos;
- `matricula OR trancamento` — aceita qualquer um dos termos;
- `matricula -janeiro` — exclui resultados contendo o termo indicado.

Atalhos de teclado disponíveis na busca:

- `Enter` — abre o primeiro resultado;
- `Ctrl + Enter` ou `Cmd + Enter` — abre o primeiro resultado em nova aba;
- `↓` — move o foco para o primeiro card;
- `↑`, `↓`, `←` e `→` — navegam entre resultados;
- `Home` e `End` — vão ao primeiro ou ao último resultado;
- `/` — direciona o foco para a busca;
- `Esc` — limpa a pesquisa quando o campo está em foco.

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

Exemplo para a v0.2.22:

```bash
cd ~/Documents/hub-arquivos-ifba

mkdir -p /tmp/hub-update
rm -rf /tmp/hub-update/*

unzip ~/Downloads/hub-arquivos-ifba-v0.2.22.zip -d /tmp/hub-update

rsync -a --delete \
  --exclude ".git/" \
  --exclude "documents/" \
  /tmp/hub-update/ ~/Documents/hub-arquivos-ifba/
```

O `--exclude "documents/"` preserva o Acervo principal já existente no repositório local.

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
git commit -m "Update to v0.2.22"
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

Importante: esta licença se aplica ao código do site/repositório. Documentos institucionais, PDFs, calendários acadêmicos, matrizes curriculares e outros materiais públicos ou de terceiros incluídos ou referenciados pelo projeto podem possuir regras próprias de uso e direitos autorais. Esses materiais não são automaticamente cobertos pela Licença MIT do código.

## Créditos

- **Código, estrutura, interface e lógica:** gerados por IA generativa.
- **Ideias, requisitos, testes, feedback, curadoria e direção do produto:** mantenedor humano.
- **Fontes acadêmicas:** documentos e canais oficiais do IFBA Campus Vitória da Conquista.
