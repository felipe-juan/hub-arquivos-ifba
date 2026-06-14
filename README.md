# HUB Arquivos IFBA — Sistemas de Informação

Protótipo estático e gratuito para reunir documentos, links e apps úteis do curso de Bacharelado em Sistemas de Informação do IFBA Vitória da Conquista.

## O que há nesta versão

- Busca geral em documentos, links e apps.
- Resultados por relevância.
- Acervo em duas visualizações: grade e diretório.
- Prévia de documentos em modal.
- Filtros por tipo, tags, correspondente, tipo de documento e formato.
- Edição em lote local para gerar JSON de metadados.
- Calculadora de média final conforme regra MP, PF e faltas.
- Assistente de horas complementares baseado no Barema PPC 2024.
- Links públicos compartilháveis para documentos.

## Assistente de horas complementares

O app usa as regras do arquivo `Barema (PPC 2024).xlsx`:

- mínimo de 200 horas;
- mínimo de 3 categorias com horas aproveitadas;
- teto por categoria;
- teto por atividade;
- cálculo automático por unidade;
- resumo copiável para o estudante organizar a documentação.

Os dados lançados pelo estudante ficam apenas no navegador via `localStorage`.

## Rodar localmente

```bash
python3 -m http.server 8000
```

Abrir:

```text
http://localhost:8000
```

## Publicar atualização

```bash
git add .
git commit -m "Update site"
git push
```

## Observação

Os links dos documentos ainda precisam ser substituídos pelos URLs oficiais reais. O site não substitui a fonte oficial; ele ajuda a encontrar, organizar e conferir as informações.
