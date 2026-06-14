# HUB Arquivos IFBA - pacote renomeado v4

Pacote consolidado gerado para uso no site HUB Arquivos - IFBA.

## Conteúdo

- 55 PDFs únicos dentro de `documents/`.
- Manifests auxiliares fora da pasta `documents/`, para não aparecerem como documentos caso o site escaneie apenas essa pasta.
- Duplicatas exatas removidas por hash SHA-256.

## Como usar no site

Copie apenas a pasta:

```txt
hub_arquivos_ifba_renomeados_v4/documents/
```

Para categorias e metadados, use:

```txt
hub_arquivos_ifba_renomeados_v4/manifesto-site.json
```

## Categorias

- `01_ppc` - Projetos Pedagógicos
- `02_matrizes_curriculares` - Matrizes curriculares
- `03_regulamentos_do_curso` - Regulamentos do curso
- `04_portarias` - Portarias
- `05_normas_ifba` - Normas IFBA
- `06_diretrizes_cne` - Diretrizes CNE/CONAES
- `07_atos_institucionais_do_curso` - Atos institucionais do curso
- `08_comunicados_e_resultados` - Comunicados e resultados
- `09_calendarios_e_horarios` - Calendários e horários
- `10_dasi_representacao_discente` - DASI e representação discente
- `11_documentos_academicos_operacionais` - Documentos acadêmicos operacionais

## Atenção sobre dados pessoais

Alguns documentos contêm dados pessoais ou dados institucionais sensíveis, como nomes, matrículas e e-mails. Antes de publicar no site, confira se esses documentos devem ficar públicos ou se precisam de restrição de acesso.

Arquivos especialmente sensíveis nesta versão:

- `ifba-vca_graduacao_lista-alunos-regulares_2026-1.pdf` - nomes e matrículas de discentes.
- `ifba-vca_bsi_week-it_comunicado-adiamento_2026.pdf` - endereços de e-mail de servidores.
- `ifba-vca_bsi_despacho-018-2026_lista-aptos-colacao-grau_2025-2.pdf` - nomes e matrículas de discentes aptos à colação de grau.
- `ifba-vca_bsi_demandas-discentes-ajustes-horarios_2026-2.pdf` - e-mails e nomes de discentes/representantes.

## Convenção de nomes

Formato geral:

```txt
instituicao_contexto_tipo_assunto_ano.pdf
```

Exemplos:

```txt
ifba-vca_bsi_nde_atas-reunioes_2025.pdf
ifba-vca_calendario-academico-graduacao_2026.pdf
ifba_consup_resolucao-086-2022_regulamento-discente.pdf
```
