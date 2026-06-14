# Publicação para iniciantes

Este MVP é um site estático. Isso significa que ele usa apenas:

- `index.html`
- `styles.css`
- `app.js`
- `data.js`
- `admin.html`
- `admin.js`

Não precisa banco de dados nem servidor nesta primeira versão.

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

Este MVP usa dados em `data.js`. Para uma versão com login, upload, OCR automático e banco de dados, será preciso evoluir para uma arquitetura com backend.
