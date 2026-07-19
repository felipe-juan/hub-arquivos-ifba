# Medição em Android e iPhone

A instrumentação é local e não envia dados para nenhum servidor.

## Ativar

Abra o HUB com `?perf=1`, por exemplo:

```text
https://SEU-HOST/?perf=1
```

O painel registra LCP, FCP, CLS, INP quando suportado, TTFB, tarefas longas, latência da busca, recursos transferidos, quantidade de nós DOM e memória JavaScript quando o navegador expõe `performance.memory`.

## Roteiro físico

1. Limpe os dados do site ou use uma aba privada.
2. Abra a página em rede móvel e aguarde a primeira carga.
3. Pesquise `matricula`, `regulamento` e um termo inexistente.
4. Abra um PDF, navegue cinco páginas, amplie e volte.
5. Alterne Cards/Diretório e use Voltar/Avançar.
6. Abra e feche o Doom apenas no teste específico, pois o emulador distorce memória e transferência da navegação normal.
7. Toque em **Copiar relatório** e salve o JSON com modelo do aparelho, sistema e navegador.

## Observações

- Chrome/Android geralmente informa heap JavaScript; Safari/iOS normalmente não informa. O relatório registra essa ausência explicitamente.
- INP depende do suporte a `PerformanceEventTiming`; em navegadores antigos o campo permanece vazio.
- Faça pelo menos três execuções frias e três execuções quentes por aparelho.
- Compare medianas, não apenas a melhor execução.
