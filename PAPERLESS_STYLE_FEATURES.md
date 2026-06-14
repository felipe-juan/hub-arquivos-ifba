# Recursos estilo Paperless-ngx implementados no HUB SI

Esta versão remove o fluxo de importação/OCR pelo navegador e assume que os arquivos serão adicionados manualmente ao projeto.

## Acervo

- A seção **Acervo** agora concentra documentos e diretório.
- O botão **Grade** mostra os documentos em cards.
- O botão **Diretório** mostra a lista organizada por grupos.

## Busca

- Busca geral em documentos, links, apps e informações.
- Resultados ordenados por relevância.
- Destaque visual nos termos encontrados.
- Prévia rápida com o trecho destacado.
- Modal de prévia com metadados, trecho destacado, referência rápida e documentos parecidos.
- Sugestões/autocomplete baseadas nos termos do acervo.
- Busca inteligente identifica quando a consulta pede app, link ou documento e ajusta a ordenação.

## Metadados

Cada documento pode ter:

- `tags`
- `documentType`
- `correspondent`
- `fileFormat`
- `status`
- `sourceUrl`
- `pdfUrl`
- `chunks`

A aplicação também faz classificação automática no carregamento, inferindo tags, tipo documental e correspondente a partir do texto indexado. Essa camada é leve e roda no navegador; para um classificador realmente treinado em servidor, a próxima etapa seria backend.

## Filtros

A busca possui filtros por:

- tipo de item;
- tipo documental;
- correspondente;
- tag;
- formato;
- status.

## Edição em lote

A seção Acervo possui seleção de documentos e edição em lote de:

- tags;
- tipo documental;
- correspondente.

Como o site é estático, a edição vale na sessão do navegador e pode gerar um JSON para você aplicar depois em `data.js`.

## Links públicos

Cada documento pode gerar um link público com expiração opcional. Como o site é estático e público, a expiração é checada pelo JavaScript da própria página.
