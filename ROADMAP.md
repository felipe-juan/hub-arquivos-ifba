# Roadmap do HUB Arquivos IFBA

## Versão 0.1 — MVP estático atual

- [x] Busca como primeira tela
- [x] Busca geral por documentos, links, apps e informações
- [x] Acervo com duas visões: Grade e Diretório
- [x] Filtros por tipo de item, tipo documental, correspondente, tag, formato e status
- [x] Resultados ordenados por relevância
- [x] Autocomplete/sugestões com termos do acervo
- [x] Trechos destacados
- [x] Prévia com metadados e destaque
- [x] Busca inteligente com prioridade automática para apps e links
- [x] Links públicos com expiração opcional
- [x] Edição em lote com exportação JSON
- [x] Classificação automática leve de tags/tipos/correspondentes no navegador
- [x] Calculadora de média ponderada
- [x] Calculadora de nota necessária
- [x] Calculadora de horas complementares

## Versão 0.2 — Acervo real

- [ ] Baixar documentos oficiais do curso
- [ ] Criar taxonomia definitiva de tags
- [ ] Separar documentos por: PPC, regulamento, edital, calendário, formulário, ata, orientação
- [ ] Marcar documentos antigos, substituídos ou incertos
- [ ] Revisar manualmente os trechos mais importantes
- [ ] Substituir documentos de exemplo em `data.js`

## Versão 0.3 — Prévia real de PDF

- [ ] Guardar PDFs em `documents/` ou storage gratuito
- [ ] Usar PDF.js para abrir PDF dentro do site
- [ ] Levar o usuário diretamente para a página encontrada
- [ ] Destacar palavras pesquisadas dentro da página real

## Versão 0.4 — Extração/OCR automático com backend

- [ ] Backend gratuito/barato para upload administrativo
- [ ] Extração de texto por página
- [ ] OCR automático para documentos escaneados
- [ ] Geração automática de chunks por página/seção
- [ ] Painel de revisão antes de publicar

## Versão 0.5 — Busca semântica real

- [ ] Gerar embeddings
- [ ] Guardar vetores em banco ou índice vetorial
- [ ] Combinar busca textual + busca vetorial
- [ ] Exibir score e motivo do resultado
- [ ] Não gerar resposta sem citação de trecho oficial
