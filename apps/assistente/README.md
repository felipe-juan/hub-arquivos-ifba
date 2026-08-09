# Assistente do HUB v1.8.1

Frontend web do Assistente do HUB, mantido em `config.js` + `app.js` para preservar um único estado do chat e evitar regressões de concorrência entre controladores.

## Experiência 1.6

- resposta progressiva via NDJSON, com `■` para interromper e substituição por nova pergunta;
- edição da mensagem do usuário e regeneração da resposta;
- feedback 👍/👎 com motivos de erro revisáveis no Admin Center;
- fontes documentais integradas, página clicável e preview de PDF;
- cards visuais para professor, horários, calendário, documentos, Barema e recursos do HUB;
- ações diretas para Calculadora da Final, Calendário, Barema, fluxogramas e documentos;
- sugestões de continuação contextuais e indicação visual quando uma pergunta curta reutiliza contexto;
- validade/status da fonte e alerta de informação potencialmente desatualizada;
- catálogo offline com apps, links, documentos e trechos indexados;
- tela inicial com atalhos acadêmicos e exemplos de perguntas.

O composer permanece utilizável durante a resposta. Com resposta em andamento, campo vazio + botão `■` interrompe; se houver uma nova mensagem digitada, Enter ou o botão de envio substitui a resposta anterior pela nova solicitação.
