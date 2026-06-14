# Pasta de documentos

Coloque aqui os PDFs e outros arquivos do acervo.

O site agora usa `documents/manifest.json` para criar categorias automaticamente.

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

## Arquivos gerados

- `manifest.json`: usado pelo site.
- `manifest.csv`: planilha simples para você revisar o mapeamento.

Não apague o `manifest.json` se quiser que os documentos apareçam no site.
