# Roadmap do HUB Arquivos IFBA

## Versão 0.1 — MVP estático atual

- [x] Página inicial
- [x] Busca local por documentos
- [x] Filtros por tipo, tema e status
- [x] Trechos destacados
- [x] Calculadora de média ponderada
- [x] Calculadora de nota necessária
- [x] Calculadora de horas complementares
- [x] Links úteis
- [x] Guias rápidos
- [x] Admin local gerador de JSON

## Versão 0.2 — Acervo real

- [ ] Baixar documentos oficiais do curso
- [ ] Criar taxonomia de tags
- [ ] Separar documentos por: PPC, regulamento, edital, calendário, formulário, ata, orientação
- [ ] Marcar documentos antigos, substituídos ou incertos
- [ ] Revisar manualmente os trechos mais importantes
- [ ] Substituir documentos de exemplo em `data.js`

## Versão 0.3 — Prévia real de PDF

- [ ] Guardar PDFs em uma pasta pública ou storage gratuito
- [ ] Usar PDF.js para abrir PDF dentro do site
- [ ] Levar o usuário diretamente para a página encontrada
- [ ] Destacar palavras pesquisadas dentro da página

## Versão 0.4 — OCR e extração

- [ ] Usar OCRmyPDF + Tesseract em documentos escaneados
- [ ] Extrair texto por página
- [ ] Gerar chunks por página/seção
- [ ] Revisar OCR antes de publicar

## Versão 0.5 — Busca semântica real

- [ ] Gerar embeddings com Sentence Transformers localmente
- [ ] Guardar vetores em Postgres + pgvector ou SQLite + extensão vetorial
- [ ] Combinar busca textual + busca vetorial
- [ ] Exibir score e motivo do resultado
- [ ] Não gerar resposta sem citação de trecho oficial

## Versão 1.0 — Sistema completo

- [ ] Backend com login de admin
- [ ] Upload de documento
- [ ] OCR automático
- [ ] Painel de revisão
- [ ] Controle de versão de documentos
- [ ] Feedback dos usuários
- [ ] Relatório de documentos mais buscados
- [ ] Páginas por curso/campus
