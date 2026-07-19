# Pasta de documentos

Coloque aqui os PDFs e outros arquivos do acervo.

O site usa `documents/manifest.json` para montar o acervo, as categorias e a busca. A versão corrigida do gerador agora tenta extrair o texto real dos documentos e dividir em trechos pesquisáveis.

## Estrutura recomendada

```text
documents/
  ppcs/
  matrizes-curriculares/
  regulamentos-bsi/
  portarias/
  normas-ifba/
  diretrizes-cne/
```

## Depois de adicionar arquivos

Rode na raiz do projeto:

```bash
python3 scripts/generate_documents_manifest.py
```

Depois publique:

```bash
git add .
git commit -m "Update document manifest"
git push
```

## Dependências recomendadas para indexar conteúdo

Para PDFs com texto selecionável, a melhor opção é instalar PyMuPDF:

```bash
python3 -m pip install --user pymupdf pypdf openpyxl python-docx python-pptx
```

Se você não instalar nada, o site ainda tenta indexar PDFs no navegador com PDF.js, mas o correto para publicação é gerar o `manifest.json` já com o texto extraído.

## PDFs escaneados

Se o PDF for apenas imagem escaneada, não há texto para extrair. Nesse caso você precisa gerar OCR ou criar um `.txt` com o mesmo nome do PDF.

Exemplo:

```text
documents/ppcs/ppc-2024.pdf
documents/ppcs/ppc-2024.txt
```

O `.txt` será usado como texto pesquisável do PDF.

## Arquivos gerados

- `manifest.json`: usado pelo site.
- `manifest.csv`: planilha simples para revisar o mapeamento e ver se o arquivo foi indexado.

No `manifest.csv`, confira as colunas:

- `indexed`: precisa estar `True` para busca interna funcionar bem;
- `contentLength`: deve ser maior que 0;
- `extractionMethod`: mostra como o texto foi extraído;
- `chunks`: quantidade de trechos pesquisáveis.

## Metadados de confiança

O HUB aceita campos opcionais no `manifest.json` para informar a situação de cada documento:

- `sourceLabel`: nome da fonte oficial;
- `reviewedDate`: data da última conferência humana;
- `validityStatus`: por exemplo `Vigente`, `Histórico` ou `A conferir`;
- `supersededBy`: título do documento que substituiu o arquivo antigo.

O gerador preenche apenas valores conservadores. A indicação de vigência e a data de conferência devem ser revisadas manualmente antes da publicação.
