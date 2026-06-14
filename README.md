> **Aviso importante sobre autoria**
>
> Este projeto foi desenvolvido principalmente por LLM.
>
> Todo o código, a estrutura técnica, a implementação das funcionalidades, os ajustes de interface e a maior parte das soluções técnicas presentes neste repositório foram gerados com auxílio de IA.
>
> Minha participação foi concentrada na concepção da ideia, definição do problema, escolha das funcionalidades, testes, identificação de erros, sugestões de melhoria e validação prática do resultado.
>
> Portanto, o mérito técnico da implementação não deve ser atribuído majoritariamente a mim. Este repositório representa um projeto orientado, testado e refinado por mim, mas construído em quase toda a sua parte por LLM.


# HUB Arquivos IFBA — Sistemas de Informação

Um hub público, leve e gratuito para centralizar documentos, links, contatos e ferramentas úteis do curso de **Bacharelado em Sistemas de Informação do IFBA — Campus Vitória da Conquista**.

A proposta é simples: ajudar estudantes a encontrarem rapidamente **o documento certo, o link certo, o contato certo ou a ferramenta certa**, sem precisar procurar em várias páginas diferentes.

---

## ✨ Objetivo

O HUB Arquivos IFBA foi criado para resolver um problema comum: informações acadêmicas importantes ficam espalhadas em muitos PDFs, páginas, formulários, resoluções, regulamentos e links externos.

Este projeto organiza tudo em uma interface única, com foco em:

* busca rápida;
* documentos oficiais;
* links úteis;
* contatos importantes;
* ferramentas acadêmicas;
* experiência mobile;
* funcionamento 100% gratuito com GitHub Pages.

---

## 🚀 Funcionalidades principais

### 🔎 Busca inteligente

A busca procura por:

* documentos;
* links;
* contatos;
* aplicativos;
* trechos extraídos dos documentos;
* termos equivalentes usados pelos estudantes.

Exemplos de buscas úteis:

```text
tcc
estágio
segunda chamada
perdi prova
protocolo
coordenador
whatsapp
grade antiga
matriz curricular
nota final
```

A busca também utiliza aliases simples. Por exemplo:

```text
zap do estágio → CAENS
grade antiga → matriz curricular antiga
perdi prova → segunda chamada / protocolo
```

---

### 📄 Acervo de documentos

Os documentos ficam organizados dentro da pasta:

```text
documents/
```

O site lê os documentos a partir de um manifesto gerado automaticamente:

```text
documents/manifest.json
```

Cada documento mostra apenas as informações mais importantes para o estudante:

* data;
* número total de páginas.

As tags e metadados internos podem existir para busca, mas não aparecem visualmente para evitar poluição na interface.

---

### 🖼️ Miniaturas de documentos

Sempre que possível, o site renderiza a primeira página do PDF como miniatura.

Para itens que não são documentos, o site usa emojis:

```text
🧮 Calculadora
📊 Tabela
✉️ E-mail
💬 WhatsApp
📸 Instagram
📝 Formulário
🔗 Link externo
```

---

### 🧮 Calculadora de Média Final

A calculadora permite inserir duas ou mais notas parciais.

A média parcial é calculada pela média aritmética das notas informadas:

```text
MP = média das notas parciais
```

Regras usadas:

```text
MP ≥ 7,0 → aprovado por média
2,5 ≤ MP < 7,0 → faz prova final
MP < 2,5 → reprovado sem direito à final
```

A média final é calculada por:

```text
MF = (MP × 2 + PF) / 3
```

A nota mínima necessária na prova final é:

```text
PF mínima = 15 − 2 × MP
```

O resultado usa cores para facilitar a leitura:

* verde: aprovado;
* amarelo: precisa de prova final;
* vermelho: reprovado sem direito à final.

---

### 📊 Tabela da Prova Final

A tabela de final aparece ao lado da calculadora em telas grandes e abaixo dela em dispositivos móveis.

Ela permite consultar rapidamente quanto o estudante precisa tirar na prova final a partir da média parcial.

---

### 🧭 Onde resolvo isso?

Aplicativo estilo help desk para dúvidas comuns dos estudantes.

Exemplos:

* perdi uma prova;
* quero fazer estágio;
* quero entender TCC;
* quero migrar de matriz;
* quero falar com um setor;
* quero saber qual documento comprova isso.

Cada card tenta responder:

* o que fazer;
* com quem falar;
* qual link usar;
* qual documento consultar.

---

### 🔗 Links úteis

O HUB inclui atalhos para serviços, setores e entidades estudantis, como:

* protocolo;
* coordenação;
* CAENS;
* CAPNE;
* CORES;
* serviços sociais;
* DASI;
* BTECH;
* SINISTRA;
* Instagram e Linktree/LinkMe relacionados.

---

## 📁 Estrutura do projeto

```text
hub-arquivos-ifba/
├── index.html
├── styles.css
├── app.js
├── data.js
├── assets/
│   ├── logo.png
│   └── favicon.ico
├── documents/
│   ├── manifest.json
│   ├── manifest.csv
│   ├── ppcs/
│   ├── matrizes-curriculares/
│   ├── regulamentos-bsi/
│   ├── portarias/
│   ├── normas-ifba/
│   └── diretrizes-cne/
└── scripts/
    ├── generate_documents_manifest.py
    ├── check_index_status.py
    └── update_documents_and_publish.sh
```

---

## 🧪 Como testar localmente

Entre na pasta do projeto:

```bash
cd ~/Documents/hub-arquivos-ifba
```

Rode um servidor local:

```bash
python3 -m http.server 8000
```

Abra no navegador:

```text
http://localhost:8000
```

Se a porta 8000 estiver ocupada:

```bash
fuser -k 8000/tcp
python3 -m http.server 8000
```

---

## 📄 Como adicionar documentos

Coloque os PDFs dentro da pasta `documents/`.

Exemplo:

```text
documents/ppcs/ppc-2024.pdf
documents/regulamentos-bsi/regulamento-tcc.pdf
documents/normas-ifba/naes.pdf
```

Depois gere o manifesto:

```bash
cd ~/Documents/hub-arquivos-ifba
python3 scripts/generate_documents_manifest.py
```

O script gera/atualiza:

```text
documents/manifest.json
documents/manifest.csv
```

Depois publique:

```bash
git add .
git commit -m "Update documents"
git push
```

---

## 🧠 Sobre o manifesto

O navegador não consegue listar automaticamente os arquivos dentro da pasta `documents/` em um site estático.

Por isso o projeto usa um manifesto:

```text
documents/manifest.json
```

Esse arquivo informa ao site quais documentos existem, onde estão, quantas páginas possuem, qual data foi detectada e quais trechos foram extraídos para busca.

---

## 🧹 Arquivos ignorados pelo gerador de manifesto

O gerador ignora arquivos auxiliares que não devem aparecer no site, como:

```text
LEIA-ME*
*renomeacao*
*renomeação*
*mapping*
README*
manifest.csv
manifest.json
```

Também evita duplicações no manifesto.

Se dois arquivos tiverem o mesmo conteúdo, apenas um deve aparecer no site.

---

## 🔍 Diagnóstico da indexação

Para verificar se os documentos foram indexados corretamente:

```bash
python3 scripts/check_index_status.py
```

Isso ajuda a descobrir se algum PDF está sem texto pesquisável.

Se um PDF for apenas imagem escaneada, pode ser necessário aplicar OCR antes para que a busca encontre o conteúdo interno.

---

## 🚀 Como publicar no GitHub Pages

Depois de editar arquivos ou adicionar documentos:

```bash
cd ~/Documents/hub-arquivos-ifba
git add .
git commit -m "Update site"
git push
```

O GitHub Pages normalmente atualiza em alguns minutos.

URL esperada:

```text
https://SEU-USUARIO.github.io/hub-arquivos-ifba/
```

---

## 🔄 Como atualizar com uma nova versão ZIP

Se você usa o comando local `update-hub`, basta rodar:

```bash
update-hub ~/Downloads/NOME-DA-NOVA-VERSAO.zip
```

Depois, se necessário, regenere o manifesto:

```bash
cd ~/Documents/hub-arquivos-ifba
python3 scripts/generate_documents_manifest.py
git add .
git commit -m "Update site"
git push
```

---

## 🛠️ Tecnologias usadas

* HTML;
* CSS;
* JavaScript;
* PDF.js para prévias de PDF;
* Python para geração do manifesto;
* GitHub Pages para hospedagem gratuita.

---

## 📱 Foco em mobile

O projeto é pensado para estudantes acessarem pelo celular.

Por isso a interface prioriza:

* busca no topo;
* cards compactos;
* filtros recolhíveis;
* navegação simples;
* apps úteis;
* prévia em tela cheia no mobile.

---

## ⚠️ Observação importante

Este projeto é um hub acadêmico independente.

As informações devem sempre ser conferidas nos documentos oficiais e páginas institucionais correspondentes. O objetivo do site é facilitar o acesso, a busca e a organização das informações.

---

## 📌 Status

Versão atual do projeto:

```text
v0.1.10
```

O projeto ainda está em desenvolvimento e pode receber melhorias em:

* qualidade da busca;
* extração de texto;
* prévias dos documentos;
* organização dos fluxos estudantis;
* novos aplicativos acadêmicos;
* experiência mobile.

---

## 👤 Autor

Projeto desenvolvido por Felipe Juan para organização de documentos, links e ferramentas do curso de Sistemas de Informação do IFBA — Campus Vitória da Conquista.
