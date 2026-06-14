# HUB Arquivos IFBA — Sistemas de Informação

Hub acadêmico estático para o curso de Sistemas de Informação do IFBA Vitória da Conquista.

## Como testar localmente

```bash
cd ~/Documents/hub-arquivos-ifba
python3 -m http.server 8000
```

Abra:

```text
http://localhost:8000
```

## Como adicionar documentos do jeito fácil

Agora o site lê `documents/manifest.json` automaticamente.

Fluxo recomendado:

1. Coloque os PDFs/arquivos em subpastas dentro de `documents/`.
2. Rode o gerador de manifesto.
3. Teste localmente.
4. Faça `git add`, `commit` e `push`.

Exemplo de estrutura:

```text
documents/
  ppcs/
    ppc-2024.pdf
  matrizes-curriculares/
    matriz-curricular-2024.pdf
  regulamentos-bsi/
    regulamento-tcc.pdf
  portarias/
    portaria-colegiado-2025.pdf
  normas-ifba/
    naes.pdf
  diretrizes-cne/
    diretrizes-computacao.pdf
```

Depois rode:

```bash
python3 scripts/generate_documents_manifest.py
```

Isso cria/atualiza:

```text
documents/manifest.json
documents/manifest.csv
```

O site usa o `manifest.json` para criar automaticamente os cards, categorias, filtros e diretório.

## Publicar atualização

```bash
git add .
git commit -m "Add documents and update manifest"
git push
```

## Manifesto manual

Você também pode editar `documents/manifest.json` manualmente. Exemplo mínimo:

```json
{
  "documents": [
    {
      "id": "doc-ppc-2024",
      "title": "PPC 2024",
      "category": "PPCs",
      "kind": "PPC",
      "correspondent": "Coordenação de Sistemas de Informação",
      "fileFormat": "PDF",
      "pdfUrl": "documents/ppcs/ppc-2024.pdf",
      "sourceUrl": "documents/ppcs/ppc-2024.pdf",
      "tags": ["PPC", "currículo", "matriz"],
      "summary": "Projeto Pedagógico do Curso de Sistemas de Informação."
    }
  ]
}
```

## Observação importante

Um site estático publicado no GitHub Pages não consegue “ver” sozinho todos os arquivos de uma pasta. Por isso o manifesto é necessário. A pasta organiza os arquivos; o manifesto diz ao site o que existe, qual categoria usar e como pesquisar.
