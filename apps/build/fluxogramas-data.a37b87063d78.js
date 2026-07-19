(() => {
const COURSES = [
 {id:'bsi',emoji:'💻',name:'Sistemas de Informação',short:'BSI',desc:'matrizes 2017 e 2024',versions:['bsi2024','bsi2017']},
 {id:'mecanica',emoji:'⚙️',name:'Engenharia Mecânica',short:'Mecânica',desc:'fluxograma 2022',versions:['mec2022']},
 {id:'eletrica',emoji:'⚡',name:'Engenharia Elétrica',short:'Elétrica',desc:'base, optativas e ênfases',versions:['ele2023','eleOld']},
 {id:'civil',emoji:'🏗️',name:'Engenharia Civil',short:'Civil',desc:'estrutura curricular 2023',versions:['civil2023']},
 {id:'quimica',emoji:'🧪',name:'Licenciatura em Química',short:'Química',desc:'fluxogramas 2017 e 2023',versions:['qui2023','qui2017']},
 {id:'ambiental',emoji:'🌱',name:'Engenharia Ambiental',short:'Ambiental',desc:'fluxogramas 2014 e 2022',versions:['amb2022','amb2014']}
];
const DOCS={
 bsi2024:[['Matriz curricular 2024','docs/bsi-matriz-2024.pdf'],['Ementário oficial BSI 2024','docs/bsi-ementario-2024.pdf'],['Componentes optativos','docs/bsi-optativas.pdf']],
 bsi2017:[['Matriz curricular em vigor a partir de 2017','docs/bsi-matriz-2017.pdf'],['Fluxograma no PPC','docs/bsi-ppc-fluxograma.pdf'],['PPC oficial BSI 2017','docs/bsi-ppc-2017.pdf']],
 mec2022:[['Fluxograma Engenharia Mecânica — versão julho/2022','docs/engenharia-mecanica-2022.pdf']],
 ele2023:[['Base 2023','docs/engenharia-eletrica-base-2023.pdf'],['Optativas 2023','docs/engenharia-eletrica-optativas-2023.pdf'],['Ênfases 2023','docs/engenharia-eletrica-enfases-2023.pdf']],
 eleOld:[['Fluxograma antigo / básico de Engenharia Elétrica','docs/engenharia-eletrica-antigo.pdf']],
 civil2023:[['Fluxograma Engenharia Civil 2023','docs/engenharia-civil-2023.pdf']],
 qui2023:[['Fluxograma Licenciatura em Química 2023','docs/licenciatura-quimica-2023.pdf']],
 qui2017:[['Fluxograma Licenciatura em Química 2017','docs/licenciatura-quimica-2017.pdf']],
 amb2022:[['Fluxograma Engenharia Ambiental 2022','docs/engenharia-ambiental-2022.pdf']],
 amb2014:[['Fluxograma Engenharia Ambiental 2014','docs/engenharia-ambiental-2014.pdf']]
};
const DOC_PAGE_HINTS={
  bsi2024:[1,1,1], bsi2017:[1,1,31], mec2022:[1], ele2023:[1,1,1], eleOld:[2], civil2023:[1], qui2023:[1], qui2017:[1], amb2022:[2], amb2014:[1]
};
function c(name,h=60,type='disc',pr=[]){return {name,h,type,pr}};
const DATA={
 bsi2017:{course:'Sistemas de Informação',title:'Matriz 2017',note:'Baseada no PPC BSI 2017 e no fluxograma Matriz 2016.2. Pré-requisitos revisados pelo ementário do PPC oficial.',semesters:[
  [c('Algoritmos e Programação',60,'CCO'),c('Leitura e Produção de Gêneros Acadêmicos',60,'COM'),c('Fundamentos de Sistemas de Informação',60,'CCO'),c('Matemática Discreta I',60,'MAT'),c('Introdução à Ciência da Computação',60,'CCO'),c('Inglês Instrumental',60,'COM')],
  [c('Linguagem de Programação I',60,'CCO',['Algoritmos e Programação']),c('Organização e Arquitetura de Computadores',60,'CCO'),c('Computador, Ética e Sociedade',60,'COM'),c('Matemática Discreta II',60,'MAT',['Matemática Discreta I']),c('Cálculo Diferencial Aplicado à Computação',60,'MAT',['Matemática Discreta I']),c('Administração',60,'COM')],
  [c('Linguagem de Programação II',60,'CCO',['Linguagem de Programação I']),c('Estruturas de Dados',60,'CCO',['Linguagem de Programação I']),c('Sistemas Operacionais',60,'TEC',['Organização e Arquitetura de Computadores']),c('Probabilidade e Estatística',60,'MAT'),c('Direito e Legislação em Informática',60,'HUM'),c('Organizações, Sistemas e Métodos',60,'COM')],
  [c('Metodologia da Pesquisa Científica',60,'COM'),c('Análise e Modelagem de Sistemas',60,'TEC',['Linguagem de Programação II']),c('Banco de Dados I',60,'TEC',['Linguagem de Programação I']),c('Redes de Computadores',60,'TEC',['Sistemas Operacionais']),c('Paradigmas de Linguagens de Programação',60,'CCO',['Linguagem de Programação II']),c('Empreendedorismo',60,'COM')],
  [c('Programação Web',60,'TEC',['Linguagem de Programação II','Banco de Dados I']),c('Processo de Desenvolvimento de Software',60,'TEC',['Análise e Modelagem de Sistemas']),c('Banco de Dados II',60,'TEC',['Linguagem de Programação II','Banco de Dados I']),c('Projeto e Administração de Redes',60,'TEC',['Redes de Computadores']),c('Complexidade de Algoritmos',60,'CCO',['Cálculo Diferencial Aplicado à Computação','Estruturas de Dados']),c('Economia',60,'COM')],
  [c('Inteligência Artificial',60,'CCO',['Matemática Discreta II']),c('Contabilidade Geral e Custos',60,'COM'),c('Engenharia de Software',60,'TEC',['Processo de Desenvolvimento de Software']),c('Segurança e Auditoria de Sistemas',60,'TEC',['Redes de Computadores','Banco de Dados II']),c('Sistemas Distribuídos',60,'TEC',['Redes de Computadores']),c('Optativa A',60,'OPT')],
  [c('Qualidade de Software',60,'TEC',['Engenharia de Software']),c('Trabalho de Conclusão de Curso I',60,'SUP'),c('Interface Homem-Máquina',60,'TEC',['Engenharia de Software']),c('Estágio Supervisionado',330,'SUP'),c('Gestão de Projetos',60,'TEC',['Engenharia de Software']),c('Optativa B',60,'OPT'),c('Gestão e Governança de TI',60,'TEC',['Fundamentos de Sistemas de Informação','Organizações, Sistemas e Métodos'])],
  [c('Meio Ambiente',60,'HUM'),c('Trabalho de Conclusão de Curso II',60,'SUP',['Trabalho de Conclusão de Curso I']),c('Sistemas de Apoio a Decisão',60,'TEC',['Fundamentos de Sistemas de Informação']),c('Optativa C',60,'OPT'),c('Optativa D',60,'OPT')]
 ]},
 bsi2024:{course:'Sistemas de Informação',title:'Matriz 2024',note:'Matriz curricular atual com ACEX e nova distribuição de componentes. Pré-requisitos revisados estritamente pelo Ementário oficial BSI 2024.',semesters:[
  [c('Algoritmos e Programação',60,'CCO'),c('Leitura e Produção de Gêneros Acadêmicos',60,'COM'),c('Fundamentos de Sistemas de Informação',60,'CCO'),c('Matemática Discreta I',60,'MAT'),c('Introdução à Ciência da Computação',60,'CCO'),c('Inglês Aplicado à Computação',60,'COM')],
  [c('Linguagem de Programação I',60,'CCO',['Algoritmos e Programação']),c('Organização e Arquitetura de Computadores',60,'CCO'),c('Computador, Ética e Sociedade',60,'COM'),c('Matemática Discreta II',60,'MAT',['Matemática Discreta I']),c('Cálculo Diferencial Aplicado à Computação',60,'MAT',['Matemática Discreta I']),c('Administração',60,'COM')],
  [c('Linguagem de Programação II',60,'CCO',['Linguagem de Programação I']),c('Estruturas de Dados',60,'CCO',['Linguagem de Programação I']),c('Sistemas Operacionais',60,'TEC',['Organização e Arquitetura de Computadores']),c('Probabilidade e Estatística',60,'MAT'),c('Direito Cibernético',60,'HUM'),c('Organização, Sistemas e Métodos',60,'COM',['Administração'])],
  [c('Metodologia da Pesquisa Científica',60,'COM'),c('Análise e Modelagem de Sistemas',60,'TEC',['Linguagem de Programação II']),c('Banco de Dados I',60,'TEC',['Linguagem de Programação I']),c('Redes de Computadores',60,'TEC',['Sistemas Operacionais']),c('Programação Web I',60,'TEC',['Linguagem de Programação II']),c('Empreendedorismo',60,'COM',['Administração']),c('Atividades Curriculares de Extensão I',90,'ACEX')],
  [c('Processo de Desenvolvimento de Software',60,'TEC',['Análise e Modelagem de Sistemas']),c('Complexidade de Algoritmos',60,'CCO',['Cálculo Diferencial Aplicado à Computação','Estruturas de Dados']),c('Banco de Dados II',60,'TEC',['Banco de Dados I','Linguagem de Programação II']),c('Projeto e Administração de Redes',60,'TEC',['Redes de Computadores']),c('Programação Web II',60,'TEC',['Banco de Dados I','Programação Web I']),c('Economia',60,'COM'),c('Atividades Curriculares de Extensão II',90,'ACEX',['Atividades Curriculares de Extensão I'])],
  [c('Inteligência Artificial',60,'CCO',['Linguagem de Programação II','Matemática Discreta II']),c('Programação para Dispositivos Móveis',60,'TEC',['Processo de Desenvolvimento de Software']),c('Engenharia de Software',60,'TEC',['Processo de Desenvolvimento de Software']),c('Sistemas Distribuídos',60,'TEC',['Redes de Computadores']),c('Segurança da Informação',60,'TEC',['Banco de Dados I','Redes de Computadores']),c('Gestão de Projetos',60,'TEC',['Administração','Processo de Desenvolvimento de Software']),c('Atividades Curriculares de Extensão III',75,'ACEX',['Atividades Curriculares de Extensão II'])],
  [c('Desenvolvimento Distribuído na Internet',60,'TEC',['Processo de Desenvolvimento de Software','Sistemas Distribuídos']),c('Qualidade de Software',60,'TEC',['Engenharia de Software']),c('Trabalho de Conclusão de Curso I',30,'TCC'),c('Interface Homem-Máquina',60,'TEC',['Engenharia de Software']),c('Sistemas de Apoio à Decisão',60,'TEC',['Gestão de Projetos']),c('Atividades Curriculares de Extensão IV',75,'ACEX',['Atividades Curriculares de Extensão III']),c('Optativa A',60,'OPT')],
  [c('Meio Ambiente',60,'HUM'),c('Gestão e Governança de TI',60,'TEC',['Gestão de Projetos','Segurança da Informação']),c('Trabalho de Conclusão de Curso II',30,'TCC',['Trabalho de Conclusão de Curso I']),c('Optativa B',60,'OPT'),c('Optativa C',60,'OPT')]
 ]},
  mec2022:{course:'Engenharia Mecânica',title:'Versão julho/2022',note:'Fluxograma curricular de Engenharia Mecânica.',semesters:[
  [c('Introdução à Engenharia Mecânica',60,'P'),c('Ciências do Ambiente',60,'B'),c('Física I',60,'B'),c('Introdução à Programação',60,'B'),c('Álgebra Vetorial e Geometria Analítica',60,'B'),c('Cálculo Diferencial e Integral I',60,'B'),c('Expressão Gráfica',60,'P')],
  [c('Química Geral',60,'B'),c('Relações Étnico-Raciais',60,'HUM'),c('Física II',60,'B'),c('Física Experimental I',60,'B'),c('Álgebra Linear',60,'B'),c('Cálculo Diferencial e Integral II',60,'B'),c('Desenho Técnico Mecânico',60,'P')],
  [c('Probabilidade e Estatística',60,'B'),c('Mecânica dos Sólidos I',60,'P'),c('Física III',60,'B'),c('Física Experimental II',60,'B'),c('Equações Diferenciais Ordinárias',60,'B'),c('Cálculo Diferencial e Integral III',60,'B'),c('Desenho Auxiliado por Computador',60,'P')],
  [c('Introdução à Ciência dos Materiais',60,'P'),c('Mecânica dos Sólidos II',60,'P'),c('Eletrotécnica Geral',60,'P'),c('Gestão da Manutenção',60,'E'),c('Metrologia',60,'P'),c('Cálculo Numérico',60,'B'),c('ACEX I',60,'ACEX')],
  [c('Sociologia do Trabalho',60,'HUM'),c('Administração',60,'HUM'),c('Resistência dos Materiais I',60,'P'),c('Mecânica dos Fluidos',60,'P'),c('Termodinâmica',60,'P'),c('Higiene e Segurança do Trabalho',60,'HUM'),c('ACEX II',60,'ACEX'),c('Materiais de Construção Mecânica',60,'P')],
  [c('Instituições de Direito',60,'HUM'),c('Economia',60,'HUM'),c('Resistência dos Materiais II',60,'P'),c('Ensaios dos Materiais',60,'P'),c('Sistemas Hidráulicos e Pneumáticos',60,'P'),c('Transferência de Calor e Massa',60,'P'),c('ACEX III',60,'ACEX'),c('Optativa I',60,'OPT')],
  [c('Controle e Automação Mecânica',60,'E'),c('Máquinas Térmicas I',60,'E'),c('Automação Eletropneumática',60,'E'),c('Tecnologia de Soldagem',60,'E'),c('Elementos de Máquinas I',60,'E'),c('ACEX IV',60,'ACEX'),c('Optativa V',60,'OPT')],
  [c('Combate a Incêndio',60,'E'),c('Metodologia de Pesquisa Científica',60,'HUM'),c('Máquinas Térmicas II',60,'E'),c('Máquinas de Fluxo',60,'E'),c('Elementos de Máquinas II',60,'E'),c('ACEX V',60,'ACEX'),c('Usinagem',60,'E'),c('Optativa III',60,'OPT')],
  [c('Projeto em Mecânica I',60,'PFC'),c('Técnicas de Manutenção Mecânica',60,'E'),c('Planejamento e Controle da Produção',60,'E'),c('Optativa IV',60,'OPT')],
  [c('Projeto em Engenharia Mecânica II',60,'PFC'),c('Estágio Supervisionado',165,'EST'),c('Atividades Curriculares Complementares',60,'ACC'),c('Optativa VI',60,'OPT')]
 ]},
 ele2023:{course:'Engenharia Elétrica',title:'Base 2023',note:'Fluxograma curricular base — versão agosto/2023.',semesters:[
  [c('Introdução à Engenharia Elétrica',30,'P'),c('Química Geral',60,'B'),c('Física I',60,'B'),c('Álgebra Vetorial e Geometria Analítica',60,'B'),c('Introdução à Programação',60,'P'),c('Cálculo Diferencial e Integral I',60,'B'),c('Expressão Gráfica',60,'B')],
  [c('Sistemas Digitais',75,'P'),c('Introdução à Ciência dos Materiais',60,'B'),c('Física II',60,'B'),c('Física Experimental I',60,'B'),c('Técnicas de Programação',60,'P'),c('Cálculo Diferencial e Integral II',60,'B'),c('Álgebra Linear',60,'B')],
  [c('Probabilidade e Estatística',60,'B'),c('Mecânica dos Sólidos',60,'B'),c('Física III',60,'B'),c('Física Experimental II',60,'B'),c('Equações Diferenciais Ordinárias',60,'B'),c('Cálculo Diferencial e Integral III',60,'B'),c('Desenho Auxiliado por Computador',45,'P')],
  [c('Circuitos Elétricos I',75,'P'),c('Eletromagnetismo',75,'P'),c('Resistência dos Materiais I',60,'P'),c('Ciências do Ambiente',45,'B'),c('Métodos Matemáticos para Engenharia',60,'B'),c('Cálculo Numérico',60,'B'),c('ACEX I',90,'ACEX')],
  [c('Circuitos Elétricos II',75,'P'),c('Dispositivos Eletrônicos',75,'E'),c('Análise de Sinais e Sistemas',75,'E'),c('Ondas e Linhas',60,'E'),c('Fenômenos de Transporte',75,'P'),c('ACEX II',90,'ACEX')],
  [c('Eletrônica',75,'E'),c('Conversão Eletromecânica',75,'E'),c('Sistemas Elétricos de Potência',75,'E'),c('Controle Analógico',75,'E'),c('Combate a Incêndio',60,'P'),c('ACEX III',90,'ACEX'),c('Ênfase I',60,'E')],
  [c('Eletrônica de Potência',75,'E'),c('Instalações Elétricas Prediais',75,'E'),c('Máquinas Elétricas',75,'E'),c('Controle Digital',75,'E'),c('Ênfase I',60,'E'),c('ACEX IV',90,'ACEX')],
  [c('Higiene e Segurança do Trabalho',60,'B'),c('Metodologia da Pesquisa Científica',60,'B'),c('Economia',45,'B'),c('Ênfase II',60,'E'),c('Ênfase III',60,'E'),c('Ênfase IV',60,'E'),c('ACEX V',45,'ACEX')],
  [c('Projeto em Engenharia Elétrica I',30,'PFC'),c('Ênfase V',60,'E'),c('Ênfase VI',60,'E'),c('Optativa I',60,'OPT'),c('Optativa II',60,'OPT'),c('Administração',45,'B')],
  [c('Projeto em Engenharia Elétrica II',30,'PFC'),c('Estágio Supervisionado',165,'EST'),c('Atividades Curriculares Complementares',60,'ACC'),c('Relações Étnico-Raciais',30,'B'),c('Sociologia',30,'B'),c('Instituições de Direito',30,'B')]
 ]},
 eleOld:{course:'Engenharia Elétrica',title:'Fluxograma antigo',note:'Proposta de execução curricular / fluxograma básico do curso.',semesters:[
  [c('Introdução à Programação',60,'B'),c('Álgebra Vetorial e Geometria Analítica',60,'B'),c('Introdução à Engenharia',30,'P'),c('Física I',60,'B'),c('Cálculo Diferencial e Integral I',60,'B'),c('Língua Portuguesa',45,'HUM'),c('Expressão Gráfica',60,'B')],
  [c('Técnicas de Programação',60,'P'),c('Álgebra Linear',60,'B'),c('Química',75,'B'),c('Física II',60,'B'),c('Cálculo Diferencial e Integral II',60,'B'),c('Física Experimental',60,'B')],
  [c('Mecânica Geral',75,'P'),c('Equações Diferenciais',60,'B'),c('Circuitos Lógicos',75,'P'),c('Eletricidade e Magnetismo',60,'B'),c('Cálculo Diferencial e Integral III',60,'B'),c('Laboratório de Eletricidade e Magnetismo',60,'P')],
  [c('Introdução à Ciência dos Materiais',60,'B'),c('Cálculo Numérico',60,'B'),c('Arquitetura de Sistemas Digitais',75,'P'),c('Circuitos Elétricos I',75,'P'),c('Eletromagnetismo',75,'P'),c('Variáveis Complexas',60,'B')],
  [c('Dispositivos Eletrônicos',75,'E'),c('Análise de Sinais e Sistemas',60,'E'),c('Princípios de Comunicações',75,'E'),c('Ondas e Linhas',60,'E'),c('Processos Estocásticos',60,'B'),c('Resistência dos Materiais',60,'P')],
  [c('Eletrônica',75,'E'),c('Conversão Eletromecânica',75,'E'),c('Materiais Elétricos',75,'E'),c('Controle Analógico',75,'E'),c('Fenômenos de Transportes',75,'P'),c('Economia',45,'HUM')],
  [c('Máquinas Elétricas',75,'E'),c('Sistemas Elétricos',75,'E'),c('Conteúdos Específicos',60,'E'),c('Controle Digital',75,'E'),c('Conteúdos Específicos',60,'E')],
  [c('Eletrônica de Potência',75,'E'),c('Instalações Elétricas',75,'E'),c('Conteúdos Específicos',60,'E'),c('Conteúdos Específicos',60,'E'),c('Metodologia de Pesquisa',45,'HUM')],
  [c('Projeto em Engenharia Elétrica',120,'PFC'),c('Instituições do Direito',45,'HUM'),c('Optativa',60,'OPT'),c('Sociologia Industrial',45,'HUM'),c('Conteúdos Específicos',60,'E'),c('Administração',45,'HUM')],
  [c('Estágio Supervisionado',180,'EST'),c('Optativa',60,'OPT')]
 ]},
 civil2023:{course:'Engenharia Civil',title:'Estrutura curricular 2023',note:'Quadro 1 — Fluxograma da matriz curricular.',semesters:[
  [c('Introdução à Engenharia Civil',30,'PRO'),c('Física I',60,'BAS'),c('Introdução à Programação',60,'BAS'),c('Instituições do Direito',45,'BAS'),c('Metodologia de Pesquisa Científica',45,'BAS'),c('Química Geral',60,'BAS'),c('Expressão Gráfica',60,'BAS'),c('ACEX I',75,'ACEX')],
  [c('Introdução à Ciência dos Materiais',60,'BAS'),c('Física II',60,'BAS'),c('Física Experimental I',60,'BAS'),c('Algoritmos Vetoriais e Geometria Analítica',60,'BAS'),c('Cálculo Diferencial e Integral II',60,'BAS'),c('Desenho Arquitetônico',60,'BAS'),c('Desenho Auxiliado por Computador',60,'BAS'),c('ACEX II',75,'ACEX')],
  [c('Topografia',60,'PRO'),c('Física III',60,'BAS'),c('Geologia Aplicada à Engenharia',60,'BAS'),c('Álgebra Linear',60,'BAS'),c('Equações Diferenciais Ordinárias',60,'BAS'),c('Probabilidade e Estatística',60,'BAS')],
  [c('Mecânica dos Sólidos I',60,'PRO'),c('Resistência dos Materiais I',60,'PRO'),c('Física Experimental II',60,'BAS'),c('Cálculo Numérico',60,'BAS'),c('Estruturas Isostáticas',60,'PRO'),c('Fenômenos de Transporte',60,'BAS')],
  [c('Mecânica dos Solos II',60,'PRO'),c('Resistência dos Materiais II',60,'PRO'),c('Eletricidade Aplicada',60,'BAS'),c('Higiene e Segurança do Trabalho',45,'BAS'),c('Estruturas Hiperestáticas',60,'PRO'),c('Ciências do Ambiente',60,'BAS')],
  [c('Materiais de Construção Civil',60,'PRO'),c('Saneamento Básico e Emergência Ambiental',45,'BAS'),c('Obras Hidráulicas',60,'PRO'),c('Sociologia',45,'BAS'),c('Concreto Armado I',60,'PRO'),c('Hidráulica',60,'PRO'),c('ACEX III',90,'ACEX')],
  [c('Materiais de Construção II',60,'PRO'),c('Abastecimento de Água',60,'ESP'),c('Drenagem Urbana',60,'ESP'),c('Instalações Prediais Hidrossanitárias',60,'ESP'),c('Concreto Armado II',60,'PRO'),c('Hidrologia Geral',60,'PRO'),c('ACEX IV',75,'ACEX')],
  [c('Estruturas de Madeiras',45,'ESP'),c('Estradas e Rodovias',60,'ESP'),c('Instalações Prediais Elétricas',60,'ESP'),c('Combate a Incêndio I',60,'ESP'),c('Fundações',60,'ESP'),c('Estruturas de Aço',60,'ESP'),c('ACEX V',75,'ACEX')],
  [c('Tecnologia das Construções',60,'ESP'),c('Estradas e Rodovias II',60,'ESP'),c('TCC I',30,'TCC'),c('TCC II',30,'TCC'),c('Concreto Protendido',45,'ESP'),c('Optativo I',45,'OPT'),c('Optativo II',45,'OPT')],
  [c('Estágio Supervisionado',165,'EST'),c('Orçamento de Obras',60,'ESP'),c('Trabalho de Conclusão de Curso II',30,'TCC'),c('Atividades Complementares',60,'ACC')]
 ]},
 qui2023:{course:'Licenciatura em Química',title:'Matriz 2023',note:'Fluxograma 2023 com ACEX e estágios supervisionados.',semesters:[
  [c('Química Geral I',60,'EXQUI'),c('Química Geral Exp. I',30,'EXQUI'),c('História da Educação',60,'EXENS'),c('Leitura e Escrita Acadêmica',60,'EXCOM'),c('Ciência, Tecnologia e Sociedade',30,'EXENS'),c('Matemática Básica',60,'EXMAT'),c('Educação para Inclusão e Diversidade',30,'EXENS')],
  [c('Química Geral II',60,'EXQUI'),c('Química Geral Exp. II',30,'EXQUI'),c('Álgebra Aplicada à Química',60,'EXMAT'),c('Filosofia da Educação',30,'EXENS'),c('Psicologia da Educação',60,'EXENS'),c('Cálculo Diferencial para Química',60,'EXMAT')],
  [c('LIBRAS',30,'EXCOM'),c('Física I',60,'EXFIS'),c('Física Experimental I',30,'EXFIS'),c('Química Inorgânica I',60,'EXQUI'),c('Química Inorgânica Exp. I',30,'EXQUI'),c('Didática',60,'EXENS'),c('Probabilidade e Estatística',60,'EXMAT'),c('Cálculo Integral para Química',60,'EXMAT')],
  [c('Física II',60,'EXFIS'),c('Física Experimental II',30,'EXFIS'),c('Química Inorgânica II',60,'EXQUI'),c('Química Inorgânica Exp. II',30,'EXQUI'),c('Metodologia e Prática do Ensino em Química I',60,'EXENS'),c('Sociologia da Educação',60,'EXENS'),c('ACEX I',120,'ACEX')],
  [c('Química Orgânica I',60,'EXQUI'),c('Química Orgânica Exp. I',30,'EXQUI'),c('Relações Étnico-Raciais e Educação',30,'EXENS'),c('Física III',30,'EXFIS'),c('Metodologia da Pesquisa',30,'EXENS'),c('Estágio Supervisionado em Química I',90,'EXENS'),c('Metodologia e Prática do Ensino em Química II',90,'EXENS'),c('Políticas e Gestão da Educação',60,'EXENS')],
  [c('Físico-Química I',60,'EXQUI'),c('Físico-Química Exp. I',30,'EXQUI'),c('Química Analítica I',60,'EXQUI'),c('Química Analítica Exp. I',30,'EXQUI'),c('Química Orgânica II',60,'EXQUI'),c('Química Orgânica Exp. II',30,'EXQUI'),c('Metodologia da Pesquisa do Ensino em Química',30,'EXENS'),c('Estágio Supervisionado em Química II',105,'EXENS')],
  [c('Química Analítica II',60,'EXQUI'),c('Química Analítica Exp. II',30,'EXQUI'),c('Físico-Química II',60,'EXQUI'),c('Físico-Química Exp. II',30,'EXQUI'),c('Estágio Supervisionado em Química III',105,'EXENS'),c('Química Orgânica III',60,'EXQUI'),c('Química Orgânica Exp. III',30,'EXQUI'),c('ACEX II',105,'ACEX')],
  [c('Química Analítica Instrumental',60,'EXQUI'),c('Bioquímica',60,'EXQUI'),c('Estágio Supervisionado em Química IV',105,'EXENS'),c('TCC',30,'EXENS'),c('Química Ambiental',60,'EXQUI'),c('ACEX III',120,'ACEX')]
 ]},
 qui2017:{course:'Licenciatura em Química',title:'Matriz 2017',note:'Fluxograma da matriz curricular do curso de Licenciatura em Química.',semesters:[
  [c('Química Geral I',60,'NQUI'),c('Química Geral Experimental I',30,'NQUI'),c('Leitura e Produção de Textos Acadêmicos',60,'COM'),c('Educação, Tecnologia e Sociedade',30,'NENS'),c('Matemática Fundamental',60,'NMAT')],
  [c('Química Geral II',60,'NQUI'),c('Química Geral Experimental II',30,'NQUI'),c('Cálculo I',60,'NMAT'),c('Álgebra Aplicada à Química',60,'NMAT'),c('Filosofia da Educação',30,'NENS'),c('Psicologia da Educação I',60,'NENS')],
  [c('Cálculo II',60,'NMAT'),c('Física I',60,'NFIS'),c('Física Experimental I',30,'NFIS'),c('Química Inorgânica I',60,'NQUI'),c('Química Inorgânica Experimental I',30,'NQUI'),c('Didática I',60,'NENS'),c('Probabilidade e Estatística',60,'NMAT')],
  [c('Física II',60,'NFIS'),c('Física Experimental II',30,'NFIS'),c('Química Inorgânica II',60,'NQUI'),c('Química Inorgânica Experimental II',30,'NQUI'),c('Sociologia da Educação',60,'NENS'),c('Estágio Supervisionado I',120,'NENS'),c('Cálculo',60,'NMAT')],
  [c('Física III',60,'NFIS'),c('Química Orgânica I',60,'NQUI'),c('Química Orgânica Experimental I',30,'NQUI'),c('Metodologia da Pesquisa',30,'NENS'),c('Estágio Supervisionado II',120,'NENS'),c('Metodologia e Prática do Ensino em Química I',90,'NENS')],
  [c('Físico-Química I',60,'NQUI'),c('Físico-Química Experimental I',30,'NQUI'),c('Química Analítica I',60,'NQUI'),c('Química Analítica Experimental I',30,'NQUI'),c('Química Orgânica II',60,'NQUI'),c('Química Orgânica Experimental II',30,'NQUI'),c('Estágio Supervisionado III',120,'NENS'),c('Educação Inclusiva',30,'NENS')],
  [c('Química Analítica II',60,'NQUI'),c('Química Analítica Experimental II',30,'NQUI'),c('Físico-Química II',60,'NQUI'),c('Físico-Química Experimental II',30,'NQUI'),c('Química Orgânica III',45,'NQUI'),c('Estágio Supervisionado IV',135,'NENS'),c('Química Orgânica Experimental III',30,'NQUI')],
  [c('Química Analítica Instrumental',60,'NQUI'),c('Bioquímica',60,'NQUI'),c('Seminários Temáticos',150,'NENS'),c('TCC',30,'NENS'),c('Química Ambiental',60,'NQUI'),c('Optativa II',60,'NOPT')]
 ]},
 amb2022:{course:'Engenharia Ambiental',title:'Matriz 2022',note:'Representação gráfica do perfil de formação e fluxograma.',semesters:[
  [c('Álgebra Vetorial e Geometria Analítica',60,'BAS'),c('Biologia Geral',60,'BAS'),c('Cálculo Diferencial e Integral I',60,'BAS'),c('Introdução à Engenharia Ambiental',30,'BAS'),c('Introdução ao Estudo da Ética Ambiental',30,'BAS'),c('Leitura e Produção de Gêneros Acadêmicos',45,'BAS'),c('Metodologia da Pesquisa Científica',30,'BAS'),c('Química Geral',60,'BAS')],
  [c('Álgebra Linear',60,'BAS'),c('Cálculo Diferencial e Integral II',60,'BAS'),c('Ecologia Aplicada',60,'PRO'),c('Educação Ambiental',60,'PRO'),c('Expressão Gráfica',60,'BAS'),c('Física I',60,'BAS'),c('Química Analítica',60,'PRO'),c('ACEX 1',75,'ACEX')],
  [c('Cálculo Diferencial e Integral III',60,'BAS'),c('Economia',45,'BAS'),c('Física Experimental I',60,'BAS'),c('Física II',60,'BAS'),c('Higiene e Segurança do Trabalho',45,'BAS'),c('Mecânica dos Sólidos',60,'BAS'),c('Meteorologia e Climatologia',60,'PRO'),c('ACEX 2',75,'ACEX')],
  [c('Equações Diferenciais Ordinárias',60,'BAS'),c('Física III',60,'BAS'),c('Geologia',60,'PRO'),c('Introdução à Ciência dos Materiais',60,'BAS'),c('Introdução à Programação',60,'BAS'),c('Microbiologia Sanitária e Ambiental',60,'PRO'),c('Probabilidade e Estatística',60,'BAS')],
  [c('Administração',30,'BAS'),c('Cálculo Numérico',60,'BAS'),c('Desenho Auxiliado por Computador',45,'PRO'),c('Fenômenos de Transporte',60,'BAS'),c('Geoprocessamento',60,'PRO'),c('Poluição do Solo',60,'ESP'),c('Resistência dos Materiais I',45,'BAS')],
  [c('Estabilidade das Construções',60,'PRO'),c('Estruturas de Concreto Armado',60,'PRO'),c('Hidráulica',60,'PRO'),c('Legislação e Direito Ambiental',45,'BAS'),c('Reatores Bioquímicos',45,'ESP'),c('Sociologia',30,'BAS'),c('Topografia',60,'PRO'),c('ACEX 3',75,'ACEX')],
  [c('Análise e Avaliação de Impactos Ambientais',60,'ESP'),c('Gestão e Planejamento Ambiental',60,'ESP'),c('Hidrologia Geral',60,'PRO'),c('Obras Hidráulicas',60,'ESP'),c('Operações Unitárias',60,'ESP'),c('Qualidade da Água',60,'ESP'),c('Sistemas Urbanos de Esgoto',60,'ESP'),c('ACEX 4',75,'ACEX')],
  [c('Auditoria e Perícia Ambiental',60,'ESP'),c('Gestão Integrada de Bacias Hidrográficas',45,'ESP'),c('Optativa I',90,'OPT'),c('Recuperação de Áreas Degradadas',60,'ESP'),c('Poluição Atmosférica',45,'ESP'),c('Tratamento de Efluentes',60,'ESP'),c('ACEX 5',90,'ACEX')],
  [c('Gestão e Tratamento de Resíduos Sólidos',60,'ESP'),c('Optativa II',90,'OPT'),c('TCC I',30,'TCC'),c('Tratamento e Abastecimento de Água',60,'ESP')],
  [c('Estágio Supervisionado',165,'EST'),c('TCC II',30,'TCC')]
 ]},
 amb2014:{course:'Engenharia Ambiental',title:'Matriz 2014',note:'Matriz curricular do curso de Engenharia Ambiental — 2013/2014.',semesters:[
  [c('Introdução à Engenharia Ambiental',30,'BAS'),c('Biologia Geral',60,'BAS'),c('Cálculo Diferencial e Integral I',60,'BAS'),c('Química Geral',60,'BAS'),c('Metodologia da Pesquisa Científica',45,'BAS'),c('Língua Portuguesa',45,'BAS'),c('Álgebra Vetorial e Geometria Analítica',60,'BAS'),c('Filosofia e Ética',45,'BAS')],
  [c('Álgebra Linear',60,'BAS'),c('Física I',60,'BAS'),c('Química Orgânica',60,'BAS'),c('Introdução à Programação',60,'BAS'),c('Cálculo Diferencial e Integral II',60,'BAS'),c('Desenho Técnico',60,'BAS'),c('Ecologia Aplicada',60,'BAS')],
  [c('Cálculo Diferencial e Integral III',60,'BAS'),c('Física Experimental',60,'BAS'),c('Física II',60,'BAS'),c('Topografia',75,'PRO'),c('Técnicas de Programação',60,'PRO'),c('Estatística',60,'BAS'),c('Química Analítica',60,'BAS'),c('ATC I',45,'ACC')],
  [c('Introdução à Ciência dos Materiais',60,'PRO'),c('Física III',60,'BAS'),c('Mecânica Geral',75,'PRO'),c('Equações Diferenciais',60,'BAS'),c('Química Ambiental',60,'ESP'),c('Microbiologia',60,'ESP'),c('Solos I',60,'ESP'),c('ATC II',45,'ACC')],
  [c('Cálculo Numérico',60,'BAS'),c('Termodinâmica Aplicada',60,'PRO'),c('Fenômenos de Transporte',75,'PRO'),c('Geomática',60,'PRO'),c('Resistência dos Materiais',60,'PRO'),c('Meteorologia e Climatologia',60,'ESP'),c('Solos II',60,'ESP'),c('ATC III',45,'ACC')],
  [c('Economia',45,'BAS'),c('Estrutura de Concreto Armado',60,'PRO'),c('Legislação e Direito Ambiental',60,'BAS'),c('Hidráulica',60,'PRO'),c('Higiene e Segurança do Trabalho',45,'BAS'),c('Estabilidade das Construções',60,'PRO'),c('Energia e Meio Ambiente',60,'ESP'),c('ATC IV',45,'ACC')],
  [c('Administração',45,'BAS'),c('Hidrologia Geral',60,'PRO'),c('Sociologia',45,'BAS'),c('Operações Unitárias',60,'ESP'),c('Obras Hidráulicas',60,'ESP'),c('Gestão e Planejamento Ambiental',60,'ESP'),c('Optativa GAIA I',60,'OPT'),c('ATC V',45,'ACC')],
  [c('Tratamento e Abastecimento de Água',60,'ESP'),c('Poluição Atmosférica',45,'ESP'),c('Reatores Bioquímicos',60,'ESP'),c('Gestão Integrada de Bacias Hidrográficas',45,'ESP'),c('Instrumentação e Controle',60,'ESP'),c('Análise e Avaliação de Impactos Ambientais',60,'ESP'),c('Optativa SRH I',60,'OPT'),c('ATC VI',45,'ACC')],
  [c('Tratamento de Efluentes',60,'ESP'),c('Auditoria e Perícia Ambiental',60,'ESP'),c('Monitoramento Ambiental',60,'ESP'),c('Projetos de Engenharia Ambiental',60,'ESP'),c('Gestão e Tratamento de Resíduos Sólidos',60,'ESP'),c('Optativa GAIA II',60,'OPT'),c('Optativa SRH II',60,'OPT')],
  [c('Estágio Supervisionado',120,'EST'),c('Trabalho de Conclusão de Curso',120,'TCC')]
 ]}
};


const MATRIX_TOTALS={
  bsi2024:{hours:3200,componentHours:3090,credits:206,extra:'3.090h em componentes + 110h complementares.',semesterHours:[360,360,360,450,450,435,405,270]},
  bsi2017:{hours:3150,credits:210,extra:'3150h em componentes, incluindo estágio supervisionado de 330h e 200h de atividades complementares previstas no PPC.',semesterHours:[360,360,360,360,360,360,690,300]},
  mec2022:{hours:4125,credits:275,extra:'Total calculado pelos componentes do fluxograma julho/2022.',semesterHours:[420,420,420,420,480,480,420,480,240,345]},
  ele2023:{hours:3945,componentHours:3540,credits:263,extra:'3.540h sem ACEX; 3.945h com ACEX.',semesterHours:[390,435,405,435,420,450,450,315,300,345]},
  eleOld:{hours:3870,credits:258,extra:'Carga horária mínima do curso no fluxograma antigo.',semesterHours:[360,435,450,405,390,420,420,315,375,300]},
  civil2023:{hours:3885,credits:259,extra:'Total do quadro da estrutura curricular 2023.',semesterHours:[390,405,420,420,435,405,390,390,315,315]},
  qui2023:{hours:3420,credits:228,extra:'Inclui 210h de atividades complementares.',semesterHours:[330,360,390,420,420,405,450,435]},
  qui2017:{hours:3125,credits:217,extra:'Inclui AACC de 200h conforme fluxograma 2017.'},
  amb2022:{hours:3885,credits:259,extra:'Total geral do perfil de formação 2022.',semesterHours:[375,420,375,420,360,360,420,330,195,180]},
  amb2014:{hours:4140,credits:276,extra:'3.720h em disciplinas + 420h de ATC/TCC/estágio.',semesterHours:[405,420,435,435,435,390,390,390,420,240]}
};



window.FLUXOGRAMA_DATA = { COURSES, DOCS, DOC_PAGE_HINTS, DATA, MATRIX_TOTALS };
})();
