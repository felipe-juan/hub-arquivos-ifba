# HUB Arquivos IFBA

> [!IMPORTANT]
> ## AVISO GRANDE: ESTE PROJETO FOI CODADO POR IA
>
> **Todo o código deste repositório foi criado por IA generativa, em especial ChatGPT/OpenAI, a partir de instruções, ideias, testes e revisões humanas.**
>
> O mantenedor humano atuou principalmente como **idealizador, testador, revisor, curador de conteúdo e validador visual/funcional**. Ele forneceu os arquivos oficiais, descreveu os problemas, pediu ajustes, testou no navegador/localhost/GitHub Pages e decidiu a direção do produto.
>
> Portanto, este projeto deve ser tratado como um **protótipo experimental assistido por IA**. Antes de usar qualquer informação para decisão acadêmica, consulte sempre as fontes oficiais do IFBA e os documentos originais.

## Versão atual

**v0.1.65**

Atualização principal: links diretos por matriz no app Fluxogramas, revisão da Matriz 2017 de Sistemas de Informação com base no PPC oficial de 2017 e atualização do card de quebra de pré-requisito.

## Sobre o projeto

**HUB Arquivos IFBA** é um site estático para organizar documentos, links e aplicativos úteis para estudantes do IFBA Campus Vitória da Conquista, com foco inicial no curso de Bacharelado em Sistemas de Informação e expansão para outros cursos do campus.

O objetivo é transformar PDFs, planilhas, links e informações acadêmicas dispersas em uma interface mais fácil de navegar, especialmente no celular.

O site funciona sem backend e pode ser publicado diretamente no **GitHub Pages**.

## Alterações recentes da v0.1.65

- O app **Fluxogramas Curriculares** agora atualiza a URL com um link direto para a matriz selecionada, por exemplo `#sistemas-de-informacao/matriz-2017`.
- Adicionado botão **Copiar link direto desta matriz** no card da matriz selecionada.
- Refeitas as relações de pré-requisito/desbloqueio da **Matriz 2017 de Sistemas de Informação** usando o PPC oficial de 2017 como referência principal.
- Adicionado o arquivo `bsi-ppc-2017.pdf` em `apps/fluxogramas/docs/` e incluído como documento oficial na aba Documento da Matriz 2017.
- Desativada a inferência automática de pré-requisitos também para `bsi2017`, para evitar relações inventadas por padrão de nomes.
- Atualizado o card **Quebra de pré-requisito** no app **Onde resolvo isso?**, deixando claro que é uma solicitação excepcional, dependente de justificativa, análise pelo colegiado e homologação pela Diretoria de Ensino.
- README atualizado nesta versão, mantendo o aviso de que o código foi gerado por IA.

## O que existe no site

### Página principal

A página inicial reúne:

- busca no acervo de documentos;
- cards de documentos;
- links úteis do campus/curso;
- calculadora de média e prova final;
- tabela rápida de nota final;
- atalhos para aplicativos independentes.

### Acervo de documentos

O Acervo usa a pasta `documents/` e o arquivo `documents/manifest.json` para listar e buscar documentos no navegador.

A busca é feita localmente no frontend, sem servidor.

### Apps independentes

Os apps ficam dentro da pasta `apps/` e são abertos em nova página/aba.

Atualmente há:

- **Calendário Acadêmico 2026**;
- **Barema Explorer**;
- **Fluxogramas Curriculares**.

## Estrutura principal do repositório

```text
hub-arquivos-ifba/
├── index.html
├── app.js
├── data.js
├── styles.css
├── README.md
├── VERSION
├── assets/
│   ├── logo-pixel.png
│   ├── logo-pixel-64.png
│   └── apple-touch-icon.png
├── documents/
│   ├── manifest.json
│   ├── manifest.csv
│   └── ... PDFs e documentos do Acervo geral
├── scripts/
│   ├── generate_documents_manifest.py
│   ├── build_index_from_txt.py
│   ├── check_index_status.py
│   └── update_documents_and_publish.sh
└── apps/
    ├── calendario-academico-ifba-vca-2026-v0.1.12.html
    ├── barema-explorer-v0.1.7.html
    ├── fluxogramas-curriculares-v0.1.19.html
    └── fluxogramas/
        └── docs/
            ├── bsi-matriz-2024.pdf
            ├── bsi-matriz-2017.pdf
            ├── bsi-optativas.pdf
            └── ... PDFs dos fluxogramas
```

## Aviso sobre fontes oficiais

Este site não substitui:

- Coordenação de curso;
- IFBA Campus Vitória da Conquista;
- SUAP;
- editais oficiais;
- PPCs oficiais;
- calendários acadêmicos publicados pela instituição;
- documentos assinados ou publicados nos canais institucionais.

Sempre confira o PDF original e a fonte oficial antes de tomar qualquer decisão acadêmica.

## Como rodar localmente

Entre na pasta do projeto:

```bash
cd ~/Documents/hub-arquivos-ifba
```

Rode um servidor local simples:

```bash
python3 -m http.server 8003
```

Abra no navegador:

```text
http://localhost:8003/
```

Se a porta estiver ocupada, use outra:

```bash
python3 -m http.server 8004
```

Para descobrir e matar um servidor que já está usando uma porta:

```bash
fuser -k 8003/tcp
```

## Como atualizar o site usando um ZIP novo

Se você recebeu um ZIP novo, por exemplo:

```text
~/Downloads/hub-arquivos-ifba-v0.1.65.zip
```

Use este processo manual seguro:

```bash
cd ~/Documents/hub-arquivos-ifba

mkdir -p /tmp/hub-update
rm -rf /tmp/hub-update/*

unzip ~/Downloads/hub-arquivos-ifba-v0.1.65.zip -d /tmp/hub-update

rsync -a --delete \
  --exclude ".git/" \
  --exclude "documents/" \
  /tmp/hub-update/ ~/Documents/hub-arquivos-ifba/
```

O `--exclude "documents/"` preserva o Acervo principal para evitar apagar documentos já publicados.

Depois teste localmente:

```bash
cd ~/Documents/hub-arquivos-ifba
python3 -m http.server 8003
```

## Como publicar no GitHub Pages

Depois de testar:

```bash
cd ~/Documents/hub-arquivos-ifba
git status
git add .
git commit -m "Update HUB Arquivos IFBA"
git push
```

Se o GitHub Pages estiver configurado para a branch principal, a publicação acontece depois do `git push`.

## Pasta `documents/`: Acervo geral

A pasta `documents/` guarda os PDFs e documentos do Acervo principal do site.

Ela é diferente da pasta dos PDFs dos fluxogramas.

Use `documents/` para documentos que devem aparecer na busca geral do site.

Depois de adicionar, remover ou renomear documentos do Acervo, rode:

```bash
python3 scripts/generate_documents_manifest.py
```

Isso atualiza:

```text
documents/manifest.json
documents/manifest.csv
```

Arquivos auxiliares como README, planilhas de renomeação, relatórios e mapeamentos internos não devem virar documentos públicos do Acervo.

## Pasta dos PDFs dos Fluxogramas

Os PDFs usados pelo app **Fluxogramas Curriculares** ficam em:

```text
apps/fluxogramas/docs/
```

O HTML do app fica em:

```text
apps/fluxogramas-curriculares-v0.1.19.html
```

Como o HTML está dentro da pasta `apps/`, o caminho correto para apontar para os PDFs é:

```text
fluxogramas/docs/nome-do-arquivo.pdf
```

Não use:

```text
docs/nome-do-arquivo.pdf
apps/docs/nome-do-arquivo.pdf
fluxogramas/fluxogramas/docs/nome-do-arquivo.pdf
```

### PDFs esperados pelo app Fluxogramas

```text
bsi-ppc-fluxograma.pdf
bsi-matriz-2017.pdf
bsi-optativas.pdf
bsi-matriz-2024.pdf
bsi-ementario-2024.pdf
engenharia-mecanica-2022.pdf
engenharia-eletrica-antigo.pdf
engenharia-eletrica-optativas-2023.pdf
engenharia-eletrica-enfases-2023.pdf
engenharia-eletrica-base-2023.pdf
engenharia-civil-2023.pdf
licenciatura-quimica-2017.pdf
licenciatura-quimica-2023.pdf
engenharia-ambiental-2014.pdf
engenharia-ambiental-2022.pdf
```

Se algum arquivo for renomeado, o HTML do app também precisa ser atualizado.

### Corrigir erro 404 nos PDFs dos fluxogramas

Se o modo Documento mostrar erro 404, confira primeiro se o caminho duplicou:

```bash
grep -n "fluxogramas/fluxogramas" apps/fluxogramas-curriculares-v0.1.19.html
```

Se aparecer resultado, corrija com:

```bash
sed -i 's#fluxogramas/fluxogramas/docs/#fluxogramas/docs/#g' apps/fluxogramas-curriculares-v0.1.19.html
```

Confira se os PDFs existem:

```bash
ls apps/fluxogramas/docs/
```

O caminho correto no navegador deve ser parecido com:

```text
http://localhost:8003/apps/fluxogramas/docs/bsi-matriz-2024.pdf
```

## App Calendário Acadêmico

Arquivo atual:

```text
apps/calendario-academico-ifba-vca-2026-v0.1.12.html
```

O app organiza datas do Calendário Acadêmico 2026 do IFBA Vitória da Conquista em modos de visualização como:

- Cards;
- Linha do tempo;
- Mês;
- Ano.

O app também possui filtros e busca compacta no topo.

## App Barema Explorer

Arquivo atual:

```text
apps/barema-explorer-v0.1.7.html
```

O app apresenta o Barema de forma navegável, com busca, categorias e simulação.

## App Fluxogramas Curriculares

Na Matriz 2024 de Sistemas de Informação, as relações de pré-requisito do modo interativo devem seguir estritamente o campo **PRÉ-REQUISITOS** do `bsi-ementario-2024.pdf`. O PDF da matriz curricular continua sendo mantido como referência visual do fluxograma, mas o ementário é a fonte principal para a lógica interativa de pré-requisitos.

Na Matriz 2017 de Sistemas de Informação, as relações de pré-requisito do modo interativo devem seguir o PPC oficial de 2017 (`bsi-ppc-2017.pdf`), especialmente o Apêndice A/Ementário. Para evitar relações inventadas, a inferência automática de pré-requisitos fica desativada para `bsi2017`.

O app Fluxogramas usa links diretos por hash para funcionar corretamente no GitHub Pages. Exemplos:

```text
apps/fluxogramas-curriculares-v0.1.19.html#sistemas-de-informacao/matriz-2024
apps/fluxogramas-curriculares-v0.1.19.html#sistemas-de-informacao/matriz-2017
```

Esse formato foi escolhido porque links do tipo `/arquivo.html/alguma-coisa` tendem a quebrar em hospedagem estática.


Arquivo atual:

```text
apps/fluxogramas-curriculares-v0.1.19.html
```

O app reúne fluxogramas/matrizes de diferentes cursos:

- Sistemas de Informação;
- Engenharia Mecânica;
- Engenharia Elétrica;
- Engenharia Civil;
- Licenciatura em Química;
- Engenharia Ambiental.

Recursos principais:

- modo interativo;
- modo documento/PDF;
- seleção por curso;
- seleção por matriz/versão;
- filtro por tipo/eixo/núcleo;
- destaque de relações de pré-requisito;
- destaque de disciplinas desbloqueadas;
- modo de caminho completo por long press/clique longo;
- legenda da matriz abaixo do fluxograma;
- cores únicas por badge/eixo/núcleo.

## Preferências salvas no navegador

O site usa `localStorage` para lembrar escolhas do usuário, como:

- curso e matriz escolhidos no Fluxogramas;
- modo Interativo/Documento;
- filtros e visualização do Calendário;
- filtros do Acervo;
- modo dos Links;
- preferências de visualização quando aplicável.

Para limpar as preferências durante testes, abra o console do navegador e rode:

```js
localStorage.clear();
```

Depois recarregue a página.

## Manutenção obrigatória do README

A partir desta fase do projeto, sempre que o site for atualizado, o `README.md` também deve ser revisado.

Mesmo que a mudança seja pequena, confira se alguma destas seções precisa de ajuste:

- versão atual;
- nomes dos apps;
- caminhos de arquivos;
- comandos de atualização;
- estrutura de pastas;
- limitações conhecidas;
- avisos importantes.

## Controle de versão

As versões seguem o padrão:

```text
v0.1.XX
```

O arquivo `VERSION` guarda a versão atual do pacote.

O rodapé do `index.html` também mostra a versão pública.

## Limitações conhecidas

- O site é estático e não possui backend.
- A busca depende de dados já presentes no manifesto local.
- O app Fluxogramas depende de dados extraídos/curados a partir dos PDFs e de validação humana das relações de pré-requisito.
- Para `bsi2024`, a fonte de verdade dos pré-requisitos é o `bsi-ementario-2024.pdf`, não apenas as setas visuais do fluxograma.
- PDFs complexos podem ter relações difíceis de validar automaticamente.
- O projeto foi gerado por IA e precisa de teste humano contínuo.

## Licença

O código-fonte deste projeto é disponibilizado sob a Licença MIT.

Importante: esta licença se aplica ao código do site/repositório. Documentos institucionais, PDFs, calendários acadêmicos, matrizes curriculares e outros materiais públicos ou de terceiros incluídos ou referenciados pelo projeto podem possuir regras próprias de uso e direitos autorais. Esses materiais não são automaticamente cobertos pela Licença MIT do código.

## Responsabilidade e validação

Este projeto é uma ferramenta de apoio. Ele tenta facilitar a consulta, mas pode conter erro de interpretação, extração, digitação ou atualização.

Antes de usar qualquer informação para matrícula, trancamento, conclusão de curso, aproveitamento, estágio, TCC ou planejamento acadêmico, confira os documentos oficiais.

## Créditos

- **Código, estrutura, interface e lógica:** gerados por IA generativa.
- **Ideias, requisitos, testes, feedback, validação visual e direção do produto:** mantenedor humano do projeto.
- **Fontes acadêmicas:** documentos oficiais fornecidos/consultados do IFBA Campus Vitória da Conquista.
