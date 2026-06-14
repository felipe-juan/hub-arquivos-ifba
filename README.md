# HUB Arquivos IFBA — Sistemas de Informação

Protótipo estático de um hub acadêmico para o curso de Sistemas de Informação do IFBA Vitória da Conquista.

## Como testar localmente

Abra `index.html` no navegador ou rode:

```bash
python3 -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

## Como adicionar arquivos manualmente

1. Coloque os arquivos em `documents/`.
2. Edite `data.js`.
3. Para cada documento, preencha `sourceUrl`, `pdfUrl`, `tags`, `documentType`, `correspondent`, `fileFormat` e `chunks`.

Exemplo:

```js
{
  id: "doc-exemplo",
  title: "Regulamento de Exemplo",
  kind: "Regulamento",
  documentType: "Regulamento",
  correspondent: "Coordenação de Sistemas de Informação",
  fileFormat: "PDF",
  status: "verified",
  sourceUrl: "https://link-oficial",
  pdfUrl: "documents/regulamento-exemplo.pdf",
  tags: ["regulamento", "curso"],
  summary: "Resumo do documento.",
  chunks: [
    {
      id: "doc-exemplo-1",
      page: 1,
      heading: "Trecho principal",
      semanticTags: ["regulamento"],
      text: "Trecho pesquisável do documento."
    }
  ]
}
```

## Observação

Este projeto é estático. Ele não possui login, banco de dados nem importação automática nesta versão. Isso mantém a publicação gratuita e simples.
