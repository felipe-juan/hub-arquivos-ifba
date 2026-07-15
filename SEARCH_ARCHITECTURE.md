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

## Independência dos campos de busca — v0.2.20

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
