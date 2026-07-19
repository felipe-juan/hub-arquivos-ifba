# Publicação para iniciantes

Este projeto é um site estático. Ele usa HTML, CSS, JavaScript, arquivos JSON, documentos e um service worker, sem banco de dados ou servidor de aplicação. Antes de publicar, mantenha também as pastas `assets/`, `apps/`, `documents/` e os arquivos gerados com hash.

## Opção mais fácil para testar: Netlify Drop

1. Extraia o ZIP.
2. Entre no Netlify.
3. Use a opção de arrastar e soltar uma pasta de site.
4. Arraste a pasta `hub-arquivos-ifba`.
5. O Netlify vai gerar um link temporário/publicável.

Essa é a forma mais simples para quem não quer mexer com Git no começo.

## Opção recomendada depois: GitHub Pages

1. Crie uma conta no GitHub, se ainda não tiver.
2. Crie um repositório chamado, por exemplo, `hub-arquivos-ifba`.
3. Envie os arquivos desta pasta para o repositório.
4. Vá em Settings > Pages.
5. Escolha publicar a partir da branch principal e da pasta raiz.
6. O GitHub vai gerar um endereço do tipo `usuario.github.io/hub-arquivos-ifba`.

## Opção boa para evolução: Cloudflare Pages

Boa quando o projeto crescer e você quiser usar domínio próprio, CDN e depois talvez funções/backend.

## Atenção

A exibição inicial usa `documents/manifest-summary.json`; a busca textual carrega `documents/search-index.json` sob demanda, e `documents/manifest.json` permanece como representação completa de compatibilidade. `data.js` mantém o conteúdo estático do HUB. Para upload por usuários, OCR em servidor ou banco de dados, será necessário um backend ou uma etapa externa de build.

Antes da publicação, execute `python3 scripts/update_content.py` para regenerar índices, miniaturas e assets com hash.

Para configurar Brotli, gzip, cache longo de assets e cache curto do manifesto, consulte `PERFORMANCE_HOSTING.md`. Em GitHub Pages, a compactação é administrada pelo CDN; em Netlify, Cloudflare, Nginx ou Apache, os cabeçalhos podem ser controlados diretamente.
