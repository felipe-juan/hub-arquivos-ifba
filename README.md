# HUB Arquivos IFBA — Sistemas de Informação

Primeiro MVP estático do projeto.

Ele já possui:

- página inicial;
- busca híbrida local por documentos e trechos;
- filtros por tipo, tema e status;
- prévia de trecho com destaque;
- cartões de documento com fonte, data e status;
- calculadora de média ponderada;
- calculadora de nota necessária;
- calculadora de horas complementares;
- seção de links úteis;
- guias rápidos;
- tela `admin.html` para gerar blocos JSON de novos documentos.

## Importante

Os documentos incluídos são **exemplos demonstrativos**. Eles não devem ser usados como regras oficiais. A próxima etapa é substituir os exemplos por documentos reais do curso, sempre com:

- fonte oficial;
- data do documento;
- data de coleta;
- status de verificação;
- tags acadêmicas;
- trechos por página.

## Como abrir no computador

1. Extraia o arquivo ZIP.
2. Abra a pasta `hub-arquivos-ifba`.
3. Clique duas vezes em `index.html`.

Não precisa instalar nada para testar.

## Como editar documentos agora

Abra o arquivo `data.js` e edite a lista `documents`.

Cada documento possui esta estrutura básica:

```js
{
  id: "doc-exemplo",
  title: "Título do documento",
  kind: "Regulamento",
  status: "review",
  trust: "Conferir fonte e versão",
  course: "Sistemas de Informação",
  year: "2026",
  docDate: "2026-01-01",
  collectedDate: "2026-06-13",
  sourceUrl: "https://...",
  pdfUrl: "https://...",
  tags: ["matrícula", "prazo"],
  summary: "Resumo curto.",
  chunks: [
    {
      id: "trecho-1",
      page: 1,
      heading: "Seção do documento",
      semanticTags: ["matrícula", "prazo"],
      text: "Texto oficial extraído da página."
    }
  ]
}
```

## Como usar o admin local

Abra `admin.html`.

Essa tela gera um bloco JSON. Ela não salva automaticamente porque este MVP não tem servidor. Depois de gerar o JSON, copie o resultado e cole dentro da lista `documents` em `data.js`.

## Como publicar de forma simples

Veja o arquivo `HOSTING_BEGINNER.md`.

## Próximas etapas técnicas

Veja o arquivo `ROADMAP.md`.
