# Design System do HUB Arquivos IFBA

Este arquivo define o contrato visual mínimo do projeto. Novos componentes e correções devem reutilizar `css/design-system.css` e `js/design-system.js` antes de criar seletores específicos por página.

## Tokens

- espaçamento: `--hub-space-1` a `--hub-space-4`;
- raios: `--hub-radius-xs` a `--hub-radius-lg`;
- altura de controles: `--hub-control-h` e `--hub-control-h-sm`;
- cores de ação: `--hub-primary`, `--hub-secondary` e `--hub-danger`;
- foco: `--hub-focus`.

## Componentes obrigatórios

- `.hub-button` — base de botão ou link de ação;
- `.hub-button--primary` — ação principal;
- `.hub-button--secondary` — ação secundária colorida;
- `.hub-button--ghost` — ação neutra;
- `.hub-icon-button` — botão quadrado somente com ícone;
- `.hub-card` e `.hub-card--compact` — superfícies;
- `.hub-field` — campos de formulário;
- `.hub-update-toast` — avisos de atualização/cache;
- `.report-issue-button` — relato de problemas.

## Regras

1. Não criar um novo raio, altura ou foco se um token existente atender ao caso.
2. Não comunicar estado somente por cor.
3. Todo botão apenas com ícone precisa de `aria-label` e `title` quando útil.
4. Preferir classes de componente a seletores com IDs ou cadeias profundas.
5. Novos breakpoints devem usar os três estados do projeto: mobile, desktop e sidebar compactada.
6. Light e dark mode devem ser testados no mesmo componente.
7. Novos ajustes de CSS devem passar por `python3 scripts/audit_css.py`. A dívida legada está congelada em `css/specificity-baseline.json`; novos commits não podem aumentá-la.
