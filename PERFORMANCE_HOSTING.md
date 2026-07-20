# Hospedagem orientada a desempenho

A v0.2.37 mede os tamanhos bruto, gzip e Brotli dos recursos iniciais. A compactação é responsabilidade do servidor/CDN; PDF, WebP, AVIF, WASM e ZIP já são formatos comprimidos e não devem ser recomprimidos.

## Arquivos publicados

`scripts/build_production_assets.py` gera JavaScript e CSS com hash de conteúdo em:

- `assets/build/`;
- `apps/build/`.

O mapeamento lógico → publicado fica em `assets/build-manifest.json`. Rode o build antes da publicação ou use `scripts/update_content.py`, que também regenera os índices e miniaturas.

## Política recomendada

- a rota raiz, `index.html`, todas as páginas HTML dos apps, `VERSION`, `documents/manifest-summary.json`, `documents/search-index.json` e manifestos: `Cache-Control: no-cache` ou revalidação equivalente;
- JavaScript e CSS em `assets/build/` e `apps/build/`: `Cache-Control: public, max-age=31536000, immutable`;
- miniaturas geradas e imagens estáveis: cache longo;
- PDFs: cache moderado; o service worker mantém somente os oito documentos recentes;
- Brotli em HTTPS, com gzip como fallback;
- `Vary: Accept-Encoding` nos recursos comprimidos.

Os arquivos-fonte sem hash continuam no pacote para manutenção e fallback, mas as páginas de produção apontam para as cópias com hash. Não aplique `immutable` a HTML, `VERSION` ou índices mutáveis.

## GitHub Pages

O CDN do GitHub administra a compressão e oferece pouco controle sobre cabeçalhos personalizados. Os nomes com hash ainda evitam colisões entre versões, mas a verificação pode informar que o cache não alcança a política ideal. Para controle integral, use Cloudflare Pages, Netlify ou um servidor configurável na frente do site.

## Netlify/Cloudflare Pages

Publique `hosting/_headers` como `_headers` na raiz do artefato final. As regras mantêm revalidação para HTML/índices e cache anual para `assets/build/*` e `apps/build/*`.

## Nginx

Inclua `hosting/nginx-performance.conf` dentro do bloco `server`. A regra de assets com hash deve aparecer antes da expressão genérica de imagens/JS/CSS, porque o Nginx usa a primeira expressão regular correspondente. Ative Brotli apenas quando o módulo estiver instalado; gzip permanece como fallback.

## Validação local

```bash
python3 scripts/build_production_assets.py
python3 scripts/check_performance_budget.py
python3 scripts/validate_site.py
```

Para descobrir os nomes publicados atuais:

```bash
python3 -c "import json,pathlib; m=json.loads(pathlib.Path('assets/build-manifest.json').read_text()); print(m['files']['app.js']); print(m['files']['styles.css'])"
```

## Verificação automática do host de produção

Depois de publicar, execute:

```bash
python3 scripts/verify_production_host.py --url https://SEU-ENDERECO/
```

Para integrar à CI:

```bash
python3 scripts/verify_production_host.py \
  --url "$HUB_PRODUCTION_URL" \
  --json > production-header-report.json
```

O comando lê `index.html`, identifica os assets com hash efetivamente usados e verifica:

- compressão Brotli ou gzip em JavaScript e CSS;
- `Vary: Accept-Encoding`;
- cache anual `immutable` nos assets com hash;
- revalidação de `index.html`, `VERSION` e dos dois índices documentais.

Ele falha quando a política publicada não corresponde ao esperado. Essa etapa exige a URL real: a análise local não consegue confirmar o comportamento do CDN ou do servidor final.
