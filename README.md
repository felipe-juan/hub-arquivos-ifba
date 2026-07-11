# HUB Arquivos IFBA

> [!IMPORTANT]
> ### Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional**. Ele forneceu os arquivos oficiais, descreveu os problemas, pediu ajustes, testou no navegador/localhost/GitHub Pages e decidiu a direção do produto.

O projeto deve ser tratado como uma ferramenta experimental de apoio. Para decisões acadêmicas, consulte sempre os documentos e canais oficiais do IFBA.

## Versão atual

**v0.2.13**

Esta versão estabiliza o ícone de restauração de preferências na sidebar compacta e acrescenta acessos diretos ao **Portal** e ao **SUAP**, lado a lado na sidebar normal e empilhados no modo de apenas ícones.

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
- sintaxe de pesquisa com operadores simples.

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

### Sidebar, atalhos e favoritos

No desktop, a navegação usa uma sidebar redimensionável. Ao arrastá-la totalmente para a esquerda, ela entra no modo compacto com apenas ícones. No celular, a navegação aparece em uma sidebar aberta pelo header compacto.

A sidebar inclui:

- Apps;
- Atalhos;
- Favoritos;
- tema Automático, Escuro ou Claro;
- restauração de preferências;
- acesso ao Portal do Campus e ao SUAP.

A ordem personalizada da seção **Atalhos** da página inicial é compartilhada com a sidebar e com os apps independentes. Favoritos, ordem e estados dos menus são armazenados apenas no navegador do usuário.

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
- não há botão de instalação nem interface de gerenciamento offline nesta versão.

O comportamento exato depende das políticas de cache e armazenamento do navegador.


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
├── LICENSE
├── css/
│   └── enhancements.css
├── js/
│   ├── storage.js
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
python3 scripts/generate_documents_manifest.py
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
- menus Apps, Atalhos e Favoritos abertos ou recolhidos;
- ordem personalizada dos Atalhos;
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
node --check app.js
node --check data.js
node --check js/storage.js
node --check js/where-data.js
node --check js/enhancements.js
node --check js/experience.js
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

Como o projeto utiliza service worker, use `Ctrl + Shift + R` depois de substituir os arquivos por uma nova versão.

## Como atualizar usando o ZIP

Exemplo para a v0.2.13:

```bash
cd ~/Documents/hub-arquivos-ifba

mkdir -p /tmp/hub-update
rm -rf /tmp/hub-update/*

unzip ~/Downloads/hub-arquivos-ifba-v0.2.13.zip -d /tmp/hub-update

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
git commit -m "Update to v0.2.13"
git pull --rebase origin main
git push
```

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
