# Apps do HUB

Os aplicativos usam URLs estáveis:

- `apps/calendario/`
- `apps/fluxogramas/`
- `apps/barema/`

O número da versão interna fica em `apps/catalog.json`. Os três arquivos HTML versionados mantidos na raiz desta pasta são apenas redirecionamentos de compatibilidade para os últimos endereços públicos usados antes da migração.

Cada app possui uma pasta `data/` com os dados acadêmicos separados da interface e um `source-metadata.json` com origem, vigência e data de revisão. Os documentos originais ficam em `docs/`.

## Navegação compartilhada

Os três apps carregam `apps/app-shell.css` e `apps/app-shell.js`. Essa camada reproduz a sidebar do HUB no desktop e o header compacto no celular, reutilizando as mesmas preferências do navegador para tema, largura/recolhimento da sidebar, menus, favoritos e ordem dos atalhos.

Na navegação compartilhada, **Atalhos** possui duas ações distintas: o texto abre a seção correspondente na página inicial e a seta abre/fecha o submenu. A ordem exibida é a mesma configurada na seção Atalhos do HUB. O grupo **Favoritos** aparece por último.
