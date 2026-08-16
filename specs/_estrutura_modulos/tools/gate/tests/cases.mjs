/**
 * cases.mjs — um caso por regra do catálogo. Lei dona: specs/arquitetura/04-regras.md §7.3
 *
 * Cada caso parte do molde CONFORME e aplica **uma** mutação, afirmando que o gate acusa
 * exatamente aquele id. É o que impede duas falhas silenciosas:
 *   - regra que nunca acusa nada (passa por estar quebrada, não por conformidade);
 *   - regressão no gate que apaga uma regra sem ninguém notar.
 *
 * `regra` é o id esperado. `mutar(m)` recebe um punhado de operações sobre a cópia do molde.
 */

export const CASOS = [
  // --- Estrutura -----------------------------------------------------------------------------
  {
    regra: 'manifesto',
    descricao: 'id do manifesto diverge do nome da pasta',
    // Cascata legitima: com o id trocado, o prefixo `molde_` das tabelas passa a divergir de verdade.
    tambem: ['tabela-prefixo'],
    mutar: (m) => m.manifesto((x) => ({ ...x, id: 'outro-nome' })),
  },
  {
    regra: 'schema-manifesto',
    descricao: 'campo nao previsto no manifesto',
    mutar: (m) => m.manifesto((x) => ({ ...x, campoInventado: true })),
  },
  {
    regra: 'schema-manifesto',
    descricao: 'papel fora do vocabulario',
    // `role` e enum, e enum e o que o JSON Schema expressa — quem acusa e SO `schema-manifesto`,
    // `manifesto` cala (conferirVocabulario, structure.mjs). Nao declarar `tambem: ['manifesto']`
    // aqui e proposital: o precedente de `manifesto-raiz` ja e um id so com a mesma justificativa.
    mutar: (m) => m.manifesto((x) => ({ ...x, role: 'inventado' })),
  },
  {
    regra: 'estrutura',
    descricao: 'arquivo previsto na arvore ausente',
    // `config/textos.json` e item da arvore que so a `estrutura` cobra — `contract/openapi.yaml`
    // e coberto por outra regra (`contract`), nunca por esta.
    mutar: (m) => m.remover('config/textos.json'),
  },
  {
    regra: 'estrutura-estrita',
    descricao: 'entrada nao prevista na raiz do modulo',
    mutar: (m) => m.escrever('lixo.txt', 'nao previsto'),
  },
  {
    regra: 'schema-manifesto',
    descricao: 'CHAMARIZ: campo nao previsto, com relatorios/ e .coverage tambem presentes',
    // Prova, POR MAQUINA, que `relatorios` e `.coverage` continuam tolerados em
    // `ENTRADAS_PERMITIDAS` (structure.mjs) — sem depender de olhar o `Set` a olho. A regra
    // esperada aqui e OUTRA (schema-manifesto); se a tolerancia de qualquer uma das duas
    // regredir, `estrutura-estrita` acusa TAMBEM, um id que este caso nao declara em `tambem`, e
    // `run.mjs` reprova com "id NAO declarado" — o mesmo tipo de chamariz usado em outros casos.
    //
    // Sem pasta de verdade: o harness nao tem operacao de `mkdir` (so `escrever` grava ARQUIVO), e
    // a regra `estrutura-estrita` julga so o NOME de topo (`ctx.entradasRaiz`, por `readdirSync`),
    // nunca se e arquivo ou pasta — um arquivo chamado `relatorios` prova exatamente a mesma
    // linha de codigo que uma pasta `relatorios/` provaria.
    //
    // Conteudo medido (nao presumido): nenhum dos dois nomes tem extensao que bata `EXT_CODIGO`
    // (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.py`, context.mjs) — nenhum vira `ctx.codigo`, nenhuma regra
    // de conteudo (log, limiar-funcao, hardcode-url) os enxerga. `dist/` fica DE FORA deste
    // chamariz de proposito: `context.mjs:NAO_PERCORRER` ja o exclui de `ctx.entradasRaiz`
    // incondicionalmente (FORA de escopo, nao editado aqui) — nenhum caso, chamariz ou nao,
    // consegue fazer a tolerancia dele regredir de forma observavel (medido: removida de
    // `ENTRADAS_PERMITIDAS`, os tres bindings continuam 92/92 · 92/92 · 88/88, sem mudanca
    // nenhuma — ao contrario de `tsconfig.build.json`, que TRAVA a suite inteira ao ser removida).
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, campoOutroChamariz: true }));
      m.escrever('relatorios', 'lcov (fixture do chamariz — nunca lido como codigo)');
      m.escrever('.coverage', 'sqlite (fixture do chamariz — nunca lido como codigo)');
    },
  },
  {
    regra: 'web-declarado',
    descricao: 'webPath declarada sem pagina real',
    // Cascata legitima: sem as paginas, as chaves de `config/textos.json` ficam sem leitor. So em
    // TS/JS — o molde Python nasce sem `web/`, e por isso `tambem` e teto, nao obrigacao.
    //
    // `testes-web` e o co-achado inverso, e so no PYTHON: ligar `webPath` num molde que nasce sem
    // tela passa a exigir `tests/web/`, que ele nao tem. E defeito real do fixture mutado, nao
    // ruido — tela declarada sem teste e exatamente o que a regra persegue.
    tambem: ['config-morta', 'testes-web'],
    // Declara a webPath no proprio caso: assim vale tambem para molde que nasce sem tela
    // (o binding Python), em vez de depender do default de um binding especifico.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, webPath: '/molde' }));
      m.removerPasta('web/src/pages');
    },
  },
  {
    regra: 'artefato-declarado',
    descricao: 'generatesArtifact false com as pastas de artefato presentes',
    // Direcao "proibe": o molde nasce com as tres pastas, entao basta desligar a declaracao.
    mutar: (m) => m.manifesto((x) => ({ ...x, generatesArtifact: false })),
  },
  {
    regra: 'artefato-declarado',
    descricao: 'generatesArtifact true com generated/ ausente',
    // Direcao "exige" — e de proposito e a pasta `generated/`, cuja presenca so e visivel pela ENTRADA
    // da raiz: o conteudo dela fica fora de `ctx.arquivos`, entao `temArquivoEm` nunca a acharia.
    // Liga a condicao no proprio manifesto, como o `web-declarado`, para o caso nao depender do
    // default do binding.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, generatesArtifact: true }));
      m.removerPasta('generated');
    },
  },
  {
    regra: 'testes',
    descricao: 'tests/contract vazio',
    mutar: (m) => m.removerPasta('tests/contract'),
  },
  // --- estrutura obrigatoria da arvore do modulo -----------------------------------------------
  {
    regra: 'estrutura',
    descricao: 'core/domain/ vazio ou ausente',
    // `contem`: a familia `estrutura` tem QUATRO casos vizinhos sob o mesmo id
    // ("core/domain/", "core/ports/", "README.md", arquivo do binding) — sem isto, um extrator que
    // confunda pasta com pasta (ex.: acuse so "core/ports/" quando quem sumiu foi
    // "core/domain/") passa calado, porque "acusou `estrutura`" ja basta.
    contem: 'core/domain/ vazia ou ausente',
    mutar: (m) => m.removerPasta('core/domain'),
  },
  {
    regra: 'estrutura',
    descricao: 'core/ports/ vazio ou ausente',
    // Cascata legitima: `core/ports/index.*` e o UNICO lugar do modulo onde
    // a palavra "notificador" aparece em codigo (a interface da porta) — sem a pasta, config-morta
    // deixa de achar quem "le" a chave `notificador` de config/ports.json, e acusa TAMBEM.
    tambem: ['config-morta'],
    contem: 'core/ports/ vazia ou ausente',
    mutar: (m) => m.removerPasta('core/ports'),
  },
  {
    regra: 'estrutura',
    descricao: 'README.md ausente',
    contem: 'README.md ausente',
    mutar: (m) => m.remover('README.md'),
  },
  {
    regra: 'estrutura',
    descricao: 'arquivo obrigatorio do binding ausente (tsconfig.json/package.json em TS, '
      + 'package.json em JS, pyproject.toml em PY)',
    // `remover` usa `force: true` — arquivo que o binding em teste nao tem (ex.: pyproject.toml num
    // molde TS) e um no-op silencioso, entao as tres chamadas cobrem os tres bindings de um caso so.
    // `contem` sem `vezes`: a CONTAGEM varia por binding (TS perde dois arquivos, JS/PY perdem um so),
    // mas o SUFIXO da mensagem e fixo nos tres — e o que prova que o achado e deste ramo, nao de
    // "README.md ausente" ou de uma das pastas obrigatorias.
    contem: 'ausente — arquivo obrigatorio do binding',
    mutar: (m) => {
      m.remover('tsconfig.json');
      m.remover('package.json');
      m.remover('pyproject.toml');
    },
  },
  {
    regra: 'schema-manifesto',
    descricao: 'CHAMARIZ: campo nao previsto, com core/gateways/ ausente (opcional, NAO acusa)',
    // Prova, POR MAQUINA, que `core/gateways/` continua FORA do conjunto obrigatorio: modulo sem
    // `consumes` legitimamente nao tem gateway nenhum, e cobra-lo em `estrutura` seria falso positivo
    // garantido. Se a exclusao regredir, `estrutura` acusa TAMBEM — um id que este caso nao declara
    // em `tambem` — e `run.mjs` reprova com "id NAO declarado".
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, campoChamarizM: true }));
      m.removerPasta('core/gateways');
    },
  },

  // --- Isolamento ----------------------------------------------------------------------------
  {
    regra: 'import-lateral',
    descricao: 'importa package de outro modulo',
    mutar: (m) => m.escrever('core/domain/mau.ts', "import { x } from '@escopo/vizinho';\nexport const y = x;\n"),
    exigeVizinho: true,
  },
  {
    regra: 'import-adapter',
    descricao: 'importa adapter em vez de receber injetado',
    mutar: (m) => m.escrever('core/domain/mau.ts', "import { criar } from '../../adapters/memory/index.js';\nexport const y = criar;\n"),
  },
  {
    regra: 'import-adapter',
    descricao: 'importa adapter pela forma pontilhada do Python ("adapters.memory")',
    // `EXT_CODIGO` (context.mjs) e universal aos tres bindings, entao um `.py` cai em `ctx.codigo`
    // mesmo dentro do molde TS/JS — o mesmo por que o caso acima usa `.ts` nos tres. Sem este caso,
    // a forma pontilhada (`from adapters.memory import x`) passaria limpa pela regra inteira.
    mutar: (m) => m.escrever('core/domain/mau_pontilhado.py', 'from adapters.memory import criar\n\ny = criar\n'),
  },
  {
    regra: 'sdk-fornecedor',
    descricao: 'SDK de fornecedor dentro do modulo',
    mutar: (m) => m.escrever('core/domain/mau.ts', "import pg from 'pg';\nexport const y = pg;\n"),
  },
  {
    regra: 'gateway-http',
    descricao: 'gateway falando com banco',
    // Cascata legitima: o arquivo novo em `core/gateways/` nao tem entrada em `consumes` — nem teste
    // que o espelhe. Sao os outros dois lados do triangulo `gateway <-> consumes <-> teste`.
    tambem: ['gateway-declarado', 'testes-gateway'],
    mutar: (m) => m.escrever('core/gateways/vizinho.ts', "export const q = 'select 1 from t';\nexport async function f(c) { return c.query(q); }\n"),
  },
  {
    regra: 'gateway-declarado',
    descricao: 'gateway sem entrada em consome',
    // Cascata legitima: o gateway novo tambem nasce sem teste que o espelhe.
    tambem: ['testes-gateway'],
    // O SQL em COMENTARIO trava a nao-acusacao de `gateway-http`: o barril da pasta documenta em
    // comentario o que o gateway nao pode fazer, e sobre o texto cru essa documentacao vira
    // violacao dela mesma. Se a regra regredir, emite id nao declarado e este caso reprova.
    mutar: (m) => m.escrever(
      'core/gateways/vizinho.ts',
      '// NAO faca aqui: select nome from vizinho_metadados\n'
      + 'export async function f(u) { return fetch(u); }\n',
    ),
  },
  {
    regra: 'consome-ciclo',
    descricao: 'ciclo no grafo de consome',
    // Cascata legitima: declarar `consumes` sem criar `core/gateways/vizinho.*` e defeito de verdade.
    tambem: ['gateway-declarado'],
    // O contrato declarado tem de EXISTIR na spec do vizinho (`/resumo` e obrigatoria em todo
    // modulo). Com `GET /x`, este caso violaria tambem `consome-contrato` e deixaria de exercitar
    // uma regra so — caso de teste com duas violacoes nao prova qual das duas esta viva.
    mutar: (m) => {
      m.manifesto((x) => ({
        ...x,
        consumes: [{ module: 'vizinho', contract: 'GET /resumo', why: 'ciclo' }],
        requiredEnv: [...x.requiredEnv, 'VIZINHO_URL'],
      }));
      // A chave nova tem de chegar ao `.env.example`, senao o caso violava tambem `env-exemplo` —
      // ruido do fixture, nao defeito do grafo de `consumes`.
      m.acrescentar('.env.example', 'VIZINHO_URL=\n');
    },
    exigeVizinho: true,
    vizinhoConsome: true,
  },
  {
    regra: 'consome-contrato',
    descricao: 'consome rota que o contrato do dono nao declara',
    // Cascata legitima: o gateway que acompanha a entrada em `consumes` nasce sem teste.
    tambem: ['testes-gateway'],
    mutar: (m) => {
      // O gateway acompanha a entrada em `consumes` (senao violaria tambem `gateway-declarado`),
      // e nada e acrescentado a `requiredEnv` (senao violaria `env-exemplo`). Este caso acusa
      // UM id — e o unico jeito de o autoteste provar que e ESTA regra que esta viva.
      m.escrever('core/gateways/vizinho.ts', 'export async function f(u) { return fetch(u); }\n');
      m.manifesto((x) => ({
        ...x,
        consumes: [{ module: 'vizinho', contract: 'GET /rota-aposentada', why: 'deriva de contrato' }],
      }));
    },
    exigeVizinho: true,
  },

  {
    regra: 'adapter-isolado',
    descricao: 'adapter importando de modules/',
    // O defeito que mata a extraibilidade em silencio: no dia em que o adapter conhece um modulo,
    // ele deixa de ser substituivel e o modulo deixa de sair da pasta.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nimport { algo } from '../../modules/_template/core/domain/index.js';\n",
      py: '\nfrom modules._template.core.domain import algo\n',
    }),
  },
  {
    regra: 'adapter-isolado',
    descricao: 'adapter importando da fiacao (src/)',
    // A SEGUNDA clausula da regra, com caso proprio: sob um id so, ela poderia parar de acusar sem
    // nada falhar. A fiacao INSTANCIA o adapter — depender dela inverte a direcao.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nimport { resolverAuth } from '../../src/composicao.js';\n",
      py: '\nfrom src.composicao import resolver_auth\n',
    }),
  },
  {
    regra: 'portas-pura',
    descricao: 'porta importando o adapter que deveria implementa-la',
    // A inversao do vertice do diagrama: `adapters/ ──> packages/ports/` vira mao dupla, e a
    // interface canonica passa a depender de uma implementacao.
    mutar: (m) => m.acrescentarEm('portasRaiz', {
      js: "\nimport { criarRepositorio } from '../../adapters/memory/index.js';\n",
      py: '\nfrom adapters.memory import RepositorioEmMemoria\n',
    }),
  },
  {
    regra: 'portas-pura',
    descricao: 'SDK de fornecedor na interface canonica, com o MESMO SDK legitimo no adapter',
    // Duas afirmacoes num caso so, e a segunda e a que trava a regra contra si mesma:
    //
    //   (a) `pg` em `packages/ports/` REPROVA — `sdk-fornecedor` mantem o driver fora de cada
    //       modulo, e a porta o devolveria a TODOS de uma vez, porque todo modulo importa a porta;
    //   (b) o MESMO `pg` em `adapters/` NAO e acusado — e exatamente o lugar dele.
    //
    // (b) so vale como prova por causa da regra do harness: id nao declarado REPROVA. Se
    // `adapter-isolado` algum dia passar a acusar dependencia externa, este caso falha na hora —
    // e e o unico jeito de a nao-acusacao ficar coberta por maquina, e nao por inspecao.
    mutar: (m) => {
      m.acrescentarEm('portasRaiz', { js: "\nimport pg from 'pg';\n", py: '\nimport psycopg2\n' });
      m.acrescentarEm('adapterRaiz', { js: "\nimport pg from 'pg';\n", py: '\nimport psycopg2\n' });
    },
  },
  {
    regra: 'composicao-descoberta',
    descricao: 'composicao importando modulo em vez de descobri-lo',
    // O par que separa DEPENDENCIA de DESCOBERTA: o mesmo arquivo, intocado, alcanca todos os
    // modulos por `readdirSync` + `module.json` e passa limpo no caso "molde conforme"; com um
    // IMPORT, acusa. Uma regra que procurasse a string `modules` acusaria os dois.
    mutar: (m) => m.acrescentarEm('composicaoRaiz', {
      js: "\nimport { algo } from '../modules/_template/core/domain/index.js';\n",
      py: '\nfrom modules._template.core.domain import algo\n',
    }),
  },
  {
    regra: 'ui-kit',
    descricao: 'ui.modo kit importando biblioteca de UI bruta',
    // Liga `ui.modo: "kit"` no manifesto: os moldes nascem `proprio`, entao depender do default
    // deixaria as duas regras de UI sem exercicio nenhum.
    //
    // Um id so, e nao dois achados de ids diferentes: as DUAS clausulas do `ui-kit` disparam aqui
    // (importa a bruta, e nada em `web/` importa o kit) — sao duas mensagens do mesmo defeito de
    // declaracao, sob o mesmo id, e e assim que a regra foi escrita.
    //
    // No molde Python o arquivo estoura ENOENT (nao ha `web/`) e o runner marca SEM COBERTURA. E o
    // correto: la a regra silencia por desenho, e "sem cobertura" nao e aprovacao.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, ui: { ...x.ui, modo: 'kit' } }));
      m.escrever(
        'web/src/components/Bruto.tsx',
        "import { Button } from '@mui/material';\nexport const Botao = Button;\n",
      );
    },
  },
  {
    regra: 'ui-token',
    descricao: 'literal de cor em declaracao de estilo, com o kit importado corretamente',
    // O arquivo IMPORTA o kit de proposito: sem isso a clausula (b) do `ui-kit` acusaria junto e o
    // caso deixaria de provar qual das duas regras esta viva. `<escopo>` e trocado em memoria pelo
    // carregador do contexto, entao o import vale nos tres bindings.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, ui: { ...x.ui, modo: 'kit' } }));
      m.escrever(
        'web/src/components/Cores.tsx',
        "import { Caixa } from '@<escopo>/ui-kit';\n"
        + 'export const Destaque = () => <Caixa style={{ color: \'#ff0000\' }} />;\n',
      );
    },
  },

  {
    regra: 'ui-token',
    descricao: 'literal de cor em folha de estilo (.css), que nao e arquivo de codigo',
    // O `.css` nao entra em `ctx.codigo` (filtrado por extensao de linguagem), entao sem esta
    // varredura ele nunca chega a regra — e `color: #ff0000` em CSS e `propriedade: valor`, a
    // forma exata que o recorte persegue. Fica limpo onde, em `ui.modo: "kit"`, a cor mais vive.
    //
    // O `.tsx` importa o kit para a clausula (b) do `ui-kit` nao acusar junto: este caso emite UM id.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, ui: { ...x.ui, modo: 'kit' } }));
      m.escrever(
        'web/src/components/DoKit.tsx',
        "import { Caixa } from '@<escopo>/ui-kit';\nexport const C = Caixa;\n",
      );
      m.escrever(
        'web/src/estilos.css',
        '/* Nem #ffffff nem font-family: Inter num comentario contam — linhasCodigo descarta. */\n'
        + '.botao {\n  color: #ff0000;\n}\n',
      );
    },
  },

  // --- Dados ---------------------------------------------------------------------------------
  {
    regra: 'schema-nao-public',
    descricao: 'schema do banco e public',
    mutar: (m) => m.manifesto((x) => ({ ...x, data: { ...x.data, schema: 'public' } })),
  },
  {
    regra: 'tabela-prefixo',
    descricao: 'tabela declarada sem o prefixo do modulo',
    // Cascata legitima: a tabela nova nao existe no SQL do modulo.
    //
    // Sem cobrir `tabela-declarada` aqui, a tabela ausente do SQL cairia no `rls` com a mensagem
    // errada — "sem ENABLE ROW LEVEL SECURITY" —, quando o problema e que ela nao existe. `rls`
    // so pergunta de tabela que o SQL cria, e o achado tem a mensagem certa.
    tambem: ['tabela-declarada'],
    mutar: (m) => m.manifesto((x) => ({ ...x, data: { ...x.data, tables: [...x.data.tables, 'clientes'] } })),
  },
  {
    regra: 'tabela-declarada',
    descricao: 'tabela declarada em dados.tabelas e sem CREATE TABLE no SQL',
    // `dados.tabelas` declara a tabela sem `CREATE TABLE` correspondente no SQL — gap que
    // `artefato-declarado` nao cobre (ela nao entra em `database/`).
    //
    // Com o PREFIXO certo, senao `tabela-prefixo` acusaria junto. `rls` fica CALADA de proposito:
    // se acusasse esta mesma tabela, a mensagem seria "sem ENABLE ROW LEVEL SECURITY" — errada
    // para uma tabela que nao existe.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      data: { ...x.data, tables: [...x.data.tables, '<modulo>_inexistente'] },
    })),
  },
  {
    regra: 'tabela-alheia',
    descricao: 'referencia tabela de outro modulo',
    mutar: (m) => m.escrever('core/domain/mau.ts', "export const q = 'select * from vizinho_metadados';\n"),
    exigeVizinho: true,
  },
  {
    regra: 'migrations',
    descricao: 'migration sem bloco de rollback',
    mutar: (m) => m.escrever('database/migrations/0002-cria-outra.sql', 'create table x (id uuid);\n'),
  },
  {
    regra: 'rls',
    descricao: 'tabela declarada sem ENABLE ROW LEVEL SECURITY',
    // `rls` e AVISO, e o harness coleta achado de qualquer nivel — `analisar` nao filtra por nivel
    // e `verificarCaso` compara ids. `tambem` e TETO: se `rls` parasse de acusar aqui, nada
    // falharia sem este caso proprio.
    //
    // O ALTER sai dos DOIS arquivos: a regra le TODO o SQL do modulo junto (`ctx.sql`), entao
    // apaga-lo so do `schema.sql` deixa a copia da migration responder por ele e a regra
    // continua — com razao — calada. Um so lugar nao e o defeito; o defeito e a tabela nao ter
    // RLS em lugar nenhum, que e o esquecimento real que a regra persegue.
    //
    // Agnostico de binding: os dois arquivos sao identicos nos tres moldes. `migrations` segue
    // calada — ela cobra nome e bloco de rollback, e nenhum dos dois muda aqui.
    mutar: (m) => {
      const alter = 'alter table "<escopo>"."<modulo>_auditoria" enable row level security;';
      m.substituir('database/schema.sql', alter, '');
      m.substituir('database/migrations/0001-cria-metadados.sql', alter, '');
    },
  },

  // --- Configuracao e ambiente ---------------------------------------------------------------
  {
    regra: 'config-valida',
    descricao: 'config/*.json presente e com JSON quebrado',
    // PRESENTE e ilegivel — as duas coisas ao mesmo tempo, que e o que separa esta regra da
    // `estrutura` (que so cobra presenca). `schema-config` e `config-morta` pulam valor nulo de
    // proposito, entao o defeito acusa UM id.
    mutar: (m) => m.escrever('config/domain.json', '{ "statusValidos": [\n'),
  },
  {
    regra: 'config-morta',
    descricao: 'chave de config declarada e nunca lida',
    // `domain` tem schema LIVRE por definicao, entao a chave nova nao trombra com `schema-config`.
    mutar: (m) => m.config('domain', (x) => ({ ...x, chaveNuncaLida: 'sem leitor' })),
  },
  {
    regra: 'env-fora-do-carregador',
    descricao: 'env lida fora do carregador de config',
    // `process.env` NU: sem chave `<MODULO>_*` (senao acusaria `env-declarado`) e sem default
    // literal (senao acusaria `fallback-silencioso`). Isola a regra, que ate aqui so vivia como
    // `tambem` de casos alheios.
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export const ambiente = process.env;\n'),
  },
  {
    regra: 'gitignore-segredo',
    descricao: '.gitignore do projeto sem .env nem modules/*/.env',
    // `../../` sobe para a raiz do PROJETO, como nos casos das outras regras de projeto. O ignore
    // continua existindo e valido — so deixou de cobrir o segredo, que e o defeito sob teste.
    mutar: (m) => m.escrever('../../.gitignore', 'node_modules/\ndist/\n'),
  },
  {
    regra: 'segredo-em-publico',
    descricao: 'credencial declarada em env de prefixo publico (vai para o bundle)',
    // `role: "gateway"` cala o `gateway-credencial`, que isenta o gateway porque credencial e o
    // oficio dele — e assim o caso acusa UM id. A escolha tambem diz o que a regra afirma: nem o
    // gateway, dono da credencial, pode publica-la no bundle do front.
    mutar: (m) => {
      m.manifesto((x) => ({
        ...x,
        role: 'gateway',
        requiredEnv: [...x.requiredEnv, 'VITE_MOLDE_API_KEY'],
      }));
      // Sem isto o caso violava tambem `env-exemplo` — ruido do fixture, nao do defeito.
      m.acrescentar('.env.example', 'VITE_MOLDE_API_KEY=\n');
    },
  },
  {
    regra: 'random-inseguro',
    descricao: 'token gerado com Math.random fora de core/',
    // FORA de `core/` de proposito: dentro dele quem cobra e o `determinismo`, e este caso existe
    // para provar que a regra alcanca o territorio que o `determinismo` nao cobre.
    mutar: (m) => m.escrever(
      'api/src/tokens.ts',
      'export function novoToken() {\n  return String(Math.random());\n}\n',
    ),
  },
  {
    regra: 'verificacao-declarada',
    descricao: 'projeto sem config/verificacao.json na raiz',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO: e la que a politica mora, e e por
    // isso que estas duas regras leem `ctx.projeto` em vez do modulo.
    mutar: (m) => m.remover('../../config/verificacao.json'),
  },
  {
    regra: 'conformidade-declarada',
    descricao: 'projeto sem config/conformidade.json na raiz',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO, como `verificacao-declarada`.
    mutar: (m) => m.remover('../../config/conformidade.json'),
  },
  {
    regra: 'conformidade-declarada',
    descricao: 'chave em ingles na lista de excecoes ("module" em vez de "modulo")',
    // O defeito medido em 2026-08-15: exececao com chave errada nao pegava a violacao, e nada
    // dizia por que. `additionalProperties:false` reprova o campo a mais, e o `modulo` obrigatorio
    // ausente reprova junto — um erro, duas mensagens, as duas apontando a forma certa.
    mutar: (m) => m.escrever(
      '../../config/conformidade.json',
      JSON.stringify({ excecoes: [{ module: 'legado', regra: 'estrutura-estrita', motivo: 'x', decisao: 'ADR-001' }], excecoesCve: [] }),
    ),
  },
  {
    regra: 'lint-derivado',
    descricao: 'config do linter editada a mao, divergindo da fonte dos limiares',
    // A regra compara BYTE A BYTE com o que o gerador produziria, entao qualquer edicao manual e o
    // defeito — nao so a troca de um numero. Alvo logico + trecho por sintaxe: o arquivo e
    // `eslint.config.js` em TS/JS e `.ruff.toml` no Python, e o comentario muda de marcador junto.
    mutar: (m) => m.acrescentarEm('lintRaiz', {
      js: '\n// limiar ajustado a mao, fora de tools/gate/thresholds.mjs\n',
      py: '\n# limiar ajustado a mao, fora de tools/gate/thresholds.mjs\n',
    }),
  },
  {
    regra: 'pre-commit-instalado',
    descricao: 'projeto sem .githooks/pre-commit na raiz',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO, como nos demais casos de escopo raiz.
    mutar: (m) => m.remover('../../.githooks/pre-commit'),
  },
  {
    regra: 'pre-commit-instalado',
    descricao: '.githooks/pre-commit existe mas nao invoca a cadeia de verificacao',
    mutar: (m) => m.escrever('../../.githooks/pre-commit', '#!/bin/sh\necho "oi"\n'),
  },
  {
    regra: 'testes-web',
    descricao: 'webPath declarada e tests/web/ apagada',
    // Nao mexe no manifesto: o molde de TS/JS ja nasce com `webPath`, e usar a declaracao REAL e o
    // que faz o caso provar a condicional em vez de fabrica-la. `removerPastaEm` (e nao
    // `removerPasta`) porque no Python o alvo nao existe: la o caso vira SEM COBERTURA declarada, e
    // nao um "nenhum achado" que culparia a regra por um molde que nasce sem tela.
    mutar: (m) => m.removerPastaEm('pastaTestesWeb'),
  },
  {
    regra: 'testes-gateway',
    descricao: 'gateway real e declarado, e sem teste que o espelhe',
    // O terceiro lado do triangulo. Os outros dois ficam SATISFEITOS de proposito — o arquivo tem
    // entrada em `consumes` (cala `gateway-declarado`) e a rota existe na spec do vizinho (cala
    // `consome-contrato`) —, entao o caso acusa UM id: a dependencia esta declarada, conforme, e
    // sem uma linha de teste que a exercite. E exatamente o buraco que a regra fecha.
    //
    // Sem SQL nem URL literal no corpo, para `gateway-http` e `hardcode-url` tambem calarem.
    mutar: (m) => {
      m.escrever('core/gateways/vizinho.ts', 'export async function obter(u) { return fetch(u); }\n');
      m.manifesto((x) => ({
        ...x,
        consumes: [{ module: 'vizinho', contract: 'GET /resumo', why: 'prova do triangulo' }],
      }));
    },
    exigeVizinho: true,
  },
  {
    regra: 'manifesto-raiz',
    descricao: 'projeto sem project.json na raiz',
    // A raiz e a unidade menos verificada e a que concentra o risco: o modulo e proibido de tocar
    // banco, importar adapter e ler env fora do carregador, entao conexao, query e credencial
    // acontecem todas la. Sem manifesto, nada disso e declarado.
    //
    // `env-raiz-declarado` cala de proposito quando o manifesto nao e legivel — um defeito, uma
    // mensagem —, entao este caso acusa UM id.
    mutar: (m) => m.remover('../../project.json'),
  },
  {
    regra: 'manifesto-raiz',
    descricao: 'campo nao previsto no manifesto da raiz',
    // A trava contra o vicio desta base, em forma de teste: campo novo em `project.json` REPROVA
    // ate que exista a regra que o cobra. `ui`, `exportsSummary` e `generatesArtifact` ficaram anos
    // declarados sem verificador porque nada impedia o campo de entrar sozinho.
    mutar: (m) => m.manifestoRaiz((x) => ({ ...x, ports: ['repositorio'] })),
  },
  {
    regra: 'env-raiz-declarado',
    descricao: 'env da raiz usada na fiacao e ausente de project.json',
    // Sem esta regra, o `.env.example` da raiz sai so dos manifestos de MODULO, entao o
    // `JWT_SECRET` do `resolverAuth()` nasce orfao — invisivel a `env-declarado` e a
    // `env-exemplo`, que sao regras por modulo. O segredo mais sensivel fica o unico sem dono.
    //
    // Alvo logico + trecho por sintaxe: a fiacao le env de forma diferente em cada binding.
    mutar: (m) => m.acrescentarEm('composicaoRaiz', {
      js: '\nexport const segredoJwt = process.env.RAIZ_JWT_SECRET;\n',
      py: '\n\nSEGREDO_JWT = os.environ["RAIZ_JWT_SECRET"]\n',
    }),
  },
  {
    regra: 'env-raiz-declarado',
    descricao: 'env declarada em project.json e sem leitor na fiacao',
    // O sentido inverso, e ele nao e simetria decorativa: a chave declarada entra no `.env.example`
    // e passa a EXIGIR do operador um valor que nada le. Mutacao agnostica de binding — so JSON.
    mutar: (m) => m.manifestoRaiz((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'RAIZ_SEM_LEITOR'] })),
  },
  {
    regra: 'sql-concatenado',
    descricao: 'query montada por concatenacao no adapter',
    // A fiacao e onde a query NASCE: o modulo nao pode ter driver (`sdk-fornecedor`) nem importar
    // adapter (`import-adapter`), entao quem fala com o banco e este arquivo. A metade que sobra
    // (SQL montado DENTRO do modulo) e da `sql-no-modulo`,
    // logo abaixo: a MESMA linha, na outra colecao, e nenhum arquivo cai nas duas.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nexport const buscar = (db, id) => db.query('select * from registros where hash = ' + id);\n",
      py: '\n\ndef buscar(db, id):\n    return db.execute("select * from registros where hash = " + id)\n',
    }),
  },
  {
    regra: 'sql-no-modulo',
    descricao: 'SQL montado dentro do modulo e entregue a uma porta',
    // Vetor residual medido: a superficie canonica de `packages/ports/` e tipada por
    // OPERACAO e nao aceita comando, mas o `core/ports/` do MODULO e escrito pelo autor dele e
    // ninguem compara as duas formas. Com um `executarConsulta(sql)` declarado la, a concatenacao
    // fica no modulo e a execucao na raiz — e a `sql-concatenado` ve o `.query(sql)` do adapter sem
    // ver como a string nasceu.
    //
    // `alguma_coisa` nao e tabela de modulo nenhum de proposito: com o nome de um vizinho o caso
    // acusaria tambem `tabela-alheia` e deixaria de provar qual regra esta viva.
    mutar: (m) => m.escrever(
      'core/domain/consulta-crua.ts',
      'export const buscar = (deps, filtro) =>\n'
        + "  deps.repositorio.executarConsulta('select hash from alguma_coisa where titulo = ' + filtro);\n",
    ),
  },
  {
    regra: 'hardcode-url-raiz',
    descricao: 'URL de infraestrutura literal na fiacao',
    // O gemeo de `hardcode-url`, com a MESMA `URL_LITERAL`. O adapter e onde o endereco do
    // fornecedor de verdade aparece, e e o territorio que o gemeo de modulo nunca alcancou.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nexport const base = 'https://api.exemplo.com';\n",
      py: '\nBASE = "https://api.exemplo.com"\n',
    }),
  },
  {
    regra: 'fallback-raiz',
    descricao: 'default silencioso de env na composicao',
    // A chave e DECLARADA no manifesto da raiz de proposito: sem isso o caso acusaria tambem
    // `env-raiz-declarado`, e deixaria de provar qual das duas esta viva. E a declaracao
    // mostra que as duas nao brigam — `env-raiz-declarado` cobra a chave nao declarada e NAO proibe
    // a leitura; ler o ambiente e o oficio da composicao. O que esta regra proibe e o DEFAULT.
    mutar: (m) => {
      m.manifestoRaiz((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'RAIZ_PORTA'] }));
      // A chave em COMENTARIO trava a nao-acusacao de `env-raiz-declarado`: se ela voltar a ler
      // `conteudo` cru, acusa `RAIZ_SO_EM_COMENTARIO` como usada-e-nao-declarada, emite id nao
      // declarado, e este caso reprova.
      m.acrescentarEm('composicaoRaiz', {
        js: '\n// Exemplo, nao uso: process.env.RAIZ_SO_EM_COMENTARIO\n'
          + "export const porta = process.env.RAIZ_PORTA ?? 'padrao';\n",
        py: '\n# Exemplo, nao uso: os.environ["RAIZ_SO_EM_COMENTARIO"]\n'
          + 'import os\n\nPORTA = os.environ.get("RAIZ_PORTA", "padrao")\n',
      });
    },
  },
  {
    regra: 'segredo-em-log',
    descricao: 'credencial declarada em project.json indo para o log, ao lado de chave inocente',
    // O sinal vem de onde JA existe declaracao: `project.json:requiredEnv` cruzado com o mesmo
    // vocabulario fechado de sufixo de credencial de `gateway-credencial`. A raiz nao tem
    // `sensitiveFields` — `project.schema.json` declara um campo so, com
    // `additionalProperties: false` fechando a porta de proposito.
    //
    // As DUAS chaves entram na mesma linha de log: `RAIZ_JWT_SECRET` casa o sufixo de credencial e
    // e acusada; `RAIZ_API_BASE_URL` nao casa e passa. Declarar as duas tambem cala
    // `env-raiz-declarado`, nos dois sentidos — declaradas e usadas.
    mutar: (m) => {
      m.manifestoRaiz((x) => ({
        ...x,
        requiredEnv: [...x.requiredEnv, 'RAIZ_JWT_SECRET', 'RAIZ_API_BASE_URL'],
      }));
      m.acrescentarEm('composicaoRaiz', {
        js: '\nexport const conferir = (logger) =>\n'
          + "  logger.error('conferindo', process.env.RAIZ_JWT_SECRET, process.env.RAIZ_API_BASE_URL);\n",
        py: '\nimport os\n\n\ndef conferir(logger):\n'
          + '    logger.error("conferindo", os.environ["RAIZ_JWT_SECRET"], os.environ["RAIZ_API_BASE_URL"])\n',
      });
    },
  },
  {
    regra: 'porta-declarada',
    descricao: 'porta CONFIGURADA em config/ports.json e ausente do manifesto',
    // A primeira das duas brechas que o `$comentario` do schema afirmava fechar e nao fechava:
    // `storage` esta no vocabulario do schema, entao `schema-config` passa. O caso acusa UM id.
    mutar: (m) => m.config('ports', (x) => ({ ...x, storage: 'disco' })),
  },
  {
    regra: 'porta-declarada',
    descricao: 'porta DECLARADA no manifesto e ausente de config/ports.json',
    // A segunda brecha: o schema nao tem `required`, entao porta declarada e nunca configurada
    // passaria. `storage` esta no enum do module.schema.json, entao `schema-manifesto` tambem cala.
    // Esta e a direcao que DERRUBA O BOOT — `resolverDependencias` nao acha o provedor e lanca.
    mutar: (m) => m.manifesto((x) => ({ ...x, ports: [...x.ports, 'storage'] })),
  },
  {
    regra: 'navegacao-declarada',
    descricao: 'navegacao declarada com webPath nula',
    // Declara os DOIS lados no proprio caso, como o `web-declarado` faz: assim vale nos tres
    // bindings, e nao depende de o molde daquele binding nascer com tela (o Python nao nasce).
    //
    // `web-declarado` e `testes-web` tem a mesma guarda `webPath == null` e ficam caladas — e e
    // justamente o que torna este achado necessario: com a tela zerada, ninguem mais notaria a
    // entrada de menu apontando para o nada.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      webPath: null,
      navigation: { label: 'Molde', icon: 'Box', order: 100 },
    })),
  },
  {
    regra: 'permissao-literal',
    descricao: 'permissao escrita como literal no argumento de requirePermission',
    // Nao registra rota: um `router.get` novo violaria tambem `contrato-sincronizado`, e o caso
    // deixaria de provar qual regra esta viva. So a chamada, com o literal que a regra persegue.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: "\nexport const exigirLiteral = (req) => requirePermission('molde:ler')(req);\n",
      py: '\n\ndef exigir_literal(request):\n    require_permission(request, "molde:ler")\n',
    }),
  },
  {
    regra: 'schema-config',
    descricao: 'nivelLog fora do vocabulario',
    mutar: (m) => m.config('api', (x) => ({ ...x, nivelLog: 'gritante' })),
  },
  {
    regra: 'cors-aberto',
    descricao: 'CORS liberado com asterisco',
    mutar: (m) => m.config('seguranca', (x) => ({ ...x, cors: { ...x.cors, origensPermitidas: ['*'] } })),
  },
  {
    regra: 'hardcode-url',
    descricao: 'URL literal no codigo',
    // A segunda linha trava uma NAO-acusacao, pela tecnica do caso do `log`: SQL PARAMETRIZADO
    // dentro do modulo nao e defeito de `sql-no-modulo`, cujo recorte exige que o valor entre na
    // string. Se ela perder o discriminador de injecao e passar a acusar "qualquer SQL", o id sai
    // aqui como NAO declarado e o autoteste reprova na hora — que e a unica forma de o harness
    // afirmar um silencio.
    mutar: (m) => m.escrever(
      'core/domain/mau.ts',
      "export const base = 'https://api.exemplo.com';\n"
        + "export const consulta = 'select hash from alguma_coisa where titulo = $1';\n",
    ),
  },
  {
    regra: 'hardcode-numero',
    descricao: 'literal numerico de infraestrutura no codigo',
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export const timeoutMs = 30000;\n'),
  },
  {
    regra: 'fallback-silencioso',
    descricao: 'default silencioso de env',
    // Cascata legitima: a mesma linha embute URL literal e le env fora do carregador.
    tambem: ['hardcode-url', 'env-fora-do-carregador'],
    mutar: (m) => m.escrever('core/domain/mau.ts', "export const u = process.env['X'] ?? 'http://localhost';\n"),
  },
  {
    regra: 'env-declarado',
    descricao: 'env usada e nao declarada no manifesto',
    // Cascata legitima: ler env dentro de `core/` e, por definicao, fora do carregador.
    tambem: ['env-fora-do-carregador'],
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export const s = process.env.MOLDE_SEGREDO_NOVO;\n'),
  },
  {
    regra: 'env-exemplo',
    descricao: '.env.example divergente do manifesto',
    mutar: (m) => m.escrever('.env.example', 'MOLDE_API_PORT=\n'),
  },
  {
    regra: 'env-modulo',
    descricao: '.env do modulo com chave de outro modulo',
    mutar: (m) => m.escrever('.env', 'ENV_RAIZ=../../.env\nVIZINHO_DB_URL=x\n'),
  },

  // --- Contrato ------------------------------------------------------------------------------
  {
    regra: 'contrato',
    descricao: 'contrato sem os endpoints obrigatorios',
    // Cascata legitima e inevitavel: a spec minima omite as rotas obrigatorias que o codigo
    // registra, entao divergir do codigo e consequencia do proprio defeito sob teste. E, pela mesma
    // razao, as tres entradas de `publicRoutes` deixam de apontar para rota que existe — defeito
    // real, e nao ruido: uma spec sem `/health` faz "GET /health" isentar coisa nenhuma.
    tambem: ['contrato-sincronizado', 'rota-publica-autenticada'],
    // O `servers:` e as `properties:` entram na spec minima de proposito: sem eles o caso acusaria
    // tambem `rota-nomenclatura` e `projecao-contrato`, e deixaria de provar a ausencia das rotas
    // OBRIGATORIAS, que e o dele. As propriedades sao TODAS as que os mapeadores do molde projetam
    // (toContract, toMeta, toCollection — os tres sao vistos, nao so o primeiro).
    mutar: (m) => m.escrever(
      'contract/openapi.yaml',
      [
        'openapi: 3.1.0',
        'servers:',
        '  - url: /api/v1/<modulo>',
        'paths:',
        '  /outra:',
        '    get:',
        '      responses:',
        '        200:',
        '          description: ok',
        '          content:',
        '            application/json:',
        '              schema:',
        '                type: object',
        '                properties:',
        '                  hash: { type: string }',
        '                  titulo: { type: string }',
        '                  status: { type: string }',
        '                  criadoEm: { type: string }',
        '                  id: { type: string }',
        '                  name: { type: string }',
        '                  version: { type: string }',
        '                  role: { type: string }',
        '                  basePath: { type: string }',
        '                  webPath: { type: string }',
        '                  navigation: { type: object }',
        '                  exportsSummary: { type: boolean }',
        '                  itens: { type: array }',
        '                  pagina: { type: integer }',
        '                  tamanho: { type: integer }',
        '                  total: { type: integer }',
        '',
      ].join('\n'),
    ),
  },
  {
    regra: 'contrato',
    descricao: 'spec valida em flow style, que o leitor de bloco nao le',
    // OpenAPI VALIDO: declara servers, /health, /meta e /resumo. So que em flow style. O gate tem
    // de acusar UMA vez que nao consegue ler — nunca afirmar que as rotas faltam, que e falso.
    mutar: (m) => m.escrever(
      'contract/openapi.yaml',
      [
        'openapi: 3.1.0',
        'servers: [{url: /api/v1/<modulo>}]',
        'paths: {"/health": {get: {responses: {"200": {description: ok}}}},'
          + ' "/meta": {get: {responses: {"200": {description: ok}}}},'
          + ' "/resumo": {get: {responses: {"200": {description: ok}}}}}',
        '',
      ].join('\n'),
    ),
  },
  {
    regra: 'contrato',
    descricao: 'paths em bloco, com recuo diferente de 2',
    // Prova que a deteccao NAO e "flow style" e que a mensagem nomeia a secao certa. Este YAML e bloco
    // valido, indentado com 4 — e o leitor exige recuo 2 na rota e 4 no metodo.
    mutar: (m) => m.escrever('contract/openapi.yaml', [
      'openapi: 3.1.0',
      'servers:',
      '  - url: /api/v1/<modulo>',
      'paths:',
      '    /health:',
      '        get:',
      '            responses:',
      "                '200':",
      '                    description: ok',
      '    /meta:',
      '        get:',
      '            responses:',
      "                '200':",
      '                    description: ok',
      '    /resumo:',
      '        get:',
      '            responses:',
      "                '200':",
      '                    description: ok',
      '',
    ].join('\n')),
  },
  {
    regra: 'rota-nomenclatura',
    descricao: 'servers[0].url diverge do rotaBase do manifesto',
    mutar: (m) => m.substituir('contract/openapi.yaml', 'url: /api/v1/<modulo>', 'url: /api/v1/outro-lugar'),
  },
  {
    regra: 'rota-nomenclatura',
    descricao: 'parametro de caminho fora de camelCase',
    // `{Hash}` e `:hash` normalizam para o mesmo `{}`, entao `contrato-sincronizado` continua
    // calado — este caso acusa UM id, e prova que a checagem de segmento esta viva.
    mutar: (m) => m.substituir('contract/openapi.yaml', '/registros/{hash}:', '/registros/{Hash}:'),
  },
  {
    regra: 'rota-nomenclatura',
    descricao: 'verbo em portugues como segmento de path',
    // A rota entra na spec E no codigo, senao o caso acusaria tambem `contrato-sincronizado`.
    mutar: (m) => {
      m.substituir('contract/openapi.yaml', '  /health:', [
        '  /criar-item:',
        '    get:',
        '      summary: verbo no path',
        '      responses:',
        "        '200':",
        '          description: ok',
        '  /health:',
      ].join('\n'));
      m.escrever('api/src/extra.ts', "router.get('/criar-item', (_req, res) => res.json({ ok: true }));\n");
    },
  },
  {
    regra: 'contrato-sincronizado',
    descricao: 'rota no codigo e ausente do contrato',
    // Alvo LOGICO + trecho por sintaxe: o caminho do arquivo de rotas muda por binding
    // (`api/src/rotas.py` no Python) e a forma de registrar rota tambem (decorator). Fixar os dois
    // deixaria esta regra provada so em TypeScript.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: "\nrouter.get('/nao-declarada', () => undefined);\n",
      py: '\n\n@router.get("/nao-declarada")\ndef nao_declarada():\n    return {}\n',
    }),
  },
  {
    regra: 'contrato-sincronizado',
    descricao: 'rota no contrato e ausente do codigo',
    mutar: (m) => m.substituir(
      'contract/openapi.yaml',
      'paths:\n',
      'paths:\n  /so-na-spec:\n    get:\n      summary: fantasma\n      responses:\n        200:\n          description: ok\n',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'PRIMEIRA chave da projecao nao declarada (molde Python)',
    // Escrito para o binding Python de proposito: e o unico em que a primeira chave nao tem um
    // `{` sobrando antes dela — um extrator que lesse a assinatura da funcao, em vez de procurar
    // `return {` direto, ficaria cego para esta forma. E a diferenca entre consertar de verdade e
    // mover o sintoma.
    // `contem`: afirma que a mensagem nomeia o CAMPO certo — sem isto, o caso
    // passaria igual se a regra acusasse qualquer outro campo por engano, contanto que fosse a
    // mesma regra.
    contem: 'campoFantasma',
    mutar: (m) => m.substituir(
      'api/src/mappers.py',
      'mascarado.\n    """\n    return {\n        "hash": registro.hash,',
      'mascarado.\n    """\n    return {\n        "campoFantasma": registro.hash,',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'projecao em arrow de UMA linha, com campo nao declarado',
    // A forma limite do balanceamento: fecha na mesma linha, sem `\n` antes do `}`. Prova que o
    // balanceamento continua LENDO a projecao — o conserto da sobre-captura nao pode virar
    // cegueira para a forma que a causava.
    mutar: (m) => m.escrever(
      'api/src/mapper-arrow.ts',
      'export const toContractArrow = (r) => ({ hash: r.hash, campoArrow: r.extra });\n',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'projecao publica campo que nenhum schema de resposta declara',
    // Arquivo novo em `api/src/` cujo nome casa com /mapper/i: vale nos tres bindings, sem
    // depender do caminho do mapeador de cada um (`mappers/index.ts` x `mappers.py`).
    // `hash` esta declarado em `Registro`; `campoFantasma` nao esta em resposta nenhuma.
    //
    // As duas ultimas linhas travam uma NAO-acusacao, pela tecnica do caso do `log`: `naoPublica`
    // nao e projecao nenhuma, e `created_at` NAO pode ser acusado. Se o extrator voltar a aceitar
    // REFERENCIA a `toContract*` como sitio de projecao, o `map(...)` engata na abertura da funcao
    // seguinte, `payload-camelcase` acusa `created_at`, e o id extra reprova este caso na hora.
    //
    // `naoPublica` tambem e o nome ERRADO pela convencao de nomenclatura do mapeador — funcao exportada de nivel
    // de modulo, num arquivo `/mapper/i`, que nao comeca com "to" nem tem "To" no meio. Co-achado
    // LEGITIMO de `mapeador-nomenclatura`, nao efeito colateral: e exatamente o tipo de nome que a
    // regra existe para pegar, so que aqui o proposito do caso e outro.
    tambem: ['mapeador-nomenclatura'],
    mutar: (m) => m.escrever(
      'api/src/mapper-extra.ts',
      'export function toContractExtra(r) {\n  return { hash: r.hash, campoFantasma: r.fantasma };\n}\n'
        + 'export const toContractLista = (rs) => rs.map(toContractExtra);\n'
        + 'export function naoPublica(r) {\n  return { created_at: r.criadoEm };\n}\n',
    ),
  },
  // --- as 18 formas do extrator de projecao ------------------------------------------------
  {
    regra: 'projecao-contrato',
    descricao: 'tipo de retorno inline nao desvia o extrator',
    // `): { hash: string; campoForma1: string } {` — sob um extrator ancorado na assinatura, a
    // primeira `{` depois do nome seria a do TIPO, nao a do corpo. O separador `;` do tipo (nao
    // `,`) faz "hash" escapar por acidente as vezes e "campoForma1" nunca ser visto. O extrator
    // atual nunca olha a assinatura: procura `return {` direto.
    mutar: (m) => m.escrever(
      'api/src/mapper-forma1.ts',
      'export function toContractForma1(r: { hash: string }): { hash: string; campoForma1: string } {\n'
        + "  return { hash: r.hash, campoForma1: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'um parametro com tipo inline',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma2.ts',
      'export function toContractForma2(o: { a: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, campoForma2: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'dois parametros com tipo inline',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma3.ts',
      'export function toContractForma3(o: { a: string }, p: { b: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, b: p.b, campoForma3: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'generico com objeto (<T extends { id: string }>)',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma4.ts',
      'export function toContractForma4<T extends { id: string }>(o: T): Record<string, unknown> {\n'
        + "  return { id: o.id, campoForma4: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'Array<{ … }> no retorno',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma5.ts',
      'export function toContractForma5(r: { hash: string }): Array<{ hash: string }> {\n'
        + "  return { hash: r.hash, campoForma5: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'Promise<{ … }> no retorno',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma6.ts',
      'export async function toContractForma6(r: { hash: string }): Promise<{ hash: string }> {\n'
        + "  return { hash: r.hash, campoForma6: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'default de parametro "= {}", nos tres bindings',
    mutar: (m) => m.acrescentarEm('mappers', {
      js: "\nexport function toContractForma7(opcoes: Record<string, unknown> = {}): Record<string, unknown> {\n"
        + "  return { campoForma7: 'x' };\n}\n",
      py: "\n\ndef to_contract_forma7(opcoes=None):\n    return {\"campoForma7\": \"x\"}\n",
    }),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'tipo inline COM default',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma8.ts',
      "export function toContractForma8(o: { a: string } = { a: 'x' }): Record<string, unknown> {\n"
        + "  return { campoForma8: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'corpo canonico "): Record<string, unknown> {" nao pode regredir',
    // E a forma que o proprio molde usa (toContract) — este caso trava que uma violacao SOB essa
    // forma continua sendo pega, nao so que a forma boa passa.
    mutar: (m) => m.escrever(
      'api/src/mapper-forma9.ts',
      "export function toContractForma9(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, campoForma9: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'objeto aninhado dentro da projecao nao pode regredir',
    mutar: (m) => m.escrever(
      'api/src/mapper-forma11.ts',
      "export function toContractForma11(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, aninhado: { campoForma11: 'x' } };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'dois "return" na mesma funcao rendem DUAS regioes',
    // `vezes: 2`: afirma que as DUAS regioes viram DUAS mensagens, nao uma —
    // sem isto, um extrator que voltasse a enxergar só a primeira `return` passaria calado, porque
    // "acusou `projecao-contrato`" já bastava para o caso antigo, não importa quantas vezes.
    vezes: 2,
    mutar: (m) => m.escrever(
      'api/src/mapper-forma12.ts',
      "export function toContractForma12(r: { hash: string }, resumo: boolean): Record<string, unknown> {\n"
        + "  if (resumo) {\n    return { campoForma12Resumo: 'x' };\n  }\n"
        + "  return { hash: r.hash, campoForma12Detalhe: 'x' };\n}\n",
    ),
  },
  {
    regra: 'log',
    descricao: '"const interno = { … }" dentro da funcao NAO e projecao (chamariz)',
    // O objeto intermediario nao esta em posicao de `return` nem de `=>`, entao nunca casa
    // PADRAO_RETORNO_OBJETO — nenhuma guarda nova precisou existir para isso. `console.log` arma o
    // chamariz: se `campoInterno` fosse (erradamente) visto como projetado, apareceria um id extra
    // (`projecao-contrato`) NAO DECLARADO, e o caso reprovaria.
    mutar: (m) => m.escrever(
      'api/src/mapper-forma14.ts',
      "export function toContractForma14(r: { hash: string }): Record<string, unknown> {\n"
        + "  const interno = { campoInterno: 'nunca publicado' };\n"
        + "  console.log(interno);\n"
        + "  return { hash: r.hash };\n}\n",
    ),
  },
  {
    regra: 'log',
    descricao: 'metodo de classe que NAO publica, DEPOIS de um metodo que publica (chamariz)',
    // O defeito que so aparece com METODO: sem recuo na janela, tudo depois da primeira projecao (o
    // metodo `para*`) e atribuido a ela — `chaveDeCache`, que devolve so campo de BANCO
    // (`created_at`) e nao e projecao nenhuma, tem seu `return` inteiro somado a projecao do
    // metodo anterior. `console.log` arma o chamariz: se `created_at` fosse (erradamente) visto
    // como projetado, apareceria `payload-camelcase` NAO DECLARADO e o caso reprovaria.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport class ProjecoesN21 {\n  toGama(registro) {\n    console.log("x");\n'
        + '    return { hash: registro.hash };\n  }\n\n'
        + '  chaveDeCache(registro) {\n    return { created_at: registro.criadoEm };\n  }\n}\n',
      py: '\n\nclass ProjecoesN21:\n    def to_gama(self, registro):\n        print("x")\n'
        + '        return {"hash": registro["hash"]}\n\n'
        + '    def chave_de_cache(self, registro):\n        return {"created_at": registro["criado_em"]}\n',
    }),
  },
  {
    regra: 'log',
    descricao: '"cpf" num metodo de classe que NAO publica nada continua CALADO (sensivel-em-saida)',
    // A reproducao exata do revisor: `chaveDeCache` devolve "created_at" E "cpf", e nenhum dos dois
    // pode ser visto como projetado — o metodo nao e "para*", entao nunca e sitio. Se a janela
    // regredisse, `sensivel-em-saida` apareceria NAO DECLARADO ao lado de `log` e o caso reprovaria.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.acrescentarEm('mappers', {
        js: '\nexport class ProjecoesN21b {\n  toDelta(registro) {\n    console.log("x");\n'
          + '    return { hash: registro.hash };\n  }\n\n'
          + '  chaveDeCache(registro) {\n    return { created_at: registro.criadoEm, cpf: registro.hash };\n  }\n}\n',
        py: '\n\nclass ProjecoesN21b:\n    def to_delta(self, registro):\n        print("x")\n'
          + '        return {"hash": registro["hash"]}\n\n'
          + '    def chave_de_cache(self, registro):\n'
          + '        return {"created_at": registro["criado_em"], "cpf": registro["hash"]}\n',
      });
    },
  },
  {
    regra: 'sensivel-em-saida',
    descricao: '"cpf" publicado DE VERDADE num metodo de classe continua ACUSANDO',
    // O outro lado do conserto: a janela fecha, mas nao cega a regra. Um SEGUNDO metodo "para*" na
    // mesma classe, depois do que nao publica, e a projecao dele publica cpf de verdade.
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.acrescentarEm('mappers', {
        js: '\nexport class ProjecoesN21c {\n  toEpsilon(registro) {\n'
          + '    return { hash: registro.hash };\n  }\n\n'
          + '  chaveDeCache(registro) {\n    return { created_at: registro.criadoEm };\n  }\n\n'
          + '  toZeta(registro) {\n    return { hash: registro.hash, cpf: registro.cpf };\n  }\n}\n',
        py: '\n\nclass ProjecoesN21c:\n    def to_epsilon(self, registro):\n'
          + '        return {"hash": registro["hash"]}\n\n'
          + '    def chave_de_cache(self, registro):\n'
          + '        return {"created_at": registro["criado_em"]}\n\n'
          + '    def to_zeta(self, registro):\n'
          + '        return {"hash": registro["hash"], "cpf": registro["cpf"]}\n',
      });
    },
  },
  {
    regra: 'log',
    descricao: 'propriedade-arrow que NAO publica, DEPOIS de propriedade-arrow que publica (chamariz)',
    // O defeito que so aparece em objeto literal de arrows: um fechador que exigisse
    // `identificador(` depois do nome ficaria cego aqui — `chaveDeCache: (r) => (...)` tem `:`
    // entre os dois, nunca fechando a janela de `toGama`. `console.log`/`print` arma o chamariz:
    // se "created_at" fosse (erradamente) visto como projetado por `toGama`, apareceria
    // `payload-camelcase` NAO DECLARADO e o caso reprovaria.
    // No Python o analogo e a atribuicao de modulo (`name = lambda r: {...}`, sem `def` nem `class`):
    // `chave_de_cache` bare, seguida de "=" (nao "("), fica invisivel a esse mesmo fechador
    // estreito, pelo MESMO motivo.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: "\nexport const ProjecoesN22 = {\n  toGama: (registro) => {\n    console.log('x');\n"
        + '    return { hash: registro.hash };\n  },\n\n'
        + '  chaveDeCache: (registro) => ({ created_at: registro.criadoEm }),\n};\n',
      py: '\n\ndef to_gama(registro):\n    print("x")\n'
        + '    return {"hash": registro["hash"]}\n\n\n'
        + 'chave_de_cache = lambda registro: {"created_at": registro["criado_em"]}\n',
    }),
  },
  {
    regra: 'sensivel-em-saida',
    descricao: '"cpf" publicado DE VERDADE numa propriedade-arrow DEPOIS de uma que nao publica',
    // O outro lado do conserto: a janela fecha, mas nao cega a regra. Uma
    // TERCEIRA entrada "para*" no mesmo objeto/module, depois da que nao publica, projeta cpf de
    // verdade — se a janela da primeira regredisse e engolisse a segunda, "created_at" apareceria
    // como `payload-camelcase` NAO DECLARADO e o caso reprovaria antes mesmo de chegar no cpf.
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.acrescentarEm('mappers', {
        js: '\nexport const ProjecoesN22c = {\n  toEpsilon: (registro) => ({ hash: registro.hash }),\n\n'
          + '  chaveDeCache: (registro) => ({ created_at: registro.criadoEm }),\n\n'
          + '  toZeta: (registro) => ({ hash: registro.hash, cpf: registro.cpf }),\n};\n',
        py: '\n\nto_epsilon = lambda registro: {"hash": registro["hash"]}\n\n'
          + 'chave_de_cache = lambda registro: {"created_at": registro["criado_em"]}\n\n'
          + 'to_zeta = lambda registro: {"hash": registro["hash"], "cpf": registro["cpf"]}\n',
      });
    },
  },
  {
    regra: 'sensivel-em-saida',
    descricao: '"cpf" vazado em toMeta, a rota SEM TOKEN',
    // toMeta serve /meta, rota sem token. Sob uma ancora de nome ESTREITA (so toContract*) a
    // funcao inteira ficaria invisivel ao extrator, e um campo sensivel acrescentado aqui nunca
    // seria pego por regra nenhuma. Tenta os tres caminhos; so o
    // do binding em teste existe, os outros dois viram ENOENT e sao ignorados aqui mesmo.
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      for (const caminho of ['api/src/mappers/index.ts', 'api/src/mappers/index.js']) {
        try {
          m.substituir(caminho, 'exportsSummary: manifesto.exportsSummary,', "exportsSummary: manifesto.exportsSummary,\n    cpf: 'x',");
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substituir(
          'api/src/mappers.py',
          '"exportsSummary": manifesto["exportsSummary"],',
          '"exportsSummary": manifesto["exportsSummary"],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    regra: 'sensivel-em-saida',
    descricao: '"cpf" vazado em toCollection',
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      for (const caminho of ['api/src/mappers/index.ts', 'api/src/mappers/index.js']) {
        try {
          m.substituir(
            caminho,
            'return { itens: registros.map(toContract), pagina, tamanho, total };',
            "return { itens: registros.map(toContract), pagina, tamanho, total, cpf: 'x' };",
          );
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substituir(
          'api/src/mappers.py',
          '"itens": [to_contract(r) for r in registros],',
          '"itens": [to_contract(r) for r in registros],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    regra: 'log',
    descricao: '"created_at" em rowToDomain/domainToRow (direcao BANCO) NAO acusa (chamariz)',
    // As duas funcoes de direcao BANCO usam "created_at" (campo do banco, snake_case) e nao devem
    // ser lidas como projecao de SAIDA — o nome delas nao COMECA com "to" (comeca no MEIO:
    // rowToDomain, domainToRow). Ja estao no molde, sem mutacao nenhuma; o chamariz so
    // precisa de um id esperado para o harness comparar. Se a ancora de nome regredir para "o
    // arquivo inteiro", `payload-camelcase` acusa "created_at" e este caso reprova com id NAO
    // declarado — e essa nao-acusacao vira verificacao, nao impressao.
    //
    // `logarChamariz` tambem e o nome ERRADO pela convencao de nomenclatura do mapeador (arquivo `/mapper/i`,
    // funcao exportada, nome fora dos dois moldes) — co-achado LEGITIMO de `mapeador-nomenclatura`.
    tambem: ['mapeador-nomenclatura'],
    mutar: (m) => m.escrever(
      'api/src/mapper-chamariz-banco.ts',
      "export function logarChamariz() {\n  console.log('x');\n}\n",
    ),
  },
  // --- mapeador-nomenclatura ---------------------------------------------------------------
  {
    regra: 'mapeador-nomenclatura',
    descricao: 'reproducao exata do achado — funcao de saida fora da convencao publica campo sensivel',
    // Exemplo motivador: "buildResponse"/"build_response" nao comeca com "to" nem tem
    // "To"/"_to_" no meio — nenhuma das tres regras de projecao a enxerga, entao "cpf" vaza com
    // 0 erro(s). Esta regra julga SO o nome: nao precisa de `sensitiveFields` nem de contrato
    // para acusar.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport function buildResponse(registro) {\n  return { hash: registro.hash, cpf: registro.hash };\n}\n',
      py: '\n\ndef build_response(registro):\n    return {"hash": registro["hash"], "cpf": registro["hash"]}\n',
    }),
  },
  {
    regra: 'mapeador-nomenclatura',
    descricao: 'const/arrow exportada fora da convencao (TS/JS) — a segunda forma de exportar funcao',
    // `PADRAO_EXPORT_CONST_ARROW` precisa cobrir a MESMA classe de defeito na forma
    // `export const nome = (...) => ...`, nao so `export function`. So JS/TS: em Python toda
    // funcao e `def`, a forma unica ja coberta pelo caso acima.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport const serialize = (registro) => ({ hash: registro.hash });\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'CHAMARIZ: funcao de SAIDA bem-nomeada (to<Algo>) acrescentada ao mapeador NAO acusa',
    // `toRegistroExtra`/`to_registro_extra` bate a convencao de SAIDA (`ehNomeDeSaida`) — precisa
    // continuar calada mesmo depois da regra nova entrar no catalogo. `console.log`/`print` da o id
    // esperado (`log`); se `mapeador-nomenclatura` aparecesse aqui, seria NAO DECLARADO e o caso
    // reprovaria.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport function toRegistroExtra(registro) {\n  console.log("x");\n  return { hash: registro.hash };\n}\n',
      py: '\n\ndef to_registro_extra(registro):\n    print("x")\n    return {"hash": registro["hash"]}\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'CHAMARIZ: funcao de conversao de BANCO (<algo>To<Algo>) acrescentada ao mapeador NAO acusa',
    // O chamariz que a decisao do dono pede explicitamente: prova, por MUTACAO nova
    // (nao so pelo molde intocado), que a forma banco continua calada. "itemToRegistro"/
    // "item_to_registro" tem "To"/"_to_" no MEIO, nunca no inicio — `ehNomeDeConversaoBanco` aceita,
    // `mapeador-nomenclatura` fica muda. Se `mapeador-nomenclatura` aparecesse aqui, seria id NAO
    // DECLARADO e o caso reprovaria.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport function itemToRegistro(linha) {\n  console.log("x");\n  return { hash: linha.hash };\n}\n',
      py: '\n\ndef item_to_registro(linha):\n    print("x")\n    return {"hash": linha["hash"]}\n',
    }),
  },
  {
    regra: 'payload-camelcase',
    descricao: 'campo snake_case na projecao de saida',
    // `hash` esta declarado no contrato e `criado_em` fica fora do camelCase, entao
    // `projecao-contrato` (que ignora chave nao-camelCase de proposito) segue calada: UM id.
    mutar: (m) => m.acrescentarEm('mappers', {
      js: '\nexport function toContractErrado(r) {\n  return { hash: r.hash, criado_em: r.criadoEm };\n}\n',
      py: '\n\ndef to_contract_errado(r):\n    return {"hash": r.hash, "criado_em": r.criado_em}\n',
    }),
  },
  {
    regra: 'saida-sensivel',
    descricao: 'campo sensivel citado em schema de resposta do OpenAPI',
    // `module` e declarado na resposta de /health e NUNCA projetado nem logado — isola o lado do
    // CONTRATO. Com `status` (que o mapeador projeta) o caso acusaria tambem `sensivel-em-saida`.
    // NAO usar `total`: `toCollection` projeta `total` de verdade (ancora de nome larga) — o
    // proprio campo que este caso precisa NUNCA estar projetado nao serve mais.
    mutar: (m) => m.manifesto((x) => ({ ...x, sensitiveFields: ['module'] })),
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'campo sensivel citado em chamada de log',
    // Isola o lado do CODIGO pela metade de LOG: campo que nao existe em schema nenhum, entao
    // `saida-sensivel` nao tem o que acusar. Todo campo PROJETADO esta, por construcao, declarado
    // em resposta (`projecao-contrato` cobra isso), logo a projecao nunca isola esta regra.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['segredoDeLog'] }));
      m.escrever('api/src/vaza.ts',
        'export function registrar(logger, segredoDeLog) {\n  logger.info("processado", segredoDeLog);\n}\n');
    },
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'verbo "warning" (lista unificada com segredo-em-log) nao escapa',
    // Uma lista estreita (logger|log com debug|info|warn|error) nao casaria "logging.warning(...)"
    // (nem o objeto "logging" nem o verbo "warning" estariam nela). `sensivel-em-saida` usa
    // CHAMADA_DE_LOG_VERBOS, a mesma fonte de `segredo-em-log`.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, sensitiveFields: ['segredoDeLog'] }));
      m.escrever('api/src/vaza-warning.ts',
        'export function registrar(logging, segredoDeLog) {\n  logging.warning("processado", segredoDeLog);\n}\n');
    },
  },
  {
    regra: 'resumo-exportado',
    descricao: '/resumo sem "total" no schema 200, com o "total" de /registros INTACTO',
    // O `total` de `/registros` fica de pe justamente para provar que a regra le a ROTA, e nao o
    // arquivo: com um leitor de arquivo inteiro (`propriedadesDeResposta`) este caso NAO acusaria
    // nada, e a regra teria aprovado por acidente. E essa a diferenca que o caso existe para
    // demonstrar. Liga `exportsSummary` no manifesto para nao depender do default do binding.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, exportsSummary: true }));
      m.substituir(
        'contract/openapi.yaml',
        '                type: object\n                properties:\n                  total: { type: integer }',
        '                type: object',
      );
    },
  },
  {
    regra: 'entrada-allowlist',
    descricao: 'corpo da requisicao espalhado direto numa entidade',
    // A simetrica do `saida-crua`. Espalhar (`{...req.body}`) e a forma que o molde NAO tem: la o
    // corpo atravessa `lerCorpo`, que rejeita campo desconhecido antes de virar entidade.
    mutar: (m) => m.escrever(
      'api/src/mau-entrada.ts',
      'export const criar = (req, repositorio) => repositorio.inserir({ ...req.body });\n',
    ),
  },
  {
    regra: 'saida-crua',
    descricao: 'devolve o registro cru na resposta (metade MAPEADOR, vocabulario fechado)',
    // As duas metades do padrao, uma por sintaxe: `json(registro)` no lado Express, e o `return`
    // direto do nome do lado do BANCO no lado FastAPI, que nao passa por `.json(...)`.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport const cru = (res, registro) => res.json(registro);\n',
      py: '\n\ndef cru(linha):\n    return linha\n',
    }),
  },
  {
    regra: 'saida-crua',
    descricao: 'devolve "manifesto" cru — a metade BORDA, sem lista de isentos',
    // Trava um defeito medido de verdade: `res.json(<identificador>)` acusa SEMPRE, sem
    // vocabulario. Se a borda regredir para o vocabulario fechado antigo, "manifesto" volta a
    // escapar e este caso reprova.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport const meta2 = (res, manifesto) => res.json(manifesto);\n',
    }),
  },
  {
    regra: 'saida-crua',
    descricao: 'Python: return <acesso.pontilhado> DENTRO de handler roteado (a borda do FastAPI)',
    // Python nao tem `.json(...)`: a borda E o `return` do handler. So conta DENTRO de uma funcao
    // decorada com `@router.<verbo>` — e por isso o trecho inclui o decorator, nao so a linha.
    // `contrato-sincronizado` e co-achado LEGITIMO: a rota sintetica "/sonda-meta" nao existe no
    // openapi.yaml de proposito — o caso testa `saida-crua`, nao `contrato-sincronizado`.
    tambem: ['contrato-sincronizado'],
    mutar: (m) => m.acrescentarEm('rotas', {
      py: '\n\n@router.get("/sonda-meta")\nasync def sonda_meta():\n    return config.manifesto\n',
    }),
  },
  {
    regra: 'saida-crua',
    descricao: 'return "linha" sem chamada, nos TRES bindings — prova que a metade MAPEADOR nao regrediu',
    // O padrao do mapeador (`return (linha|linhas|row|rows)$`) nao muda. Trava isso nos
    // tres bindings, nao so no Python que o caso acima ja cobre.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport function outraRota(linha) {\n  return linha\n}\n',
      py: '\n\ndef outra_rota(linha):\n    return linha\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'saida-crua CALA: objeto literal e chamada de projecao nao sao "cru" (chamariz de log)',
    // `res.json({ total })` e `res.json(toContract(x))` NUNCA casam o padrao da borda — o proximo
    // caractere depois do identificador nao e `)`. O chamariz (`console.log`, regra `log`) prova que
    // saida-crua ficou muda: se a borda regredir para aceitar chamada/objeto, este id aparece
    // NAO DECLARADO e o caso reprova.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport const chamarizObjeto = (res) => {\n  console.log("x");\n'
        + '  res.json({ total: 1 });\n  return res.json(toContract({}));\n};\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'Python: saida-crua CALA fora de handler roteado e em chamada (chamariz de log)',
    // `return router` (fim de `criar_rotas`, MESMO recuo do ultimo decorator) e `return
    // to_contract(...)` (chamada, nao identificador puro) sao os dois casos que uma formulacao por
    // "qualquer return" acusaria errado, e a formulacao por indentacao/decorator cala corretamente.
    // Ambos ja existem no molde conforme; o chamariz aqui e so para o caso ter um id esperado.
    mutar: (m) => m.acrescentarEm('rotas', {
      py: '\n\ndef _fora_de_handler():\n    print("x")\n    return None\n',
    }),
  },

  // --- Operacao ------------------------------------------------------------------------------
  {
    regra: 'log',
    descricao: 'a lei escrita em COMENTARIO nao vira violacao dela mesma',
    // O caso existe para travar uma NAO-acusacao, e o harness nao sabe afirmar isso: ele exige
    // exatamente um id. O truque e o mesmo do caso do SDK legitimo em `adapters/` — o id esperado e
    // de OUTRA regra, e as formas proibidas entram em COMENTARIO ao lado.
    //
    // Se `importesDe`, `env-declarado`, `env-fora-do-carregador` ou `tabela-alheia` voltarem a ler
    // `conteudo` cru, cada uma emite um id NAO DECLARADO e este caso reprova na hora. Sem ele, a
    // nao-acusacao ficaria garantida so por inspecao — a lacuna que o harness tem por natureza.
    //
    // As DUAS ultimas linhas do bloco js e o `mapeador-doc` cobrem a familia Contrato, e cada um
    // trava um extrator diferente de `contract.mjs`: a rota comentada acusaria
    // `contrato-sincronizado` (extrator `rotasDoCodigo`), e a projecao comentada acusaria
    // `projecao-contrato`, `payload-camelcase` e `sensivel-em-saida` de uma vez (extrator
    // `chavesDaProjecao`) — quatro ids NAO DECLARADOS na primeira volta ao texto cru.
    //
    // O defeito de verdade e o `console.log`/`print`, e e o unico achado que pode sair daqui.
    exigeVizinho: true,
    mutar: (m) => {
      // `cpf` sensivel e o que arma a metade `sensivel-em-saida` do chamariz do mapeador. Nao
      // acusa `saida-sensivel`: campo nenhum chamado `cpf` aparece em schema do contrato do molde.
      m.manifesto((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      // Arquivo cujo nome casa /mapper/i e cujo conteudo e SO comentario: projecao nenhuma
      // existe aqui, e nada pode ser acusado. Vale nos tres bindings — `linhasCodigo` descarta a
      // linha `//` qualquer que seja a extensao.
      m.escrever(
        'api/src/mapper-doc.ts',
        '// A projecao, escrita como documentacao. NENHUMA destas chaves e publicada:\n'
          + '//   export function toContractDoc(r) { return { cpf: r.cpf, criado_em: r.criadoEm }; }\n',
      );
      m.acrescentarEm('rotas', {
        js: '\n// A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + "//   import { X } from '@<escopo>/vizinho';\n"
          + "//   import { c } from '../../adapters/memory/index.js';\n"
          + "//   import pg from 'pg';\n"
          + '//   const s = process.env.MOLDE_SEGREDO_DOC;\n'
          + "//   select nome from vizinho_metadados where id = ' + id\n"
          + "//   router.get('/rota-desativada', listarLegado);\n"
          + "export const gritar = () => console.log('este si e defeito');\n",
        py: '\n\n# A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + '#   from adapters.memory import criar\n'
          + '#   import psycopg2\n'
          + '#   s = os.environ["MOLDE_SEGREDO_DOC"]\n'
          + '#   select nome from vizinho_metadados where id = " + id\n'
          + '#   @router.get("/rota-desativada")\n'
          + 'def gritar():\n    print("este si e defeito")\n',
      });
    },
  },
  {
    regra: 'log',
    descricao: 'saida direta em vez do logger',
    mutar: (m) => m.escrever('core/domain/mau.ts', "export function f() { console.log('oi'); }\n"),
  },
  {
    regra: 'determinismo',
    descricao: 'nao-determinismo dentro de core/',
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export const agora = new Date();\n'),
  },
  {
    regra: 'rota-publica-autenticada',
    descricao: 'publicRoutes declara rota que o contrato nao tem',
    // Entrada com typo NAO isenta nada: o autor acredita que abriu a rota, a cadeia continua
    // exigindo token, e o defeito so aparece em producao. A forma passa no JSON Schema
    // (`^(GET|POST|PATCH|PUT|DELETE) /`), entao `schema-manifesto` cala e o caso acusa UM id.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      publicRoutes: [...x.publicRoutes, 'GET /helth'],
    })),
  },
  {
    regra: 'rota-publica-autenticada',
    descricao: 'api/ para de ler publicRoutes do manifesto: docstring que so EXPLICA nao basta (Python)',
    // A clausula de origem usa `textoDeCodigo` (linhasCodigo, sem comentario/docstring), nao
    // `conteudo`: um docstring que so EXPLICA `publicRoutes` satisfaria a checagem mesmo com a
    // leitura de verdade apagada — falso negativo que aprovaria em silencio. O molde Python tem
    // UM UNICO site de codigo real (`middlewares.py:48`,
    // `manifesto["publicRoutes"]`); os outros dois usos sao docstring (linhas 26 e 119, ja fora de
    // `linhasCodigo`). Substituir so essa linha por uma lista fixa apaga a ULTIMA ocorrencia em
    // codigo, mantem as docstrings intocadas, e o achado tem que aparecer.
    //
    // TS/JS NAO tem equivalente minimo: `publicRoutes` e nome de CAMPO de tipo (`api/src/config.ts`)
    // e de PARAMETRO (`middlewares/index.ts`), presentes em codigo real em pelo menos dois arquivos
    // alem do bootstrap (`index.ts`) — apagar so o bootstrap nao apaga o identificador de
    // `linhasCodigo` em lugar nenhum, e apagar tambem o tipo/parametro deixa de ser mutacao minima
    // (quebra a assinatura da funcao, nao so o comportamento sob teste). Limite declarado, nao
    // lacuna: a mesma razao que torna o caso impossivel e a que faz a checagem sobrar redundante
    // nesses dois bindings — o identificador sobrevive em codigo estrutural, nunca so em prosa.
    // Sem `arquivo`: o achado desta clausula e por MODULO (`daApi.some(...)`), nunca por arquivo —
    // nao ha `rel:numero` para casar, diferente do achado de `ROTA_LITERAL` logo abaixo dela.
    contem: 'nunca le module.json:publicRoutes',
    vezes: 1,
    mutar: (m) => m.substituir(
      'api/src/middlewares.py',
      'publicas = {rota.upper() for rota in manifesto["publicRoutes"]}',
      'publicas = {"SAUDE"}',
    ),
  },
  {
    regra: 'cookie-seguro',
    descricao: 'cookie de sessao sem HttpOnly, Secure e SameSite',
    // CONDICIONAL: o molde nao tem cookie (a auth dele e `Authorization: Bearer`), entao o caso
    // precisa criar a superficie para a regra ter o que cobrar.
    mutar: (m) => m.escrever(
      'api/src/mau-cookie.ts',
      "export const logar = (res, valor) => res.cookie('session', valor);\n",
    ),
  },
  {
    regra: 'token-em-armazenamento',
    descricao: 'token de auth guardado em localStorage',
    // Em `web/` de proposito: `localStorage` so existe no navegador. No molde Python, que nasce sem
    // `web/`, o caso estoura ENOENT e o runner marca SEM COBERTURA — correto, nao aprovacao.
    mutar: (m) => m.escrever(
      'web/src/api-client/sessao.ts',
      "export const guardar = (valor) => localStorage.setItem('token', valor);\n",
    ),
  },
  {
    regra: 'gateway-credencial',
    descricao: 'modulo de dominio declarando credencial externa',
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'MOLDE_OPENAI_API_KEY'] }));
      // Sem isto o caso violava tambem `env-exemplo` — ruido do fixture, nao da credencial.
      m.acrescentar('.env.example', 'MOLDE_OPENAI_API_KEY=\n');
    },
  },

  // --- Escrita -------------------------------------------------------------------------------
  {
    regra: 'limiar-funcao',
    descricao: 'funcao acima de 40 linhas',
    mutar: (m) => m.escrever('core/domain/mau.ts', `export function longa() {\n${'  let x = 1;\n'.repeat(45)}}\n`),
  },
  {
    regra: 'limiar-aninhamento',
    descricao: 'aninhamento de controle acima de 3',
    mutar: (m) => m.escrever(
      'core/domain/mau.ts',
      'export function f(a) {\n  if (a) {\n    for (;;) {\n      while (a) {\n        if (a) { return 1; }\n      }\n    }\n  }\n  return 0;\n}\n',
    ),
  },
  {
    regra: 'limiar-parametros',
    descricao: 'funcao com mais de 4 parametros',
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export function f(a, b, c, d, e) {\n  return [a, b, c, d, e];\n}\n'),
  },
  {
    regra: 'excecao-engolida',
    descricao: 'catch vazio',
    mutar: (m) => m.escrever('core/domain/mau.ts', 'export function f(g) {\n  try { g(); } catch (e) {}\n}\n'),
  },
];
