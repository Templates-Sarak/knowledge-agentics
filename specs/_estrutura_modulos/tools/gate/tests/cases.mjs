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

import { readFileSync } from 'node:fs';

// O par (id antigo, id novo) vem da MESMA tabela que viaja com o gate — nunca de um literal aqui: se o
// ADR-024 ganhar ou perder uma renomeação, o caso acompanha em vez de apodrecer com um id escrito à mão.
const RENAMED = JSON.parse(readFileSync(new URL('../renamed-rules.json', import.meta.url), 'utf8')).renamed;
const [OLD_ID, NEW_ID] = Object.entries(RENAMED)[0];

/** `config/compliance.json` com as exceções dadas — `decision` é o ADR que o molde conforme já declara. */
const compliance = (...rules) => JSON.stringify({
  exceptions: rules.map((rule) => ({ module: 'legacy', rule, reason: 'x', decision: 'ADR-001' })),
  exceptionsCve: [],
});

export const CASES = [
  // --- Estrutura -----------------------------------------------------------------------------
  {
    rule: 'manifest',
    description: 'manifest id differs from the folder name',
    // Cascata legitima: com o id trocado, o prefixo `molde_` das tabelas passa a divergir de verdade.
    also: ['table-prefix'],
    mutate: (m) => m.manifest((x) => ({ ...x, id: 'other-name' })),
  },
  {
    rule: 'manifest-schema',
    description: 'unexpected field in the manifest',
    mutate: (m) => m.manifest((x) => ({ ...x, inventedField: true })),
  },
  {
    rule: 'manifest-schema',
    description: 'role is outside the allowed vocabulary',
    // `role` e enum, e enum e o que o JSON Schema expressa — quem acusa e SO `manifest-schema`,
    // `manifest` cala (checkVocabulary, structure.mjs). Nao declarar `tambem: ['manifest']`
    // aqui e proposital: o precedente de `root-manifest` ja e um id so com a mesma justificativa.
    mutate: (m) => m.manifest((x) => ({ ...x, role: 'inventado' })),
  },
  {
    rule: 'structure',
    description: 'required tree file is missing',
    // `config/texts.json` e item da arvore que so a `structure` cobra — `contract/openapi.yaml`
    // e coberto por outra regra (`contract`), nunca por esta.
    mutate: (m) => m.remove('config/texts.json'),
  },
  {
    rule: 'strict-structure',
    description: 'unexpected entry in the module root',
    mutate: (m) => m.writeOut('junk.txt', 'not expected'),
  },
  {
    rule: 'manifest-schema',
    description: 'DECOY: unexpected field while reports/ and .coverage are also present',
    // Prova, POR MAQUINA, que `reports` e `.coverage` continuam tolerados em
    // `ALLOWED_ENTRIES` (structure.mjs) — sem depender de olhar o `Set` a olho. A regra
    // esperada aqui e OUTRA (manifest-schema); se a tolerancia de qualquer uma das duas
    // regredir, `strict-structure` acusa TAMBEM, um id que este caso nao declara em `tambem`, e
    // `run.mjs` reprova com "id NAO declarado" — o mesmo tipo de chamariz usado em outros casos.
    //
    // Sem pasta de verdade: o harness nao tem operacao de `mkdir` (so `escrever` grava ARQUIVO), e
    // a regra `strict-structure` julga so o NOME de topo (`ctx.entradasRaiz`, por `readdirSync`),
    // nunca se e arquivo ou pasta — um arquivo chamado `reports` prova exatamente a mesma
    // linha de codigo que uma pasta `reports/` provaria.
    //
    // Conteudo medido (nao presumido): nenhum dos dois nomes tem extensao que bata `EXT_CODE`
    // (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.py`, context.mjs) — nenhum vira `ctx.codigo`, nenhuma regra
    // de conteudo (log, function-threshold, hardcode-url) os enxerga. `dist/` fica DE FORA deste
    // chamariz de proposito: `context.mjs:SKIP_WALK` ja o exclui de `ctx.entradasRaiz`
    // incondicionalmente (FORA de escopo, nao editado aqui) — nenhum caso, chamariz ou nao,
    // consegue fazer a tolerancia dele regredir de forma observavel (medido: removida de
    // `ALLOWED_ENTRIES`, os tres bindings continuam 92/92 · 92/92 · 88/88, sem mudanca
    // nenhuma — ao contrario de `tsconfig.build.json`, que TRAVA a suite inteira ao ser removida).
    mutate: (m) => {
      m.manifest((x) => ({ ...x, extraDecoyField: true }));
      m.writeOut('reports', 'lcov (decoy fixture — never read as code)');
      m.writeOut('.coverage', 'sqlite (decoy fixture — never read as code)');
    },
  },
  {
    rule: 'web-declared',
    description: 'webPath is declared without an actual page',
    // Cascata legitima: sem as paginas, as chaves de `config/texts.json` ficam sem leitor. So em
    // TS/JS — o molde Python nasce sem `web/`, e por isso `tambem` e teto, nao obrigacao.
    //
    // `web-tests` e o co-achado inverso, e so no PYTHON: ligar `webPath` num molde que nasce sem
    // tela passa a exigir `tests/web/`, que ele nao tem. E defeito real do fixture mutado, nao
    // ruido — tela declarada sem teste e exatamente o que a regra persegue.
    also: ['dead-config', 'web-tests'],
    // Declara a webPath no proprio caso: assim vale tambem para molde que nasce sem tela
    // (o binding Python), em vez de depender do default de um binding especifico.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, webPath: '/mold' }));
      m.removeDir('web/src/pages');
    },
  },
  {
    rule: 'artifact-declared',
    description: 'generatesArtifact is false while artifact directories are present',
    // Direcao "proibe": o molde nasce com as tres pastas, entao basta desligar a declaracao.
    mutate: (m) => m.manifest((x) => ({ ...x, generatesArtifact: false })),
  },
  {
    rule: 'artifact-declared',
    description: 'generatesArtifact is true while generated/ is missing',
    // Direcao "exige" — e de proposito e a pasta `generated/`, cuja presenca so e visivel pela ENTRADA
    // da raiz: o conteudo dela fica fora de `ctx.arquivos`, entao `hasFileIn` nunca a acharia.
    // Liga a condicao no proprio manifesto, como o `web-declared`, para o caso nao depender do
    // default do binding.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, generatesArtifact: true }));
      m.removeDir('generated');
    },
  },
  {
    rule: 'tests',
    description: 'tests/contract is empty',
    mutate: (m) => m.removeDir('tests/contract'),
  },
  // --- estrutura obrigatoria da arvore do modulo -----------------------------------------------
  {
    rule: 'structure',
    description: 'core/domain/ is empty or missing',
    // `contem`: a familia `structure` tem QUATRO casos vizinhos sob o mesmo id
    // ("core/domain/", "core/ports/", "README.md", arquivo do binding) — sem isto, um extrator que
    // confunda pasta com pasta (ex.: acuse so "core/ports/" quando quem sumiu foi
    // "core/domain/") passa calado, porque "acusou `structure`" ja basta.
    contains: 'core/domain/ is empty or missing',
    mutate: (m) => m.removeDir('core/domain'),
  },
  {
    rule: 'structure',
    description: 'core/ports/ is empty or missing',
    // Cascata legitima: `core/ports/index.*` e o UNICO lugar do modulo onde
    // a palavra "notifier" aparece em codigo (a interface da porta) — sem a pasta, dead-config
    // deixa de achar quem "le" a chave `notifier` de config/ports.json, e acusa TAMBEM.
    also: ['dead-config'],
    contains: 'core/ports/ is empty or missing',
    mutate: (m) => m.removeDir('core/ports'),
  },
  {
    rule: 'structure',
    description: 'README.md is missing',
    contains: 'README.md is missing',
    mutate: (m) => m.remove('README.md'),
  },
  {
    rule: 'structure',
    description: 'required binding file is missing (tsconfig.json/package.json in TypeScript, '
      + 'package.json in JavaScript, pyproject.toml in Python)',
    // `remover` usa `force: true` — arquivo que o binding em teste nao tem (ex.: pyproject.toml num
    // molde TS) e um no-op silencioso, entao as tres chamadas cobrem os tres bindings de um caso so.
    // `contem` sem `vezes`: a CONTAGEM varia por binding (TS perde dois arquivos, JS/PY perdem um so),
    // mas o SUFIXO da mensagem e fixo nos tres — e o que prova que o achado e deste ramo, nao de
    // "README.md ausente" ou de uma das pastas obrigatorias.
    contains: 'is missing — required file for binding',
    mutate: (m) => {
      m.remove('tsconfig.json');
      m.remove('package.json');
      m.remove('pyproject.toml');
    },
  },
  {
    rule: 'manifest-schema',
    description: 'DECOY: unexpected field while optional core/gateways/ is missing (must not flag)',
    // Prova, POR MAQUINA, que `core/gateways/` continua FORA do conjunto obrigatorio: modulo sem
    // `consumes` legitimamente nao tem gateway nenhum, e cobra-lo em `structure` seria falso positivo
    // garantido. Se a exclusao regredir, `structure` acusa TAMBEM — um id que este caso nao declara
    // em `tambem` — e `run.mjs` reprova com "id NAO declarado".
    mutate: (m) => {
      m.manifest((x) => ({ ...x, secondDecoyField: true }));
      m.removeDir('core/gateways');
    },
  },

  // --- Isolamento ----------------------------------------------------------------------------
  {
    rule: 'lateral-import',
    description: 'imports a package from another module',
    mutate: (m) => m.writeOut('core/domain/mau.ts', "import { x } from '@scope/neighbor';\nexport const y = x;\n"),
    requiresNeighbor: true,
  },
  {
    rule: 'import-adapter',
    description: 'imports an adapter instead of receiving it through injection',
    mutate: (m) => m.writeOut('core/domain/mau.ts', "import { create } from '../../adapters/memory/index.js';\nexport const y = create;\n"),
  },
  {
    rule: 'import-adapter',
    description: 'imports an adapter using Python dotted syntax ("adapters.memory")',
    // `EXT_CODE` (context.mjs) e universal aos tres bindings, entao um `.py` cai em `ctx.codigo`
    // mesmo dentro do molde TS/JS — o mesmo por que o caso acima usa `.ts` nos tres. Sem este caso,
    // a forma pontilhada (`from adapters.memory import x`) passaria limpa pela regra inteira.
    mutate: (m) => m.writeOut('core/domain/mau_pontilhado.py', 'from adapters.memory import create\n\ny = create\n'),
  },
  {
    rule: 'vendor-sdk',
    description: 'vendor SDK inside the module',
    mutate: (m) => m.writeOut('core/domain/mau.ts', "import pg from 'pg';\nexport const y = pg;\n"),
  },
  {
    rule: 'gateway-http',
    description: 'gateway accesses a database',
    // Cascata legitima: o arquivo novo em `core/gateways/` nao tem entrada em `consumes` — nem teste
    // que o espelhe. Sao os outros dois lados do triangulo `gateway <-> consumes <-> teste`.
    also: ['gateway-declared', 'gateway-tests'],
    mutate: (m) => m.writeOut('core/gateways/neighbor.ts', "export const q = 'select 1 from t';\nexport async function f(c) { return c.query(q); }\n"),
  },
  {
    rule: 'gateway-declared',
    description: 'gateway is missing from consumes',
    // Cascata legitima: o gateway novo tambem nasce sem teste que o espelhe.
    also: ['gateway-tests'],
    // O SQL em COMENTARIO trava a nao-acusacao de `gateway-http`: o barril da pasta documenta em
    // comentario o que o gateway nao pode fazer, e sobre o texto cru essa documentacao vira
    // violacao dela mesma. Se a regra regredir, emite id nao declarado e este caso reprova.
    mutate: (m) => m.writeOut(
      'core/gateways/neighbor.ts',
      '// NAO faca aqui: select nome from neighbor_metadata\n'
      + 'export async function f(u) { return fetch(u); }\n',
    ),
  },
  {
    rule: 'consumes-cycle',
    description: 'cycle in the consumes graph',
    // Cascata legitima: declarar `consumes` sem criar `core/gateways/vizinho.*` e defeito de verdade.
    also: ['gateway-declared'],
    // O contrato declarado tem de EXISTIR na spec do vizinho (`/summary` e obrigatoria em todo
    // modulo). Com `GET /x`, este caso violaria tambem `consumes-contract` e deixaria de exercitar
    // uma regra so — caso de teste com duas violacoes nao prova qual das duas esta viva.
    mutate: (m) => {
      m.manifest((x) => ({
        ...x,
        consumes: [{ module: 'neighbor', contract: 'GET /summary', why: 'cycle' }],
        requiredEnv: [...x.requiredEnv, 'NEIGHBOR_URL'],
      }));
      // A chave nova tem de chegar ao `.env.example`, senao o caso violava tambem `env-example` —
      // ruido do fixture, nao defeito do grafo de `consumes`.
      m.add('.env.example', 'NEIGHBOR_URL=\n');
    },
    requiresNeighbor: true,
    neighborConsumes: true,
  },
  {
    rule: 'consumes-contract',
    description: 'consumes a route not declared by the owner contract',
    // Cascata legitima: o gateway que acompanha a entrada em `consumes` nasce sem teste.
    also: ['gateway-tests'],
    mutate: (m) => {
      // O gateway acompanha a entrada em `consumes` (senao violaria tambem `gateway-declared`),
      // e nada e acrescentado a `requiredEnv` (senao violaria `env-example`). Este caso acusa
      // UM id — e o unico jeito de o autoteste provar que e ESTA regra que esta viva.
      m.writeOut('core/gateways/neighbor.ts', 'export async function f(u) { return fetch(u); }\n');
      m.manifest((x) => ({
        ...x,
        consumes: [{ module: 'neighbor', contract: 'GET /retired-route', why: 'derives from contract' }],
      }));
    },
    requiresNeighbor: true,
  },

  {
    rule: 'isolated-adapter',
    description: 'adapter imports from modules/',
    // O defeito que mata a extraibilidade em silencio: no dia em que o adapter conhece um modulo,
    // ele deixa de ser substituivel e o modulo deixa de sair da pasta.
    mutate: (m) => m.addIn('rootAdapter', {
      js: "\nimport { algo } from '../../modules/_template/core/domain/index.js';\n",
      py: '\nfrom modules._template.core.domain import algo\n',
    }),
  },
  {
    rule: 'isolated-adapter',
    description: 'adapter imports from the composition root (src/)',
    // A SEGUNDA clausula da regra, com caso proprio: sob um id so, ela poderia parar de acusar sem
    // nada falhar. A fiacao INSTANCIA o adapter — depender dela inverte a direcao.
    mutate: (m) => m.addIn('rootAdapter', {
      js: "\nimport { resolveAuth } from '../../src/composition.js';\n",
      py: '\nfrom src.composition import resolve_auth\n',
    }),
  },
  {
    rule: 'pure-ports',
    description: 'port imports the adapter that should implement it',
    // A inversao do vertice do diagrama: `adapters/ ──> packages/ports/` vira mao dupla, e a
    // interface canonica passa a depender de uma implementacao.
    mutate: (m) => m.addIn('rootPorts', {
      js: "\nimport { createRepository } from '../../adapters/memory/index.js';\n",
      py: '\nfrom adapters.memory import InMemoryRepository\n',
    }),
  },
  {
    rule: 'pure-ports',
    description: 'vendor SDK in the canonical interface while the same SDK is validly used by the adapter',
    // Duas afirmacoes num caso so, e a segunda e a que trava a regra contra si mesma:
    //
    //   (a) `pg` em `packages/ports/` REPROVA — `vendor-sdk` mantem o driver fora de cada
    //       modulo, e a porta o devolveria a TODOS de uma vez, porque todo modulo importa a porta;
    //   (b) o MESMO `pg` em `adapters/` NAO e acusado — e exatamente o lugar dele.
    //
    // (b) so vale como prova por causa da regra do harness: id nao declarado REPROVA. Se
    // `isolated-adapter` algum dia passar a acusar dependencia externa, este caso falha na hora —
    // e e o unico jeito de a nao-acusacao ficar coberta por maquina, e nao por inspecao.
    mutate: (m) => {
      m.addIn('rootPorts', { js: "\nimport pg from 'pg';\n", py: '\nimport psycopg2\n' });
      m.addIn('rootAdapter', { js: "\nimport pg from 'pg';\n", py: '\nimport psycopg2\n' });
    },
  },
  {
    rule: 'composition-discovery',
    description: 'composition imports a module instead of discovering it',
    // O par que separa DEPENDENCIA de DESCOBERTA: o mesmo arquivo, intocado, alcanca todos os
    // modulos por `readdirSync` + `module.json` e passa limpo no caso "molde conforme"; com um
    // IMPORT, acusa. Uma regra que procurasse a string `modules` acusaria os dois.
    mutate: (m) => m.addIn('compositionRoot', {
      js: "\nimport { algo } from '../modules/_template/core/domain/index.js';\n",
      py: '\nfrom modules._template.core.domain import algo\n',
    }),
  },
  {
    rule: 'ui-kit',
    description: 'ui.mode kit imports a raw UI library',
    // Liga `ui.mode: "kit"` no manifesto: os moldes nascem `own`, entao depender do default
    // deixaria as duas regras de UI sem exercicio nenhum.
    //
    // Um id so, e nao dois achados de ids diferentes: as DUAS clausulas do `ui-kit` disparam aqui
    // (importa a bruta, e nada em `web/` importa o kit) — sao duas mensagens do mesmo defeito de
    // declaracao, sob o mesmo id, e e assim que a regra foi escrita.
    //
    // No molde Python o arquivo estoura ENOENT (nao ha `web/`) e o runner marca SEM COBERTURA. E o
    // correto: la a regra silencia por desenho, e "sem cobertura" nao e aprovacao.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, ui: { ...x.ui, mode: 'kit' } }));
      m.writeOut(
        'web/src/components/Raw.tsx',
        "import { Button } from '@mui/material';\nexport const Botao = Button;\n",
      );
    },
  },
  {
    rule: 'ui-token',
    description: 'color literal in a style declaration with the UI kit imported correctly',
    // O arquivo IMPORTA o kit de proposito: sem isso a clausula (b) do `ui-kit` acusaria junto e o
    // caso deixaria de provar qual das duas regras esta viva. `<scope>` e trocado em memoria pelo
    // carregador do contexto, entao o import vale nos tres bindings.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, ui: { ...x.ui, mode: 'kit' } }));
      m.writeOut(
        'web/src/components/Cores.tsx',
        "import { Caixa } from '@<scope>/ui-kit';\n"
        + 'export const Destaque = () => <Caixa style={{ color: \'#ff0000\' }} />;\n',
      );
    },
  },

  {
    rule: 'ui-token',
    description: 'color literal in a stylesheet (.css), which is not a code file',
    // O `.css` nao entra em `ctx.codigo` (filtrado por extensao de linguagem), entao sem esta
    // varredura ele nunca chega a regra — e `color: #ff0000` em CSS e `propriedade: valor`, a
    // forma exata que o recorte persegue. Fica limpo onde, em `ui.mode: "kit"`, a cor mais vive.
    //
    // O `.tsx` importa o kit para a clausula (b) do `ui-kit` nao acusar junto: este caso emite UM id.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, ui: { ...x.ui, mode: 'kit' } }));
      m.writeOut(
        'web/src/components/DoKit.tsx',
        "import { Caixa } from '@<scope>/ui-kit';\nexport const C = Caixa;\n",
      );
      m.writeOut(
        'web/src/styles.css',
        '/* Nem #ffffff nem font-family: Inter num comentario contam — linhasCodigo descarta. */\n'
        + '.botao {\n  color: #ff0000;\n}\n',
      );
    },
  },

  // --- Dados ---------------------------------------------------------------------------------
  {
    rule: 'non-public-schema',
    description: 'database schema is public',
    mutate: (m) => m.manifest((x) => ({ ...x, data: { ...x.data, schema: 'public' } })),
  },
  {
    rule: 'table-prefix',
    description: 'declared table is missing the module prefix',
    // Cascata legitima: a tabela nova nao existe no SQL do modulo.
    //
    // Sem cobrir `table-declared` aqui, a tabela ausente do SQL cairia no `rls` com a mensagem
    // errada — "sem ENABLE ROW LEVEL SECURITY" —, quando o problema e que ela nao existe. `rls`
    // so pergunta de tabela que o SQL cria, e o achado tem a mensagem certa.
    also: ['table-declared'],
    mutate: (m) => m.manifest((x) => ({ ...x, data: { ...x.data, tables: [...x.data.tables, 'customers'] } })),
  },
  {
    rule: 'table-declared',
    description: 'table declared in data.tables has no CREATE TABLE in SQL',
    // `dados.tabelas` declara a tabela sem `CREATE TABLE` correspondente no SQL — gap que
    // `artifact-declared` nao cobre (ela nao entra em `database/`).
    //
    // Com o PREFIXO certo, senao `table-prefix` acusaria junto. `rls` fica CALADA de proposito:
    // se acusasse esta mesma tabela, a mensagem seria "sem ENABLE ROW LEVEL SECURITY" — errada
    // para uma tabela que nao existe.
    mutate: (m) => m.manifest((x) => ({
      ...x,
      data: { ...x.data, tables: [...x.data.tables, '<module_snake>_missing'] },
    })),
  },
  {
    rule: 'foreign-table',
    description: 'references another module\'s table',
    mutate: (m) => m.writeOut('core/domain/mau.ts', "export const q = 'select * from neighbor_metadata';\n"),
    requiresNeighbor: true,
  },
  {
    rule: 'migrations',
    description: 'migration has no rollback block',
    // Cascata legitima: `create table x` e uma tabela de verdade, criada por uma migration real —
    // fica sem declaracao (`table-undeclared`) e sem espelho em schema.sql
    // (`schema-mirrors-migrations`), os dois defeitos reais que a mutacao introduz junto do que o
    // caso quer provar (falta de rollback). Nao trocar por algo que nao crie tabela: perderia a
    // cobertura de que uma migration com CREATE TABLE de verdade continua acusando "sem rollback".
    also: ['table-undeclared', 'schema-mirrors-migrations'],
    mutate: (m) => m.writeOut('database/migrations/0002-creates-other.sql', 'create table x (id uuid);\n'),
  },
  {
    rule: 'rls',
    description: 'declared table is missing ENABLE ROW LEVEL SECURITY',
    // `rls` e AVISO, e o harness coleta achado de qualquer nivel — `analisar` nao filtra por nivel
    // e `checkCase` compara ids. `tambem` e TETO: se `rls` parasse de acusar aqui, nada
    // falharia sem este caso proprio.
    //
    // O ALTER sai dos DOIS arquivos: a regra le TODO o SQL do modulo junto (`ctx.sql`), entao
    // apaga-lo so do `schema.sql` deixa a copia da migration responder por ele e a regra
    // continua — com razao — calada. Um so lugar nao e o defeito; o defeito e a tabela nao ter
    // RLS em lugar nenhum, que e o esquecimento real que a regra persegue.
    //
    // Agnostico de binding: os dois arquivos sao identicos nos tres moldes. `migrations` segue
    // calada — ela cobra nome e bloco de rollback, e nenhum dos dois muda aqui.
    mutate: (m) => {
      const alter = 'alter table "<scope>"."<module_snake>_audit" enable row level security;';
      m.substitute('database/schema.sql', alter, '');
      m.substitute('database/migrations/0001-create-metadata.sql', alter, '');
    },
  },
  {
    rule: 'table-undeclared',
    description: 'table created in module SQL is missing from data.tables',
    // A mesma tabela nasce em migrations E em schema.sql — os dois espelhos concordam entre si, e
    // o unico defeito e a declaracao ausente. Criar so num dos dois acusaria tambem
    // `schema-mirrors-migrations`, ruido que este caso nao quer provar.
    mutate: (m) => {
      const creation = 'create table "<scope>"."<module_snake>_outra" (id uuid);\n';
      m.writeOut(
        'database/migrations/0002-creates-other.sql',
        `${creation}\n-- rollback\n-- drop table if exists "<scope>"."<module_snake>_outra";\n`,
      );
      m.add('database/schema.sql', `\n${creation}`);
    },
  },
  {
    rule: 'schema-mirrors-migrations',
    description: 'table created by the migration is missing from database/schema.sql',
    // Declara a tabela nova e liga RLS nela para o caso acusar SO este id: sem a declaracao,
    // `table-undeclared` acusaria junto (tabela criada e sem data.tables); sem o RLS, o aviso
    // `rls` tambem apareceria (tabela declarada, criada, e sem ENABLE ROW LEVEL SECURITY em lugar
    // nenhum) — nenhum dos dois e o defeito que este caso persegue, que e so o espelho desatualizado.
    mutate: (m) => {
      m.manifest((x) => ({
        ...x,
        data: { ...x.data, tables: [...x.data.tables, '<module_snake>_outra'] },
      }));
      m.writeOut(
        'database/migrations/0002-creates-other.sql',
        'create table "<scope>"."<module_snake>_outra" (id uuid);\n'
          + 'alter table "<scope>"."<module_snake>_outra" enable row level security;\n\n'
          + '-- rollback\n-- drop table if exists "<scope>"."<module_snake>_outra";\n',
      );
    },
  },

  // --- Configuracao e ambiente ---------------------------------------------------------------
  {
    rule: 'valid-config',
    description: 'config/*.json exists but contains invalid JSON',
    // PRESENTE e ilegivel — as duas coisas ao mesmo tempo, que e o que separa esta regra da
    // `structure` (que so cobra presenca). `config-schema` e `dead-config` pulam valor nulo de
    // proposito, entao o defeito acusa UM id.
    mutate: (m) => m.writeOut('config/domain.json', '{ "validStatuses": [\n'),
  },
  {
    rule: 'dead-config',
    description: 'declared config key is never read',
    // `domain` tem schema LIVRE por definicao, entao a chave nova nao trombra com `config-schema`.
    mutate: (m) => m.config('domain', (x) => ({ ...x, unreadFixtureField: 'no reader' })),
  },
  {
    rule: 'env-outside-loader',
    description: 'environment variable is read outside the config loader',
    // `process.env` NU: sem chave `<MODULE>_*` (senao acusaria `env-declared`) e sem default
    // literal (senao acusaria `silent-fallback`). Isola a regra, que ate aqui so vivia como
    // `tambem` de casos alheios.
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export const environment = process.env;\n'),
  },
  {
    rule: 'gitignore-secret',
    description: 'project .gitignore omits .env and modules/*/.env',
    // `../../` sobe para a raiz do PROJETO, como nos casos das outras regras de projeto. O ignore
    // continua existindo e valido — so deixou de cobrir o segredo, que e o defeito sob teste.
    mutate: (m) => m.writeOut('../../.gitignore', 'node_modules/\ndist/\n'),
  },
  {
    rule: 'secret-in-public',
    description: 'credential declared in a public-prefix environment variable (included in the bundle)',
    // `role: "gateway"` cala o `gateway-credential`, que isenta o gateway porque credencial e o
    // oficio dele — e assim o caso acusa UM id. A escolha tambem diz o que a regra afirma: nem o
    // gateway, dono da credencial, pode publica-la no bundle do front.
    mutate: (m) => {
      m.manifest((x) => ({
        ...x,
        role: 'gateway',
        requiredEnv: [...x.requiredEnv, 'VITE_MOLD_API_KEY'],
      }));
      // Sem isto o caso violava tambem `env-example` — ruido do fixture, nao do defeito.
      m.add('.env.example', 'VITE_MOLD_API_KEY=\n');
    },
  },
  {
    rule: 'insecure-random',
    description: 'token generated with Math.random outside core/',
    // FORA de `core/` de proposito: dentro dele quem cobra e o `determinism`, e este caso existe
    // para provar que a regra alcanca o territorio que o `determinism` nao cobre.
    mutate: (m) => m.writeOut(
      'api/src/tokens.ts',
      'export function newToken() {\n  return String(Math.random());\n}\n',
    ),
  },
  {
    rule: 'verification-declared',
    description: 'project root is missing config/verification.json',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO: e la que a politica mora, e e por
    // isso que estas duas regras leem `ctx.projeto` em vez do modulo.
    mutate: (m) => m.remove('../../config/verification.json'),
  },
  {
    rule: 'compliance-declared',
    description: 'project root is missing config/compliance.json',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO, como `verification-declared`.
    mutate: (m) => m.remove('../../config/compliance.json'),
  },
  {
    rule: 'compliance-declared',
    description: 'Portuguese key in the exception list ("regra" instead of "rule")',
    // O defeito medido em 2026-08-15: exececao com chave errada nao pegava a violacao, e nada
    // dizia por que. `additionalProperties:false` reprova o campo a mais, e o `rule` obrigatorio
    // ausente reprova junto — um erro, duas mensagens, as duas apontando a forma certa.
    mutate: (m) => m.writeOut(
      '../../config/compliance.json',
      JSON.stringify({ exceptions: [{ module: 'legacy', 'regra': 'strict-structure', reason: 'x', decision: 'ADR-001' }], exceptionsCve: [] }),
    ),
  },
  {
    rule: 'compliance-declared',
    description: 'exception with an old id (renamed by ADR-024) includes the rename hint',
    // O id VÁLIDO na posição 0 não pode ser acusado (`naoContem`), e o antigo na posição 1 diz
    // exatamente o que trocar — sem a dica, a migração de cada sistema seria arqueologia.
    mutate: (m) => m.writeOut('../../config/compliance.json', compliance('strict-structure', OLD_ID)),
    contains: `rule \`${OLD_ID}\` was renamed to \`${NEW_ID}\` (ADR-024)`,
    notContains: 'exceptions[0]',
    times: 1,
  },
  {
    rule: 'compliance-declared',
    description: 'exception with an id that never existed is flagged WITHOUT a rename hint',
    // `row-level-security` nunca foi id do catálogo (é `rls`): a exceção já era inerte, e calada.
    mutate: (m) => m.writeOut('../../config/compliance.json', compliance('row-level-security')),
    contains: 'is not a catalog rule id',
    notContains: 'was renamed',
    times: 1,
  },
  {
    rule: 'derived-lint',
    description: 'manually edited linter config differs from the threshold source',
    // A regra compara BYTE A BYTE com o que o gerador produziria, entao qualquer edicao manual e o
    // defeito — nao so a troca de um numero. Alvo logico + trecho por sintaxe: o arquivo e
    // `eslint.config.js` em TS/JS e `.ruff.toml` no Python, e o comentario muda de marcador junto.
    mutate: (m) => m.addIn('rootLint', {
      js: '\n// limiar ajustado a mao, fora de tools/gate/thresholds.mjs\n',
      py: '\n# limiar ajustado a mao, fora de tools/gate/thresholds.mjs\n',
    }),
  },
  {
    rule: 'pre-commit-installed',
    description: 'project root is missing .githooks/pre-commit',
    // `../../` sobe da pasta do modulo para a raiz do PROJETO, como nos demais casos de escopo raiz.
    mutate: (m) => m.remove('../../.githooks/pre-commit'),
  },
  {
    rule: 'pre-commit-installed',
    description: '.githooks/pre-commit exists but does not invoke the verification chain',
    mutate: (m) => m.writeOut('../../.githooks/pre-commit', '#!/bin/sh\necho "oi"\n'),
  },
  {
    rule: 'container-present',
    description: 'project root is missing Dockerfile',
    // `../../` sobe para a raiz do PROJETO. O molde conforme traz os quatro arquivos base nos tres
    // bindings, entao remover um e o unico defeito.
    contains: 'Dockerfile is missing',
    mutate: (m) => m.remove('../../Dockerfile'),
  },
  {
    rule: 'container-present',
    description: 'project is missing deploy/.env.example',
    // O arquivo que carrega as chaves `DEPLOY_*` — sem ele o compose sobe com variavel vazia e nenhum
    // documento diz quais. `compose-variables-declared` tambem acusa (as `DEPLOY_*` do compose
    // perdem a casa onde eram declaradas): a cascata e legitima, nao ruido.
    also: ['compose-variables-declared'],
    contains: 'deploy/.env.example is missing',
    mutate: (m) => m.remove('../../deploy/.env.example'),
  },
  {
    rule: 'container-present',
    description: 'module has webPath and web/, but the project is missing front.Dockerfile',
    // A condicional: o front so e exigido onde ha tela. O vizinho copia o molde (webPath `/vizinho` e
    // `web/`); onde o molde nao tem `web/` (Python) o caso vira SEM COBERTURA, nao um "nenhum achado".
    requiresNeighbor: true,
    contains: 'front.Dockerfile is missing',
    mutate: (m) => m.removeDirIn('frontDockerfile'),
  },
  {
    rule: 'dockerignore-secret',
    description: '.dockerignore does not ignore .env',
    // O arquivo existe (`container-present` cala) e lista o resto do contexto — so o segredo ficou de
    // fora. As duas mensagens da regra saem juntas: nem a raiz nem `**/.env` estao cobertas.
    contains: '.dockerignore does not exclude',
    times: 2,
    mutate: (m) => m.writeOut('../../.dockerignore', 'node_modules\ndist\n'),
  },
  {
    rule: 'dockerignore-secret',
    description: '.dockerignore ignores root .env but not `**/.env` (module and deploy files)',
    // `.env` no dockerignore casa SO na raiz do contexto — a diferenca de semantica para o gitignore, e o
    // motivo de a regra ter duas metades.
    contains: '**/.env',
    times: 1,
    mutate: (m) => m.writeOut('../../.dockerignore', 'node_modules\n.env\n.env.*\n!.env.example\n'),
  },
  {
    rule: 'compose-variables-declared',
    description: 'compose.yml interpolates a variable declared by neither a manifest nor deploy/.env.example',
    // `x-extra` e a forma legal de acrescentar uma chave de topo ao compose sem tocar servico nenhum —
    // o texto continua YAML valido, e a variavel e a unica coisa errada.
    contains: 'DEPLOY_UNDECLARED',
    mutate: (m) => m.add('../../compose.yml', '\nx-extra: ${DEPLOY_UNDECLARED:?required}\n'),
  },
  {
    rule: 'web-tests',
    description: 'webPath is declared and tests/web/ is empty',
    // Nao mexe no manifesto: o molde de TS/JS ja nasce com `webPath`, e usar a declaracao REAL e o
    // que faz o caso provar a condicional em vez de fabrica-la. `removerPastaEm` (e nao
    // `removerPasta`) porque no Python o alvo nao existe: la o caso vira SEM COBERTURA declarada, e
    // nao um "nenhum achado" que culparia a regra por um molde que nasce sem tela.
    mutate: (m) => m.removeDirIn('webTestsDir'),
  },
  {
    rule: 'gateway-tests',
    description: 'real gateway is declared but has no matching test',
    // O terceiro lado do triangulo. Os outros dois ficam SATISFEITOS de proposito — o arquivo tem
    // entrada em `consumes` (cala `gateway-declared`) e a rota existe na spec do vizinho (cala
    // `consumes-contract`) —, entao o caso acusa UM id: a dependencia esta declarada, conforme, e
    // sem uma linha de teste que a exercite. E exatamente o buraco que a regra fecha.
    //
    // Sem SQL nem URL literal no corpo, para `gateway-http` e `hardcode-url` tambem calarem.
    mutate: (m) => {
      m.writeOut('core/gateways/neighbor.ts', 'export async function obter(u) { return fetch(u); }\n');
      m.manifest((x) => ({
        ...x,
        consumes: [{ module: 'neighbor', contract: 'GET /summary', why: 'triangle proof' }],
      }));
    },
    requiresNeighbor: true,
  },
  {
    rule: 'root-manifest',
    description: 'project root is missing project.json',
    // A raiz e a unidade menos verificada e a que concentra o risco: o modulo e proibido de tocar
    // banco, importar adapter e ler env fora do carregador, entao conexao, query e credencial
    // acontecem todas la. Sem manifesto, nada disso e declarado.
    //
    // `root-env-declared` cala de proposito quando o manifesto nao e legivel — um defeito, uma
    // mensagem —, entao este caso acusa UM id.
    mutate: (m) => m.remove('../../project.json'),
  },
  {
    rule: 'root-manifest',
    description: 'unexpected field in the root manifest',
    // A trava contra o vicio desta base, em forma de teste: campo novo em `project.json` REPROVA
    // ate que exista a regra que o cobra. `ui`, `exportsSummary` e `generatesArtifact` ficaram anos
    // declarados sem verificador porque nada impedia o campo de entrar sozinho.
    mutate: (m) => m.rootManifest((x) => ({ ...x, ports: ['repository'] })),
  },
  {
    rule: 'root-env-declared',
    description: 'root environment variable is used in composition but missing from project.json',
    // Sem esta regra, o `.env.example` da raiz sai so dos manifestos de MODULO, entao o
    // `JWT_SECRET` do `resolverAuth()` nasce orfao — invisivel a `env-declared` e a
    // `env-example`, que sao regras por modulo. O segredo mais sensivel fica o unico sem dono.
    //
    // Alvo logico + trecho por sintaxe: a fiacao le env de forma diferente em cada binding.
    mutate: (m) => m.addIn('compositionRoot', {
      js: '\nexport const jwtSecret = process.env.ROOT_JWT_SECRET;\n',
      py: '\n\nJWT_SECRET = os.environ["ROOT_JWT_SECRET"]\n',
    }),
  },
  {
    rule: 'root-env-declared',
    description: 'environment variable is declared in project.json but unused in composition',
    // O sentido inverso, e ele nao e simetria decorativa: a chave declarada entra no `.env.example`
    // e passa a EXIGIR do operador um valor que nada le. Mutacao agnostica de binding — so JSON.
    mutate: (m) => m.rootManifest((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'ROOT_NO_READER'] })),
  },
  {
    rule: 'concatenated-sql',
    description: 'query is built by concatenation in the adapter',
    // A fiacao e onde a query NASCE: o modulo nao pode ter driver (`vendor-sdk`) nem importar
    // adapter (`import-adapter`), entao quem fala com o banco e este arquivo. A metade que sobra
    // (SQL montado DENTRO do modulo) e da `sql-in-module`,
    // logo abaixo: a MESMA linha, na outra colecao, e nenhum arquivo cai nas duas.
    mutate: (m) => m.addIn('rootAdapter', {
      js: "\nexport const find = (db, id) => db.query('select * from records where hash = ' + id);\n",
      py: '\n\ndef find(db, id):\n    return db.execute("select * from records where hash = " + id)\n',
    }),
  },
  {
    rule: 'sql-in-module',
    description: 'SQL is built inside the module and passed to a port',
    // Vetor residual medido: a superficie canonica de `packages/ports/` e tipada por
    // OPERACAO e nao aceita comando, mas o `core/ports/` do MODULO e escrito pelo autor dele e
    // ninguem compara as duas formas. Com um `executarConsulta(sql)` declarado la, a concatenacao
    // fica no modulo e a execucao na raiz — e a `concatenated-sql` ve o `.query(sql)` do adapter sem
    // ver como a string nasceu.
    //
    // `alguma_coisa` nao e tabela de modulo nenhum de proposito: com o nome de um vizinho o caso
    // acusaria tambem `foreign-table` e deixaria de provar qual regra esta viva.
    mutate: (m) => m.writeOut(
      'core/domain/raw-query.ts',
      'export const find = (deps, filter) =>\n'
        + "  deps.repository.executeQuery('select hash from something where title = ' + filter);\n",
    ),
  },
  {
    rule: 'root-hardcode-url',
    description: 'literal infrastructure URL in composition',
    // O gemeo de `hardcode-url`, com a MESMA `URL_LITERAL`. O adapter e onde o endereco do
    // fornecedor de verdade aparece, e e o territorio que o gemeo de modulo nunca alcancou.
    mutate: (m) => m.addIn('rootAdapter', {
      js: "\nexport const base = 'https://api.acme.com';\n",
      py: '\nBASE = "https://api.acme.com"\n',
    }),
  },
  {
    rule: 'root-fallback',
    description: 'silent environment-variable default in composition',
    // A chave e DECLARADA no manifesto da raiz de proposito: sem isso o caso acusaria tambem
    // `root-env-declared`, e deixaria de provar qual das duas esta viva. E a declaracao
    // mostra que as duas nao brigam — `root-env-declared` cobra a chave nao declarada e NAO proibe
    // a leitura; ler o ambiente e o oficio da composicao. O que esta regra proibe e o DEFAULT.
    mutate: (m) => {
      m.rootManifest((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'ROOT_PORT'] }));
      // A chave em COMENTARIO trava a nao-acusacao de `root-env-declared`: se ela voltar a ler
      // `conteudo` cru, acusa `ROOT_ONLY_IN_COMMENT` como usada-e-nao-declarada, emite id nao
      // declarado, e este caso reprova.
      m.addIn('compositionRoot', {
        js: '\n// Exemplo, nao uso: process.env.ROOT_ONLY_IN_COMMENT\n'
          + "export const port = process.env.ROOT_PORT ?? 'fallback';\n",
        py: '\n# Exemplo, nao uso: os.environ["ROOT_ONLY_IN_COMMENT"]\n'
          + 'import os\n\nPORT = os.environ.get("ROOT_PORT", "fallback")\n',
      });
    },
  },
  {
    rule: 'secret-in-log',
    description: 'credential declared in project.json is logged alongside an innocuous key',
    // O sinal vem de onde JA existe declaracao: `project.json:requiredEnv` cruzado com o mesmo
    // vocabulario fechado de sufixo de credencial de `gateway-credential`. A raiz nao tem
    // `sensitiveFields` — `project.schema.json` declara um campo so, com
    // `additionalProperties: false` fechando a porta de proposito.
    //
    // As DUAS chaves entram na mesma linha de log: `ROOT_JWT_SECRET` casa o sufixo de credencial e
    // e acusada; `ROOT_API_BASE_URL` nao casa e passa. Declarar as duas tambem cala
    // `root-env-declared`, nos dois sentidos — declaradas e usadas.
    mutate: (m) => {
      m.rootManifest((x) => ({
        ...x,
        requiredEnv: [...x.requiredEnv, 'ROOT_JWT_SECRET', 'ROOT_API_BASE_URL'],
      }));
      m.addIn('compositionRoot', {
        js: '\nexport const check = (logger) =>\n'
          + "  logger.error('checking', process.env.ROOT_JWT_SECRET, process.env.ROOT_API_BASE_URL);\n",
        py: '\nimport os\n\n\ndef check(logger):\n'
          + '    logger.error("checking", os.environ["ROOT_JWT_SECRET"], os.environ["ROOT_API_BASE_URL"])\n',
      });
    },
  },
  {
    rule: 'port-declared',
    description: 'port is CONFIGURED in config/ports.json but missing from the manifest',
    // A primeira das duas brechas que o `$comment` do schema afirmava fechar e nao fechava:
    // `storage` esta no vocabulario do schema, entao `config-schema` passa. O caso acusa UM id.
    mutate: (m) => m.config('ports', (x) => ({ ...x, storage: 'disco' })),
  },
  {
    rule: 'port-declared',
    description: 'port is DECLARED in the manifest but missing from config/ports.json',
    // A segunda brecha: o schema nao tem `required`, entao porta declarada e nunca configurada
    // passaria. `storage` esta no enum do module.schema.json, entao `manifest-schema` tambem cala.
    // Esta e a direcao que DERRUBA O BOOT — `resolverDependencias` nao acha o provedor e lanca.
    mutate: (m) => m.manifest((x) => ({ ...x, ports: [...x.ports, 'storage'] })),
  },
  {
    rule: 'navigation-declared',
    description: 'navigation is declared while webPath is null',
    // Declara os DOIS lados no proprio caso, como o `web-declared` faz: assim vale nos tres
    // bindings, e nao depende de o molde daquele binding nascer com tela (o Python nao nasce).
    //
    // `web-declared` e `web-tests` tem a mesma guarda `webPath == null` e ficam caladas — e e
    // justamente o que torna este achado necessario: com a tela zerada, ninguem mais notaria a
    // entrada de menu apontando para o nada.
    mutate: (m) => m.manifest((x) => ({
      ...x,
      webPath: null,
      navigation: { label: 'Mold', icon: 'Box', order: 100 },
    })),
  },
  {
    rule: 'permission-literal',
    description: 'permission is passed as a literal to requirePermission',
    // Nao registra rota: um `router.get` novo violaria tambem `synchronized-contract`, e o caso
    // deixaria de provar qual regra esta viva. So a chamada, com o literal que a regra persegue.
    mutate: (m) => m.addIn('routes', {
      js: "\nexport const requireLiteral = (req) => requirePermission('mold:read')(req);\n",
      py: '\n\ndef require_literal(request):\n    require_permission(request, "mold:read")\n',
    }),
  },
  {
    rule: 'config-schema',
    description: 'logLevel is outside the vocabulary',
    mutate: (m) => m.config('api', (x) => ({ ...x, logLevel: 'gritante' })),
  },
  {
    rule: 'open-cors',
    description: 'CORS allows every origin with a wildcard',
    mutate: (m) => m.config('security', (x) => ({ ...x, cors: { ...x.cors, allowedOrigins: ['*'] } })),
  },
  {
    rule: 'hardcode-url',
    description: 'literal URL in code',
    // A segunda linha trava uma NAO-acusacao, pela tecnica do caso do `log`: SQL PARAMETRIZADO
    // dentro do modulo nao e defeito de `sql-in-module`, cujo recorte exige que o valor entre na
    // string. Se ela perder o discriminador de injecao e passar a acusar "qualquer SQL", o id sai
    // aqui como NAO declarado e o autoteste reprova na hora — que e a unica forma de o harness
    // afirmar um silencio.
    mutate: (m) => m.writeOut(
      'core/domain/mau.ts',
      "export const base = 'https://api.acme.com';\n"
        + "export const query = 'select hash from something where title = $1';\n",
    ),
  },
  {
    rule: 'hardcode-number',
    description: 'numeric infrastructure literal in code',
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export const timeoutMs = 30000;\n'),
  },
  {
    rule: 'silent-fallback',
    description: 'silent environment-variable default',
    // Cascata legitima: a mesma linha embute URL literal e le env fora do carregador.
    also: ['hardcode-url', 'env-outside-loader'],
    mutate: (m) => m.writeOut('core/domain/mau.ts', "export const u = process.env['X'] ?? 'http://localhost';\n"),
  },
  {
    rule: 'env-declared',
    description: 'environment variable is used but not declared in the manifest',
    // Cascata legitima: ler env dentro de `core/` e, por definicao, fora do carregador.
    also: ['env-outside-loader'],
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export const s = process.env.MOLD_NEW_SECRET;\n'),
  },
  {
    rule: 'env-example',
    description: '.env.example differs from the manifest',
    mutate: (m) => m.writeOut('.env.example', 'MOLD_API_PORT=\n'),
  },
  {
    rule: 'env-module',
    description: 'module .env contains another module\'s key',
    mutate: (m) => m.writeOut('.env', 'ENV_ROOT=../../.env\nNEIGHBOR_DB_URL=x\n'),
  },

  // --- Contrato ------------------------------------------------------------------------------
  {
    rule: 'contract',
    description: 'contract is missing required endpoints',
    // Cascata legitima e inevitavel: a spec minima omite as rotas obrigatorias que o codigo
    // registra, entao divergir do codigo e consequencia do proprio defeito sob teste. E, pela mesma
    // razao, as tres entradas de `publicRoutes` deixam de apontar para rota que existe — defeito
    // real, e nao ruido: uma spec sem `/health` faz "GET /health" isentar coisa nenhuma.
    also: ['synchronized-contract', 'public-route-authenticated'],
    // O `servers:` e as `properties:` entram na spec minima de proposito: sem eles o caso acusaria
    // tambem `route-naming` e `contract-projection`, e deixaria de provar a ausencia das rotas
    // OBRIGATORIAS, que e o dele. As propriedades sao TODAS as que os mapeadores do molde projetam
    // (toContract, toMeta, toCollection — os tres sao vistos, nao so o primeiro).
    mutate: (m) => m.writeOut(
      'contract/openapi.yaml',
      [
        'openapi: 3.1.0',
        'servers:',
        '  - url: /api/v1/<module>',
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
        '                  title: { type: string }',
        '                  status: { type: string }',
        '                  createdAt: { type: string }',
        '                  id: { type: string }',
        '                  name: { type: string }',
        '                  version: { type: string }',
        '                  role: { type: string }',
        '                  basePath: { type: string }',
        '                  webPath: { type: string }',
        '                  navigation: { type: object }',
        '                  exportsSummary: { type: boolean }',
        '                  items: { type: array }',
        '                  page: { type: integer }',
        '                  pageSize: { type: integer }',
        '                  total: { type: integer }',
        '',
      ].join('\n'),
    ),
  },
  {
    rule: 'contract',
    description: 'valid flow-style spec that the block reader cannot parse',
    // OpenAPI VALIDO: declara servers, /health, /meta e /summary. So que em flow style. O gate tem
    // de acusar UMA vez que nao consegue ler — nunca afirmar que as rotas faltam, que e falso.
    mutate: (m) => m.writeOut(
      'contract/openapi.yaml',
      [
        'openapi: 3.1.0',
        'servers: [{url: /api/v1/<module>}]',
        'paths: {"/health": {get: {responses: {"200": {description: ok}}}},'
          + ' "/meta": {get: {responses: {"200": {description: ok}}}},'
          + ' "/summary": {get: {responses: {"200": {description: ok}}}}}',
        '',
      ].join('\n'),
    ),
  },
  {
    rule: 'contract',
    description: 'block-style paths with indentation other than 2 spaces',
    // Prova que a deteccao NAO e "flow style" e que a mensagem nomeia a secao certa. Este YAML e bloco
    // valido, indentado com 4 — e o leitor exige recuo 2 na rota e 4 no metodo.
    mutate: (m) => m.writeOut('contract/openapi.yaml', [
      'openapi: 3.1.0',
      'servers:',
      '  - url: /api/v1/<module>',
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
      '    /summary:',
      '        get:',
      '            responses:',
      "                '200':",
      '                    description: ok',
      '',
    ].join('\n')),
  },
  {
    rule: 'route-naming',
    description: 'servers[0].url differs from the manifest baseRoute',
    mutate: (m) => m.substitute('contract/openapi.yaml', 'url: /api/v1/<module>', 'url: /api/v1/elsewhere'),
  },
  {
    rule: 'route-naming',
    description: 'path parameter is not camelCase',
    // `{Hash}` e `:hash` normalizam para o mesmo `{}`, entao `synchronized-contract` continua
    // calado — este caso acusa UM id, e prova que a checagem de segmento esta viva.
    mutate: (m) => m.substitute('contract/openapi.yaml', '/entries/{hash}:', '/entries/{Hash}:'),
  },
  {
    rule: 'route-naming',
    description: 'Portuguese verb used as a path segment',
    // A rota entra na spec E no codigo, senao o caso acusaria tambem `synchronized-contract`.
    mutate: (m) => {
      m.substitute('contract/openapi.yaml', '  /health:', [
        '  /create-item:',
        '    get:',
        '      summary: verbo no path',
        '      responses:',
        "        '200':",
        '          description: ok',
        '  /health:',
      ].join('\n'));
      m.writeOut('api/src/extra.ts', "router.get('/create-item', (_req, res) => res.json({ ok: true }));\n");
    },
  },
  {
    rule: 'synchronized-contract',
    description: 'route exists in code but is missing from the contract',
    // Alvo LOGICO + trecho por sintaxe: o caminho do arquivo de rotas muda por binding
    // (`api/src/routes.py` no Python) e a forma de registrar rota tambem (decorator). Fixar os dois
    // deixaria esta regra provada so em TypeScript.
    mutate: (m) => m.addIn('routes', {
      js: "\nrouter.get('/undeclared', () => undefined);\n",
      py: '\n\n@router.get("/undeclared")\ndef undeclared_route():\n    return {}\n',
    }),
  },
  {
    rule: 'synchronized-contract',
    description: 'route exists in the contract but is missing from code',
    mutate: (m) => m.substitute(
      'contract/openapi.yaml',
      'paths:\n',
      'paths:\n  /so-na-spec:\n    get:\n      summary: fantasma\n      responses:\n        200:\n          description: ok\n',
    ),
  },
  {
    rule: 'contract-projection',
    description: 'FIRST projection key is undeclared (Python template)',
    // Escrito para o binding Python de proposito: e o unico em que a primeira chave nao tem um
    // `{` sobrando antes dela — um extrator que lesse a assinatura da funcao, em vez de procurar
    // `return {` direto, ficaria cego para esta forma. E a diferenca entre consertar de verdade e
    // mover o sintoma.
    // `contem`: afirma que a mensagem nomeia o CAMPO certo — sem isto, o caso
    // passaria igual se a regra acusasse qualquer outro campo por engano, contanto que fosse a
    // mesma regra.
    contains: 'phantomField',
    mutate: (m) => m.substitute(
      'api/src/mappers.py',
      'mascarado.\n    """\n    return {\n        "hash": entry.hash,',
      'mascarado.\n    """\n    return {\n        "phantomField": entry.hash,',
    ),
  },
  {
    rule: 'contract-projection',
    description: 'single-line arrow projection with an undeclared field',
    // A forma limite do balanceamento: fecha na mesma linha, sem `\n` antes do `}`. Prova que o
    // balanceamento continua LENDO a projecao — o conserto da sobre-captura nao pode virar
    // cegueira para a forma que a causava.
    mutate: (m) => m.writeOut(
      'api/src/mapper-arrow.ts',
      'export const toContractArrow = (r) => ({ hash: r.hash, fieldArrow: r.extra });\n',
    ),
  },
  {
    rule: 'contract-projection',
    description: 'projection exposes a field that no response schema declares',
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
    // LEGITIMO de `mapper-naming`, nao efeito colateral: e exatamente o tipo de nome que a
    // regra existe para pegar, so que aqui o proposito do caso e outro.
    also: ['mapper-naming'],
    mutate: (m) => m.writeOut(
      'api/src/mapper-extra.ts',
      'export function toContractExtra(r) {\n  return { hash: r.hash, fieldGhost: r.fantasma };\n}\n'
        + 'export const toContractList = (rs) => rs.map(toContractExtra);\n'
        + 'export function doesNotPublish(r) {\n  return { created_at: r.createdAt };\n}\n',
    ),
  },
  // --- as 18 formas do extrator de projecao ------------------------------------------------
  {
    rule: 'contract-projection',
    description: 'inline return type does not confuse the extractor',
    // `): { hash: string; campoForma1: string } {` — sob um extrator ancorado na assinatura, a
    // primeira `{` depois do nome seria a do TIPO, nao a do corpo. O separador `;` do tipo (nao
    // `,`) faz "hash" escapar por acidente as vezes e "campoForma1" nunca ser visto. O extrator
    // atual nunca olha a assinatura: procura `return {` direto.
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape1.ts',
      'export function toContractShape1(r: { hash: string }): { hash: string; fieldShape1: string } {\n'
        + "  return { hash: r.hash, fieldShape1: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'one parameter with an inline type',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape2.ts',
      'export function toContractShape2(o: { a: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, fieldShape2: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'two parameters with inline types',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape3.ts',
      'export function toContractShape3(o: { a: string }, p: { b: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, b: p.b, fieldShape3: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'generic with an object type (<T extends { id: string }>)',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape4.ts',
      'export function toContractShape4<T extends { id: string }>(o: T): Record<string, unknown> {\n'
        + "  return { id: o.id, fieldShape4: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'Array<{ … }> return type',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape5.ts',
      'export function toContractShape5(r: { hash: string }): Array<{ hash: string }> {\n'
        + "  return { hash: r.hash, fieldShape5: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'Promise<{ … }> return type',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape6.ts',
      'export async function toContractShape6(r: { hash: string }): Promise<{ hash: string }> {\n'
        + "  return { hash: r.hash, fieldShape6: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'parameter default "= {}" in all three bindings',
    mutate: (m) => m.addIn('mappers', {
      js: "\nexport function toContractShape7(options: Record<string, unknown> = {}): Record<string, unknown> {\n"
        + "  return { fieldShape7: 'x' };\n}\n",
      py: "\n\ndef to_contract_shape7(options=None):\n    return {\"fieldShape7\": \"x\"}\n",
    }),
  },
  {
    rule: 'contract-projection',
    description: 'inline type WITH a default',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape8.ts',
      "export function toContractShape8(o: { a: string } = { a: 'x' }): Record<string, unknown> {\n"
        + "  return { fieldShape8: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'canonical body "): Record<string, unknown> {" must not regress',
    // E a forma que o proprio molde usa (toContract) — este caso trava que uma violacao SOB essa
    // forma continua sendo pega, nao so que a forma boa passa.
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape9.ts',
      "export function toContractShape9(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, fieldShape9: 'x' };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'nested object inside the projection must not regress',
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape11.ts',
      "export function toContractShape11(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, nested: { fieldShape11: 'x' } };\n}\n",
    ),
  },
  {
    rule: 'contract-projection',
    description: 'two "return" statements in one function produce TWO regions',
    // `vezes: 2`: afirma que as DUAS regioes viram DUAS mensagens, nao uma —
    // sem isto, um extrator que voltasse a enxergar só a primeira `return` passaria calado, porque
    // "acusou `contract-projection`" já bastava para o caso antigo, não importa quantas vezes.
    times: 2,
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape12.ts',
      "export function toContractShape12(r: { hash: string }, summary: boolean): Record<string, unknown> {\n"
        + "  if (summary) {\n    return { fieldShape12Summary: 'x' };\n  }\n"
        + "  return { hash: r.hash, fieldShape12Detail: 'x' };\n}\n",
    ),
  },
  {
    rule: 'log',
    description: '"const inner = { … }" inside a function is NOT a projection (decoy)',
    // O objeto intermediario nao esta em posicao de `return` nem de `=>`, entao nunca casa
    // OBJECT_RETURN_PATTERN — nenhuma guarda nova precisou existir para isso. `console.log` arma o
    // chamariz: se `campoInterno` fosse (erradamente) visto como projetado, apareceria um id extra
    // (`contract-projection`) NAO DECLARADO, e o caso reprovaria.
    mutate: (m) => m.writeOut(
      'api/src/mapper-shape14.ts',
      "export function toContractShape14(r: { hash: string }): Record<string, unknown> {\n"
        + "  const internal = { fieldInternal: 'never published' };\n"
        + "  console.log(internal);\n"
        + "  return { hash: r.hash };\n}\n",
    ),
  },
  {
    rule: 'log',
    description: 'class method that does NOT expose data, AFTER a method that does (decoy)',
    // O defeito que so aparece com METODO: sem recuo na janela, tudo depois da primeira projecao (o
    // metodo `para*`) e atribuido a ela — `chaveDeCache`, que devolve so campo de BANCO
    // (`created_at`) e nao e projecao nenhuma, tem seu `return` inteiro somado a projecao do
    // metodo anterior. `console.log` arma o chamariz: se `created_at` fosse (erradamente) visto
    // como projetado, apareceria `payload-camelcase` NAO DECLARADO e o caso reprovaria.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport class ProjectionsN21 {\n  toGama(record) {\n    console.log("x");\n'
        + '    return { hash: record.hash };\n  }\n\n'
        + '  cacheKey(record) {\n    return { created_at: record.createdAt };\n  }\n}\n',
      py: '\n\nclass ProjectionsN21:\n    def to_gama(self, record):\n        print("x")\n'
        + '        return {"hash": record["hash"]}\n\n'
        + '    def cache_key(self, record):\n        return {"created_at": record["created_at"]}\n',
    }),
  },
  {
    rule: 'log',
    description: '"cpf" in a class method that exposes nothing stays QUIET (sensitive-in-output)',
    // A reproducao exata do revisor: `chaveDeCache` devolve "created_at" E "cpf", e nenhum dos dois
    // pode ser visto como projetado — o metodo nao e "para*", entao nunca e sitio. Se a janela
    // regredisse, `sensitive-in-output` apareceria NAO DECLARADO ao lado de `log` e o caso reprovaria.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.addIn('mappers', {
        js: '\nexport class ProjectionsN21b {\n  toDelta(record) {\n    console.log("x");\n'
          + '    return { hash: record.hash };\n  }\n\n'
          + '  cacheKey(record) {\n    return { created_at: record.createdAt, cpf: record.hash };\n  }\n}\n',
        py: '\n\nclass ProjectionsN21b:\n    def to_delta(self, record):\n        print("x")\n'
          + '        return {"hash": record["hash"]}\n\n'
          + '    def cache_key(self, record):\n'
          + '        return {"created_at": record["created_at"], "cpf": record["hash"]}\n',
      });
    },
  },
  {
    rule: 'sensitive-in-output',
    description: '"cpf" actually exposed by a class method is still FLAGGED',
    // O outro lado do conserto: a janela fecha, mas nao cega a regra. Um SEGUNDO metodo "para*" na
    // mesma classe, depois do que nao publica, e a projecao dele publica cpf de verdade.
    also: ['contract-projection'],
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.addIn('mappers', {
        js: '\nexport class ProjectionsN21c {\n  toEpsilon(record) {\n'
          + '    return { hash: record.hash };\n  }\n\n'
          + '  cacheKey(record) {\n    return { created_at: record.createdAt };\n  }\n\n'
          + '  toZeta(record) {\n    return { hash: record.hash, cpf: record.cpf };\n  }\n}\n',
        py: '\n\nclass ProjectionsN21c:\n    def to_epsilon(self, record):\n'
          + '        return {"hash": record["hash"]}\n\n'
          + '    def cache_key(self, record):\n'
          + '        return {"created_at": record["created_at"]}\n\n'
          + '    def to_zeta(self, record):\n'
          + '        return {"hash": record["hash"], "cpf": record["cpf"]}\n',
      });
    },
  },
  {
    rule: 'log',
    description: 'arrow property that does NOT expose data, AFTER one that does (decoy)',
    // O defeito que so aparece em objeto literal de arrows: um fechador que exigisse
    // `identificador(` depois do nome ficaria cego aqui — `chaveDeCache: (r) => (...)` tem `:`
    // entre os dois, nunca fechando a janela de `toGama`. `console.log`/`print` arma o chamariz:
    // se "created_at" fosse (erradamente) visto como projetado por `toGama`, apareceria
    // `payload-camelcase` NAO DECLARADO e o caso reprovaria.
    // No Python o analogo e a atribuicao de modulo (`name = lambda r: {...}`, sem `def` nem `class`):
    // `chave_de_cache` bare, seguida de "=" (nao "("), fica invisivel a esse mesmo fechador
    // estreito, pelo MESMO motivo.
    mutate: (m) => m.addIn('mappers', {
      js: "\nexport const ProjectionsN22 = {\n  toGama: (record) => {\n    console.log('x');\n"
        + '    return { hash: record.hash };\n  },\n\n'
        + '  cacheKey: (record) => ({ created_at: record.createdAt }),\n};\n',
      py: '\n\ndef to_gama(record):\n    print("x")\n'
        + '    return {"hash": record["hash"]}\n\n\n'
        + 'cache_key = lambda record: {"created_at": record["created_at"]}\n',
    }),
  },
  {
    rule: 'sensitive-in-output',
    description: '"cpf" actually exposed by an arrow property AFTER one that exposes nothing',
    // O outro lado do conserto: a janela fecha, mas nao cega a regra. Uma
    // TERCEIRA entrada "para*" no mesmo objeto/module, depois da que nao publica, projeta cpf de
    // verdade — se a janela da primeira regredisse e engolisse a segunda, "created_at" apareceria
    // como `payload-camelcase` NAO DECLARADO e o caso reprovaria antes mesmo de chegar no cpf.
    also: ['contract-projection'],
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      m.addIn('mappers', {
        js: '\nexport const ProjectionsN22c = {\n  toEpsilon: (record) => ({ hash: record.hash }),\n\n'
          + '  cacheKey: (record) => ({ created_at: record.createdAt }),\n\n'
          + '  toZeta: (record) => ({ hash: record.hash, cpf: record.cpf }),\n};\n',
        py: '\n\nto_epsilon = lambda record: {"hash": record["hash"]}\n\n'
          + 'cache_key = lambda record: {"created_at": record["created_at"]}\n\n'
          + 'to_zeta = lambda record: {"hash": record["hash"], "cpf": record["cpf"]}\n',
      });
    },
  },
  {
    rule: 'sensitive-in-output',
    description: '"cpf" leaked by toMeta, the route WITHOUT A TOKEN',
    // toMeta serve /meta, rota sem token. Sob uma ancora de nome ESTREITA (so toContract*) a
    // funcao inteira ficaria invisivel ao extrator, e um campo sensivel acrescentado aqui nunca
    // seria pego por regra nenhuma. Tenta os tres caminhos; so o
    // do binding em teste existe, os outros dois viram ENOENT e sao ignorados aqui mesmo.
    also: ['contract-projection'],
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      for (const path of ['api/src/mappers/index.ts', 'api/src/mappers/index.js']) {
        try {
          m.substitute(path, 'exportsSummary: manifest.exportsSummary,', "exportsSummary: manifest.exportsSummary,\n    cpf: 'x',");
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substitute(
          'api/src/mappers.py',
          '"exportsSummary": manifest["exportsSummary"],',
          '"exportsSummary": manifest["exportsSummary"],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    rule: 'sensitive-in-output',
    description: '"cpf" leaked by toCollection',
    also: ['contract-projection'],
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      for (const path of ['api/src/mappers/index.ts', 'api/src/mappers/index.js']) {
        try {
          m.substitute(
            path,
            'return { items: entries.map(toContract), page, pageSize, total };',
            "return { items: entries.map(toContract), page, pageSize, total, cpf: 'x' };",
          );
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substitute(
          'api/src/mappers.py',
          '"items": [to_contract(r) for r in entries],',
          '"items": [to_contract(r) for r in entries],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    rule: 'log',
    description: '"created_at" in rowToDomain/domainToRow (DATABASE direction) is NOT flagged (decoy)',
    // As duas funcoes de direcao BANCO usam "created_at" (campo do banco, snake_case) e nao devem
    // ser lidas como projecao de SAIDA — o nome delas nao COMECA com "to" (comeca no MEIO:
    // rowToDomain, domainToRow). Ja estao no molde, sem mutacao nenhuma; o chamariz so
    // precisa de um id esperado para o harness comparar. Se a ancora de nome regredir para "o
    // arquivo inteiro", `payload-camelcase` acusa "created_at" e este caso reprova com id NAO
    // declarado — e essa nao-acusacao vira verificacao, nao impressao.
    //
    // `logarChamariz` tambem e o nome ERRADO pela convencao de nomenclatura do mapeador (arquivo `/mapper/i`,
    // funcao exportada, nome fora dos dois moldes) — co-achado LEGITIMO de `mapper-naming`.
    also: ['mapper-naming'],
    mutate: (m) => m.writeOut(
      'api/src/mapper-decoy-database.ts',
      "export function signInChamariz() {\n  console.log('x');\n}\n",
    ),
  },
  // --- mapper-naming ---------------------------------------------------------------
  {
    rule: 'mapper-naming',
    description: 'exact finding reproduction — output function outside the convention exposes a sensitive field',
    // Exemplo motivador: "buildResponse"/"build_response" nao comeca com "to" nem tem
    // "To"/"_to_" no meio — nenhuma das tres regras de projecao a enxerga, entao "cpf" vaza com
    // 0 erro(s). Esta regra julga SO o nome: nao precisa de `sensitiveFields` nem de contrato
    // para acusar.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport function buildResponse(record) {\n  return { hash: record.hash, cpf: record.hash };\n}\n',
      py: '\n\ndef build_response(record):\n    return {"hash": record["hash"], "cpf": record["hash"]}\n',
    }),
  },
  {
    rule: 'mapper-naming',
    description: 'exported const/arrow outside the convention (TS/JS) — the second function export form',
    // `ARROW_CONST_EXPORT_PATTERN` precisa cobrir a MESMA classe de defeito na forma
    // `export const nome = (...) => ...`, nao so `export function`. So JS/TS: em Python toda
    // funcao e `def`, a forma unica ja coberta pelo caso acima.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport const serialize = (record) => ({ hash: record.hash });\n',
    }),
  },
  {
    rule: 'log',
    description: 'DECOY: well-named OUTPUT function (to<Something>) added to the mapper is NOT flagged',
    // `toRegistroExtra`/`to_registro_extra` bate a convencao de SAIDA (`isOutputName`) — precisa
    // continuar calada mesmo depois da regra nova entrar no catalogo. `console.log`/`print` da o id
    // esperado (`log`); se `mapper-naming` aparecesse aqui, seria NAO DECLARADO e o caso
    // reprovaria.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport function toRecordExtra(record) {\n  console.log("x");\n  return { hash: record.hash };\n}\n',
      py: '\n\ndef to_record_extra(record):\n    print("x")\n    return {"hash": record["hash"]}\n',
    }),
  },
  {
    rule: 'log',
    description: 'DECOY: DATABASE conversion function (<something>To<Something>) added to the mapper is NOT flagged',
    // O chamariz que a decisao do dono pede explicitamente: prova, por MUTACAO nova
    // (nao so pelo molde intocado), que a forma banco continua calada. "itemToRegistro"/
    // "item_to_registro" tem "To"/"_to_" no MEIO, nunca no inicio — `isDatabaseConversionName` aceita,
    // `mapper-naming` fica muda. Se `mapper-naming` aparecesse aqui, seria id NAO
    // DECLARADO e o caso reprovaria.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport function itemToRecord(linha) {\n  console.log("x");\n  return { hash: linha.hash };\n}\n',
      py: '\n\ndef item_to_record(linha):\n    print("x")\n    return {"hash": linha["hash"]}\n',
    }),
  },
  {
    rule: 'payload-camelcase',
    description: 'snake_case field in the output projection',
    // `hash` esta declarado no contrato e `criado_em` fica fora do camelCase, entao
    // `contract-projection` (que ignora chave nao-camelCase de proposito) segue calada: UM id.
    mutate: (m) => m.addIn('mappers', {
      js: '\nexport function toContractWrong(r) {\n  return { hash: r.hash, created_at: r.createdAt };\n}\n',
      py: '\n\ndef to_contract_wrong(r):\n    return {"hash": r.hash, "created_at": r.created_at}\n',
    }),
  },
  {
    rule: 'sensitive-output',
    description: 'sensitive field referenced in an OpenAPI response schema',
    // `module` e declarado na resposta de /health e NUNCA projetado nem logado — isola o lado do
    // CONTRATO. Com `status` (que o mapeador projeta) o caso acusaria tambem `sensitive-in-output`.
    // NAO usar `total`: `toCollection` projeta `total` de verdade (ancora de nome larga) — o
    // proprio campo que este caso precisa NUNCA estar projetado nao serve mais.
    mutate: (m) => m.manifest((x) => ({ ...x, sensitiveFields: ['module'] })),
  },
  {
    rule: 'sensitive-in-output',
    description: 'sensitive field referenced in a log call',
    // Isola o lado do CODIGO pela metade de LOG: campo que nao existe em schema nenhum, entao
    // `sensitive-output` nao tem o que acusar. Todo campo PROJETADO esta, por construcao, declarado
    // em resposta (`contract-projection` cobra isso), logo a projecao nunca isola esta regra.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['logSecret'] }));
      m.writeOut('api/src/vaza.ts',
        'export function register(logger, logSecret) {\n  logger.info("processed", logSecret);\n}\n');
    },
  },
  {
    rule: 'sensitive-in-output',
    description: '"warning" verb (unified list with secret-in-log) is not missed',
    // Uma lista estreita (logger|log com debug|info|warn|error) nao casaria "logging.warning(...)"
    // (nem o objeto "logging" nem o verbo "warning" estariam nela). `sensitive-in-output` usa
    // LOG_CALL_VERBOS, a mesma fonte de `secret-in-log`.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, sensitiveFields: ['logSecret'] }));
      m.writeOut('api/src/vaza-warning.ts',
        'export function register(logging, logSecret) {\n  logging.warning("processed", logSecret);\n}\n');
    },
  },
  {
    rule: 'exported-summary',
    description: '/summary lacks "total" in its 200 schema while /records "total" remains INTACT',
    // O `total` de `/registros` fica de pe justamente para provar que a regra le a ROTA, e nao o
    // arquivo: com um leitor de arquivo inteiro (`allResponseProperties`) este caso NAO acusaria
    // nada, e a regra teria aprovado por acidente. E essa a diferenca que o caso existe para
    // demonstrar. Liga `exportsSummary` no manifesto para nao depender do default do binding.
    mutate: (m) => {
      m.manifest((x) => ({ ...x, exportsSummary: true }));
      m.substitute(
        'contract/openapi.yaml',
        '                type: object\n                properties:\n                  total: { type: integer }',
        '                type: object',
      );
    },
  },
  {
    rule: 'input-allowlist',
    description: 'request body is spread directly into an entity',
    // A simetrica do `raw-output`. Espalhar (`{...req.body}`) e a forma que o molde NAO tem: la o
    // corpo atravessa `lerCorpo`, que rejeita campo desconhecido antes de virar entidade.
    mutate: (m) => m.writeOut(
      'api/src/bad-input.ts',
      'export const create = (req, repository) => repository.insert({ ...req.body });\n',
    ),
  },
  {
    rule: 'raw-output',
    description: 'returns the raw record in the response (MAPPER half, closed vocabulary)',
    // As duas metades do padrao, uma por sintaxe: `json(registro)` no lado Express, e o `return`
    // direto do nome do lado do BANCO no lado FastAPI, que nao passa por `.json(...)`.
    mutate: (m) => m.addIn('routes', {
      js: '\nexport const raw = (res, record) => res.json(record);\n',
      py: '\n\ndef raw(linha):\n    return linha\n',
    }),
  },
  {
    rule: 'raw-output',
    description: 'returns the raw "manifest" — the EDGE half, without an exemption list',
    // Trava um defeito medido de verdade: `res.json(<identificador>)` acusa SEMPRE, sem
    // vocabulario. Se a borda regredir para o vocabulario fechado antigo, "manifesto" volta a
    // escapar e este caso reprova.
    mutate: (m) => m.addIn('routes', {
      js: '\nexport const meta2 = (res, manifest) => res.json(manifest);\n',
    }),
  },
  {
    rule: 'raw-output',
    description: 'Python: return <dotted.access> INSIDE a routed handler (the FastAPI edge)',
    // Python nao tem `.json(...)`: a borda E o `return` do handler. So conta DENTRO de uma funcao
    // decorada com `@router.<verbo>` — e por isso o trecho inclui o decorator, nao so a linha.
    // `synchronized-contract` e co-achado LEGITIMO: a rota sintetica "/sonda-meta" nao existe no
    // openapi.yaml de proposito — o caso testa `raw-output`, nao `synchronized-contract`.
    also: ['synchronized-contract'],
    mutate: (m) => m.addIn('routes', {
      py: '\n\n@router.get("/probe-meta")\nasync def probe_meta():\n    return config.manifest\n',
    }),
  },
  {
    rule: 'raw-output',
    description: 'return "line" without a call in all THREE bindings — proves the MAPPER half did not regress',
    // O padrao do mapeador (`return (linha|linhas|row|rows)$`) nao muda. Trava isso nos
    // tres bindings, nao so no Python que o caso acima ja cobre.
    mutate: (m) => m.addIn('routes', {
      js: '\nexport function otherRoute(linha) {\n  return linha\n}\n',
      py: '\n\ndef other_route(linha):\n    return linha\n',
    }),
  },
  {
    rule: 'log',
    description: 'raw-output stays QUIET: literal object and projection call are not "raw" (log decoy)',
    // `res.json({ total })` e `res.json(toContract(x))` NUNCA casam o padrao da borda — o proximo
    // caractere depois do identificador nao e `)`. O chamariz (`console.log`, regra `log`) prova que
    // raw-output ficou muda: se a borda regredir para aceitar chamada/objeto, este id aparece
    // NAO DECLARADO e o caso reprova.
    mutate: (m) => m.addIn('routes', {
      js: '\nexport const decoyObject = (res) => {\n  console.log("x");\n'
        + '  res.json({ total: 1 });\n  return res.json(toContract({}));\n};\n',
    }),
  },
  {
    rule: 'log',
    description: 'Python: raw-output stays QUIET outside a routed handler and in a call (log decoy)',
    // `return router` (fim de `criar_rotas`, MESMO recuo do ultimo decorator) e `return
    // to_contract(...)` (chamada, nao identificador puro) sao os dois casos que uma formulacao por
    // "qualquer return" acusaria errado, e a formulacao por indentacao/decorator cala corretamente.
    // Ambos ja existem no molde conforme; o chamariz aqui e so para o caso ter um id esperado.
    mutate: (m) => m.addIn('routes', {
      py: '\n\ndef _outside_handler():\n    print("x")\n    return None\n',
    }),
  },

  // --- Operacao ------------------------------------------------------------------------------
  {
    rule: 'log',
    description: 'a rule written in a COMMENT does not become its own violation',
    // O caso existe para travar uma NAO-acusacao, e o harness nao sabe afirmar isso: ele exige
    // exatamente um id. O truque e o mesmo do caso do SDK legitimo em `adapters/` — o id esperado e
    // de OUTRA regra, e as formas proibidas entram em COMENTARIO ao lado.
    //
    // Se `importsOf`, `env-declared`, `env-outside-loader` ou `foreign-table` voltarem a ler
    // `conteudo` cru, cada uma emite um id NAO DECLARADO e este caso reprova na hora. Sem ele, a
    // nao-acusacao ficaria garantida so por inspecao — a lacuna que o harness tem por natureza.
    //
    // As DUAS ultimas linhas do bloco js e o `mapeador-doc` cobrem a familia Contrato, e cada um
    // trava um extrator diferente de `contract.mjs`: a rota comentada acusaria
    // `synchronized-contract` (extrator `codeRoutes`), e a projecao comentada acusaria
    // `contract-projection`, `payload-camelcase` e `sensitive-in-output` de uma vez (extrator
    // `projectionKeys`) — quatro ids NAO DECLARADOS na primeira volta ao texto cru.
    //
    // O defeito de verdade e o `console.log`/`print`, e e o unico achado que pode sair daqui.
    requiresNeighbor: true,
    mutate: (m) => {
      // `cpf` sensivel e o que arma a metade `sensitive-in-output` do chamariz do mapeador. Nao
      // acusa `sensitive-output`: campo nenhum chamado `cpf` aparece em schema do contrato do molde.
      m.manifest((x) => ({ ...x, sensitiveFields: ['cpf'] }));
      // Arquivo cujo nome casa /mapper/i e cujo conteudo e SO comentario: projecao nenhuma
      // existe aqui, e nada pode ser acusado. Vale nos tres bindings — `linhasCodigo` descarta a
      // linha `//` qualquer que seja a extensao.
      m.writeOut(
        'api/src/mapper-doc.ts',
        '// A projecao, escrita como documentacao. NENHUMA destas chaves e publicada:\n'
          + '//   export function toContractDoc(r) { return { cpf: r.cpf, created_at: r.createdAt }; }\n',
      );
      m.addIn('routes', {
        js: '\n// A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + "//   import { X } from '@<scope>/neighbor';\n"
          + "//   import { c } from '../../adapters/memory/index.js';\n"
          + "//   import pg from 'pg';\n"
          + '//   const s = process.env.MOLD_SEGREDO_DOC;\n'
          + "//   select nome from neighbor_metadata where id = ' + id\n"
          + "//   router.get('/rota-desativada', listarLegado);\n"
          + "export const shout = () => console.log('this is a defect');\n",
        py: '\n\n# A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + '#   from adapters.memory import create\n'
          + '#   import psycopg2\n'
          + '#   s = os.environ["MOLD_SEGREDO_DOC"]\n'
          + '#   select nome from neighbor_metadata where id = " + id\n'
          + '#   @router.get("/rota-desativada")\n'
          + 'def shout():\n    print("this is a defect")\n',
      });
    },
  },
  {
    rule: 'log',
    description: 'direct output instead of the logger',
    mutate: (m) => m.writeOut('core/domain/mau.ts', "export function f() { console.log('oi'); }\n"),
  },
  {
    rule: 'determinism',
    description: 'nondeterminism inside core/',
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export const agora = new Date();\n'),
  },
  {
    rule: 'public-route-authenticated',
    description: 'publicRoutes declares a route missing from the contract',
    // Entrada com typo NAO isenta nada: o autor acredita que abriu a rota, a cadeia continua
    // exigindo token, e o defeito so aparece em producao. A forma passa no JSON Schema
    // (`^(GET|POST|PATCH|PUT|DELETE) /`), entao `manifest-schema` cala e o caso acusa UM id.
    mutate: (m) => m.manifest((x) => ({
      ...x,
      publicRoutes: [...x.publicRoutes, 'GET /helth'],
    })),
  },
  {
    rule: 'public-route-authenticated',
    description: 'api/ stops reading publicRoutes from the manifest: a docstring that only EXPLAINS is insufficient (Python)',
    // A clausula de origem usa `codeText` (linhasCodigo, sem comentario/docstring), nao
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
    // nao ha `rel:numero` para casar, diferente do achado de `LITERAL_ROUTE` logo abaixo dela.
    contains: 'api/ never reads module.json:publicRoutes',
    times: 1,
    mutate: (m) => m.substitute(
      'api/src/middlewares.py',
      'public_set = {route.upper() for route in manifest["publicRoutes"]}',
      'public_set = {"HEALTH"}',
    ),
  },
  {
    rule: 'secure-cookie',
    description: 'session cookie is missing HttpOnly, Secure, or SameSite',
    // CONDICIONAL: o molde nao tem cookie (a auth dele e `Authorization: Bearer`), entao o caso
    // precisa criar a superficie para a regra ter o que cobrar.
    mutate: (m) => m.writeOut(
      'api/src/mau-cookie.ts',
      "export const signIn = (res, value) => res.cookie('session', value);\n",
    ),
  },
  {
    rule: 'token-in-storage',
    description: 'auth token is stored in localStorage',
    // Em `web/` de proposito: `localStorage` so existe no navegador. No molde Python, que nasce sem
    // `web/`, o caso estoura ENOENT e o runner marca SEM COBERTURA — correto, nao aprovacao.
    mutate: (m) => m.writeOut(
      'web/src/api-client/sessao.ts',
      "export const store = (value) => localStorage.setItem('token', value);\n",
    ),
  },
  {
    rule: 'gateway-credential',
    description: 'domain module declares an external credential',
    mutate: (m) => {
      m.manifest((x) => ({ ...x, requiredEnv: [...x.requiredEnv, 'MOLD_OPENAI_API_KEY'] }));
      // Sem isto o caso violava tambem `env-example` — ruido do fixture, nao da credencial.
      m.add('.env.example', 'MOLD_OPENAI_API_KEY=\n');
    },
  },

  // --- Escrita -------------------------------------------------------------------------------
  {
    rule: 'function-threshold',
    description: 'function exceeds 40 lines',
    mutate: (m) => m.writeOut('core/domain/mau.ts', `export function longa() {\n${'  let x = 1;\n'.repeat(45)}}\n`),
  },
  {
    rule: 'nesting-threshold',
    description: 'control nesting exceeds 3 levels',
    mutate: (m) => m.writeOut(
      'core/domain/mau.ts',
      'export function f(a) {\n  if (a) {\n    for (;;) {\n      while (a) {\n        if (a) { return 1; }\n      }\n    }\n  }\n  return 0;\n}\n',
    ),
  },
  {
    rule: 'parameters-threshold',
    description: 'function has more than 4 parameters',
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export function f(a, b, c, d, e) {\n  return [a, b, c, d, e];\n}\n'),
  },
  {
    rule: 'swallowed-exception',
    description: 'empty catch block',
    mutate: (m) => m.writeOut('core/domain/mau.ts', 'export function f(g) {\n  try { g(); } catch (e) {}\n}\n'),
  },
];
