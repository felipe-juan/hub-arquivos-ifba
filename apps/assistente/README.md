# Assistente do HUB v1.5.11

Frontend restaurado sobre o fluxo monolítico comprovadamente funcional da v1.4.4.

A página carrega apenas `config.js` e `app.js` para o ciclo do chat. O envio, indicador de digitação, renderização, histórico e finalização da requisição voltaram a compartilhar o mesmo estado, evitando a regressão introduzida pela divisão em múltiplos controladores.

A única alteração funcional adicional ao fluxo restaurado é a interrupção/substituição: com resposta em andamento, campo vazio + botão `■` interrompe; se houver uma nova mensagem digitada, Enter ou `↑` interrompe a resposta anterior e envia a nova.
