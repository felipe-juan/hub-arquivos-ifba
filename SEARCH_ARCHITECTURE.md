# Arquitetura recomendada para busca robusta

O objetivo não é copiar o Paperless-ngx inteiro. O ideal é aproveitar as ideias certas e construir um fluxo menor, voltado para universidade.

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
