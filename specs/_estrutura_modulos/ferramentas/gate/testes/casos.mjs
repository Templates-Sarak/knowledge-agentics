/**
 * casos.mjs — um caso por regra do catálogo. Lei dona: specs/arquitetura/04-regras.md §7.3
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
    // O `papel` e cobrado pelo JSON Schema E pelo vocabulario fechado do `manifesto`: duas leituras
    // do mesmo campo, e as duas mensagens ajudam. Declarado, nao silenciado.
    tambem: ['manifesto'],
    mutar: (m) => m.manifesto((x) => ({ ...x, papel: 'inventado' })),
  },
  {
    regra: 'estrutura',
    descricao: 'arquivo previsto na arvore ausente',
    // Era `contrato/openapi.yaml`, do qual a regra `contrato` passou a ser dona sozinha.
    // `config/textos.json` segue sendo item da arvore que so a `estrutura` cobra.
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
    // `ENTRADAS_PERMITIDAS` (estrutura.mjs) — sem depender de olhar o `Set` a olho. A regra
    // esperada aqui e OUTRA (schema-manifesto); se a tolerancia de qualquer uma das duas
    // regredir, `estrutura-estrita` acusa TAMBEM, um id que este caso nao declara em `tambem`, e
    // `executar.mjs` reprova com "id NAO declarado" — o mesmo chamariz de J.2/F.2a/F.2d.
    //
    // Sem pasta de verdade: o harness nao tem operacao de `mkdir` (so `escrever` grava ARQUIVO), e
    // a regra `estrutura-estrita` julga so o NOME de topo (`ctx.entradasRaiz`, por `readdirSync`),
    // nunca se e arquivo ou pasta — um arquivo chamado `relatorios` prova exatamente a mesma
    // linha de codigo que uma pasta `relatorios/` provaria.
    //
    // Conteudo medido (nao presumido): nenhum dos dois nomes tem extensao que bata `EXT_CODIGO`
    // (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.py`, contexto.mjs) — nenhum vira `ctx.codigo`, nenhuma regra
    // de conteudo (log, limiar-funcao, hardcode-url) os enxerga. `dist/` fica DE FORA deste
    // chamariz de proposito: `contexto.mjs:NAO_PERCORRER` ja o exclui de `ctx.entradasRaiz`
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
    descricao: 'rotaWeb declarada sem pagina real',
    // Cascata legitima: sem as paginas, as chaves de `config/textos.json` ficam sem leitor. So em
    // TS/JS — o molde Python nasce sem `web/`, e por isso `tambem` e teto, nao obrigacao.
    //
    // `testes-web` e o co-achado inverso, e so no PYTHON: ligar `rotaWeb` num molde que nasce sem
    // tela passa a exigir `tests/web/`, que ele nao tem. E defeito real do fixture mutado, nao
    // ruido — tela declarada sem teste e exatamente o que a regra persegue.
    tambem: ['config-morta', 'testes-web'],
    // Declara a rotaWeb no proprio caso: assim vale tambem para molde que nasce sem tela
    // (o binding Python), em vez de depender do default de um binding especifico.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, rotaWeb: '/molde' }));
      m.removerPasta('web/src/pages');
    },
  },
  {
    regra: 'artefato-declarado',
    descricao: 'geraArtefato false com as pastas de artefato presentes',
    // Direcao "proibe": o molde nasce com as tres pastas, entao basta desligar a declaracao.
    mutar: (m) => m.manifesto((x) => ({ ...x, geraArtefato: false })),
  },
  {
    regra: 'artefato-declarado',
    descricao: 'geraArtefato true com gerados/ ausente',
    // Direcao "exige" — e de proposito e a pasta `gerados/`, cuja presenca so e visivel pela ENTRADA
    // da raiz: o conteudo dela fica fora de `ctx.arquivos`, entao `temArquivoEm` nunca a acharia.
    // Liga a condicao no proprio manifesto, como o `web-declarado`, para o caso nao depender do
    // default do binding.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, geraArtefato: true }));
      m.removerPasta('gerados');
    },
  },
  {
    regra: 'testes',
    descricao: 'tests/contrato vazio',
    mutar: (m) => m.removerPasta('tests/contrato'),
  },

  // --- Isolamento ----------------------------------------------------------------------------
  {
    regra: 'import-lateral',
    descricao: 'importa package de outro modulo',
    mutar: (m) => m.escrever('core/dominio/mau.ts', "import { x } from '@escopo/vizinho';\nexport const y = x;\n"),
    exigeVizinho: true,
  },
  {
    regra: 'import-adapter',
    descricao: 'importa adapter em vez de receber injetado',
    mutar: (m) => m.escrever('core/dominio/mau.ts', "import { criar } from '../../adapters/memoria/index.js';\nexport const y = criar;\n"),
  },
  {
    regra: 'import-adapter',
    descricao: 'importa adapter pela forma pontilhada do Python ("adapters.memoria")',
    // `EXT_CODIGO` (contexto.mjs) e universal aos tres bindings, entao um `.py` cai em `ctx.codigo`
    // mesmo dentro do molde TS/JS — o mesmo por que o caso acima usa `.ts` nos tres. Sem este caso,
    // a forma pontilhada (`from adapters.memoria import x`) passava limpa pela regra inteira.
    mutar: (m) => m.escrever('core/dominio/mau_pontilhado.py', 'from adapters.memoria import criar\n\ny = criar\n'),
  },
  {
    regra: 'sdk-fornecedor',
    descricao: 'SDK de fornecedor dentro do modulo',
    mutar: (m) => m.escrever('core/dominio/mau.ts', "import pg from 'pg';\nexport const y = pg;\n"),
  },
  {
    regra: 'gateway-http',
    descricao: 'gateway falando com banco',
    // Cascata legitima: o arquivo novo em `core/gateways/` nao tem entrada em `consome` — nem teste
    // que o espelhe. Sao os outros dois lados do triangulo `gateway <-> consome <-> teste`.
    tambem: ['gateway-declarado', 'testes-gateway'],
    mutar: (m) => m.escrever('core/gateways/vizinho.ts', "export const q = 'select 1 from t';\nexport async function f(c) { return c.query(q); }\n"),
  },
  {
    regra: 'gateway-declarado',
    descricao: 'gateway sem entrada em consome',
    // Cascata legitima: o gateway novo tambem nasce sem teste que o espelhe.
    tambem: ['testes-gateway'],
    // O SQL em COMENTARIO trava a nao-acusacao de `gateway-http`: o barril da pasta documenta em
    // comentario o que o gateway nao pode fazer, e sobre o texto cru essa documentacao virava
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
    // Cascata legitima: declarar `consome` sem criar `core/gateways/vizinho.*` e defeito de verdade.
    tambem: ['gateway-declarado'],
    // O contrato declarado tem de EXISTIR na spec do vizinho (`/resumo` e obrigatoria em todo
    // modulo). Com `GET /x`, este caso violava tambem `consome-contrato` e deixava de exercitar
    // uma regra so — caso de teste com duas violacoes nao prova qual das duas esta viva.
    mutar: (m) => {
      m.manifesto((x) => ({
        ...x,
        consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'ciclo' }],
        envRequerido: [...x.envRequerido, 'VIZINHO_URL'],
      }));
      // A chave nova tem de chegar ao `.env.example`, senao o caso violava tambem `env-exemplo` —
      // ruido do fixture, nao defeito do grafo de `consome`.
      m.acrescentar('.env.example', 'VIZINHO_URL=\n');
    },
    exigeVizinho: true,
    vizinhoConsome: true,
  },
  {
    regra: 'consome-contrato',
    descricao: 'consome rota que o contrato do dono nao declara',
    // Cascata legitima: o gateway que acompanha a entrada em `consome` nasce sem teste.
    tambem: ['testes-gateway'],
    mutar: (m) => {
      // O gateway acompanha a entrada em `consome` (senao violaria tambem `gateway-declarado`),
      // e nada e acrescentado a `envRequerido` (senao violaria `env-exemplo`). Este caso acusa
      // UM id — e o unico jeito de o autoteste provar que e ESTA regra que esta viva.
      m.escrever('core/gateways/vizinho.ts', 'export async function f(u) { return fetch(u); }\n');
      m.manifesto((x) => ({
        ...x,
        consome: [{ modulo: 'vizinho', contrato: 'GET /rota-aposentada', porQue: 'deriva de contrato' }],
      }));
    },
    exigeVizinho: true,
  },

  {
    regra: 'adapter-isolado',
    descricao: 'adapter importando de modulos/',
    // O defeito que mata a extraibilidade em silencio: no dia em que o adapter conhece um modulo,
    // ele deixa de ser substituivel e o modulo deixa de sair da pasta — e ate aqui nada acusava.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nimport { algo } from '../../modulos/_template/core/dominio/index.js';\n",
      py: '\nfrom modulos._template.core.dominio import algo\n',
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
    // A inversao do vertice do diagrama: `adapters/ ──> packages/portas/` vira mao dupla, e a
    // interface canonica passa a depender de uma implementacao.
    mutar: (m) => m.acrescentarEm('portasRaiz', {
      js: "\nimport { criarRepositorio } from '../../adapters/memoria/index.js';\n",
      py: '\nfrom adapters.memoria import RepositorioEmMemoria\n',
    }),
  },
  {
    regra: 'portas-pura',
    descricao: 'SDK de fornecedor na interface canonica, com o MESMO SDK legitimo no adapter',
    // Duas afirmacoes num caso so, e a segunda e a que trava a regra contra si mesma:
    //
    //   (a) `pg` em `packages/portas/` REPROVA — `sdk-fornecedor` mantem o driver fora de cada
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
    // modulos por `readdirSync` + `modulo.json` e passa limpo no caso "molde conforme"; com um
    // IMPORT, acusa. Uma regra que procurasse a string `modulos` acusaria os dois.
    mutar: (m) => m.acrescentarEm('composicaoRaiz', {
      js: "\nimport { algo } from '../modulos/_template/core/dominio/index.js';\n",
      py: '\nfrom modulos._template.core.dominio import algo\n',
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
    // O `.css` nao entra em `ctx.codigo` (filtrado por extensao de linguagem), entao antes desta
    // varredura ele nunca chegava a regra — e `color: #ff0000` em CSS e `propriedade: valor`, a
    // forma exata que o recorte persegue. Ficava limpo onde, em `ui.modo: "kit"`, a cor mais vive.
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
    mutar: (m) => m.manifesto((x) => ({ ...x, dados: { ...x.dados, schema: 'public' } })),
  },
  {
    regra: 'tabela-prefixo',
    descricao: 'tabela declarada sem o prefixo do modulo',
    // Cascata legitima: a tabela nova nao existe no SQL do modulo.
    //
    // Este `tambem` era `['rls']`, e a troca REGISTRA a mudanca de dono: a tabela ausente do SQL
    // caia no `rls` com a mensagem errada — "sem ENABLE ROW LEVEL SECURITY" —, quando o problema
    // e que ela nao existe. Agora `rls` so pergunta de tabela que o SQL cria, e o achado tem a
    // mensagem certa.
    tambem: ['tabela-declarada'],
    mutar: (m) => m.manifesto((x) => ({ ...x, dados: { ...x.dados, tabelas: [...x.dados.tabelas, 'clientes'] } })),
  },
  {
    regra: 'tabela-declarada',
    descricao: 'tabela declarada em dados.tabelas e sem CREATE TABLE no SQL',
    // O achado que a `artefato-declarado` pressupunha existir quando deixou `database/` de fora
    // ("quem declara banco e dados.tabelas") e que nao existia.
    //
    // Com o PREFIXO certo, senao `tabela-prefixo` acusaria junto. E `rls` fica CALADA de proposito:
    // e a prova de que a troca de dono funcionou — antes ela acusava esta mesma tabela dizendo
    // "sem ENABLE ROW LEVEL SECURITY", que e a mensagem errada para uma tabela que nao existe.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      dados: { ...x.dados, tabelas: [...x.dados.tabelas, '<modulo>_inexistente'] },
    })),
  },
  {
    regra: 'tabela-alheia',
    descricao: 'referencia tabela de outro modulo',
    mutar: (m) => m.escrever('core/dominio/mau.ts', "export const q = 'select * from vizinho_metadados';\n"),
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
    // e `verificarCaso` compara ids. Antes deste caso a regra so aparecia como `tambem` alheio, e
    // `tambem` e TETO: se ela parasse de acusar, nada falharia.
    //
    // O ALTER sai dos DOIS arquivos: a regra le TODO o SQL do modulo junto (`ctx.sql`), entao
    // apaga-lo so do `schema.sql` deixava a copia da migration responder por ele e a regra
    // continuava — com razao — calada. Um so lugar nao e o defeito; o defeito e a tabela nao ter
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
    mutar: (m) => m.escrever('config/dominio.json', '{ "statusValidos": [\n'),
  },
  {
    regra: 'config-morta',
    descricao: 'chave de config declarada e nunca lida',
    // `dominio` tem schema LIVRE por definicao, entao a chave nova nao trombra com `schema-config`.
    mutar: (m) => m.config('dominio', (x) => ({ ...x, chaveNuncaLida: 'sem leitor' })),
  },
  {
    regra: 'env-fora-do-carregador',
    descricao: 'env lida fora do carregador de config',
    // `process.env` NU: sem chave `<MODULO>_*` (senao acusaria `env-declarado`) e sem default
    // literal (senao acusaria `fallback-silencioso`). Isola a regra, que ate aqui so vivia como
    // `tambem` de casos alheios.
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export const ambiente = process.env;\n'),
  },
  {
    regra: 'gitignore-segredo',
    descricao: '.gitignore do projeto sem .env nem modulos/*/.env',
    // `../../` sobe para a raiz do PROJETO, como nos casos das outras regras de projeto. O ignore
    // continua existindo e valido — so deixou de cobrir o segredo, que e o defeito sob teste.
    mutar: (m) => m.escrever('../../.gitignore', 'node_modules/\ndist/\n'),
  },
  {
    regra: 'segredo-em-publico',
    descricao: 'credencial declarada em env de prefixo publico (vai para o bundle)',
    // `papel: "gateway"` cala o `gateway-credencial`, que isenta o gateway porque credencial e o
    // oficio dele — e assim o caso acusa UM id. A escolha tambem diz o que a regra afirma: nem o
    // gateway, dono da credencial, pode publica-la no bundle do front.
    mutar: (m) => {
      m.manifesto((x) => ({
        ...x,
        papel: 'gateway',
        envRequerido: [...x.envRequerido, 'VITE_MOLDE_API_KEY'],
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
    regra: 'lint-derivado',
    descricao: 'config do linter editada a mao, divergindo da fonte dos limiares',
    // A regra compara BYTE A BYTE com o que o gerador produziria, entao qualquer edicao manual e o
    // defeito — nao so a troca de um numero. Alvo logico + trecho por sintaxe: o arquivo e
    // `eslint.config.js` em TS/JS e `.ruff.toml` no Python, e o comentario muda de marcador junto.
    mutar: (m) => m.acrescentarEm('lintRaiz', {
      js: '\n// limiar ajustado a mao, fora de ferramentas/gate/limiares.mjs\n',
      py: '\n# limiar ajustado a mao, fora de ferramentas/gate/limiares.mjs\n',
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
    descricao: 'rotaWeb declarada e tests/web/ apagada',
    // Nao mexe no manifesto: o molde de TS/JS ja nasce com `rotaWeb`, e usar a declaracao REAL e o
    // que faz o caso provar a condicional em vez de fabrica-la. `removerPastaEm` (e nao
    // `removerPasta`) porque no Python o alvo nao existe: la o caso vira SEM COBERTURA declarada, e
    // nao um "nenhum achado" que culparia a regra por um molde que nasce sem tela.
    mutar: (m) => m.removerPastaEm('pastaTestesWeb'),
  },
  {
    regra: 'testes-gateway',
    descricao: 'gateway real e declarado, e sem teste que o espelhe',
    // O terceiro lado do triangulo. Os outros dois ficam SATISFEITOS de proposito — o arquivo tem
    // entrada em `consome` (cala `gateway-declarado`) e a rota existe na spec do vizinho (cala
    // `consome-contrato`) —, entao o caso acusa UM id: a dependencia esta declarada, conforme, e
    // sem uma linha de teste que a exercite. E exatamente o buraco que a regra fecha.
    //
    // Sem SQL nem URL literal no corpo, para `gateway-http` e `hardcode-url` tambem calarem.
    mutar: (m) => {
      m.escrever('core/gateways/vizinho.ts', 'export async function obter(u) { return fetch(u); }\n');
      m.manifesto((x) => ({
        ...x,
        consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'prova do triangulo' }],
      }));
    },
    exigeVizinho: true,
  },
  {
    regra: 'manifesto-raiz',
    descricao: 'projeto sem projeto.json na raiz',
    // A raiz e a unidade menos verificada e a que concentra o risco: o modulo e proibido de tocar
    // banco, importar adapter e ler env fora do carregador, entao conexao, query e credencial
    // acontecem todas la. Sem manifesto, nada disso e declarado.
    //
    // `env-raiz-declarado` cala de proposito quando o manifesto nao e legivel — um defeito, uma
    // mensagem —, entao este caso acusa UM id.
    mutar: (m) => m.remover('../../projeto.json'),
  },
  {
    regra: 'manifesto-raiz',
    descricao: 'campo nao previsto no manifesto da raiz',
    // A trava contra o vicio desta base, em forma de teste: campo novo em `projeto.json` REPROVA
    // ate que exista a regra que o cobra. `ui`, `exportaResumo` e `geraArtefato` ficaram anos
    // declarados sem verificador porque nada impedia o campo de entrar sozinho.
    mutar: (m) => m.manifestoRaiz((x) => ({ ...x, portas: ['repositorio'] })),
  },
  {
    regra: 'env-raiz-declarado',
    descricao: 'env da raiz usada na fiacao e ausente de projeto.json',
    // O buraco que motivou o manifesto: ate aqui o `.env.example` da raiz saia so dos manifestos de
    // MODULO, entao o `JWT_SECRET` do `resolverAuth()` nascia orfao — invisivel a `env-declarado` e
    // a `env-exemplo`, que sao regras por modulo. O segredo mais sensivel era o unico sem dono.
    //
    // Alvo logico + trecho por sintaxe: a fiacao le env de forma diferente em cada binding.
    mutar: (m) => m.acrescentarEm('composicaoRaiz', {
      js: '\nexport const segredoJwt = process.env.RAIZ_JWT_SECRET;\n',
      py: '\n\nSEGREDO_JWT = os.environ["RAIZ_JWT_SECRET"]\n',
    }),
  },
  {
    regra: 'env-raiz-declarado',
    descricao: 'env declarada em projeto.json e sem leitor na fiacao',
    // O sentido inverso, e ele nao e simetria decorativa: a chave declarada entra no `.env.example`
    // e passa a EXIGIR do operador um valor que nada le. Mutacao agnostica de binding — so JSON.
    mutar: (m) => m.manifestoRaiz((x) => ({ ...x, envRequerido: [...x.envRequerido, 'RAIZ_SEM_LEITOR'] })),
  },
  {
    regra: 'sql-concatenado',
    descricao: 'query montada por concatenacao no adapter',
    // A fiacao e onde a query NASCE: o modulo nao pode ter driver (`sdk-fornecedor`) nem importar
    // adapter (`import-adapter`), entao quem fala com o banco e este arquivo — e ate a I.1 nenhuma
    // regra o enxergava. A metade que sobrava (SQL montado DENTRO do modulo) e da `sql-no-modulo`,
    // logo abaixo: a MESMA linha, na outra colecao, e nenhum arquivo cai nas duas.
    mutar: (m) => m.acrescentarEm('adapterRaiz', {
      js: "\nexport const buscar = (db, id) => db.query('select * from registros where hash = ' + id);\n",
      py: '\n\ndef buscar(db, id):\n    return db.execute("select * from registros where hash = " + id)\n',
    }),
  },
  {
    regra: 'sql-no-modulo',
    descricao: 'SQL montado dentro do modulo e entregue a uma porta',
    // O vetor residual da B.3, medido: a superficie canonica de `packages/portas/` e tipada por
    // OPERACAO e nao aceita comando, mas o `core/portas/` do MODULO e escrito pelo autor dele e
    // ninguem compara as duas formas. Com um `executarConsulta(sql)` declarado la, a concatenacao
    // fica no modulo e a execucao na raiz — e a `sql-concatenado` ve o `.query(sql)` do adapter sem
    // ver como a string nasceu.
    //
    // `alguma_coisa` nao e tabela de modulo nenhum de proposito: com o nome de um vizinho o caso
    // acusaria tambem `tabela-alheia` e deixaria de provar qual regra esta viva.
    mutar: (m) => m.escrever(
      'core/dominio/consulta-crua.ts',
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
    // `env-raiz-declarado` (I.1), e deixaria de provar qual das duas esta viva. E a declaracao
    // mostra que as duas nao brigam — `env-raiz-declarado` cobra a chave nao declarada e NAO proibe
    // a leitura; ler o ambiente e o oficio da composicao. O que esta regra proibe e o DEFAULT.
    mutar: (m) => {
      m.manifestoRaiz((x) => ({ ...x, envRequerido: [...x.envRequerido, 'RAIZ_PORTA'] }));
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
    descricao: 'credencial declarada em projeto.json indo para o log, ao lado de chave inocente',
    // O sinal vem de onde JA existe declaracao: `projeto.json:envRequerido` cruzado com o mesmo
    // vocabulario fechado de sufixo de credencial de `gateway-credencial`. A raiz nao tem
    // `camposSensiveis` — `projeto.schema.json` declara um campo so, com
    // `additionalProperties: false` fechando a porta de proposito.
    //
    // As DUAS chaves entram na mesma linha de log: `RAIZ_JWT_SECRET` casa o sufixo de credencial e
    // e acusada; `RAIZ_API_BASE_URL` nao casa e passa. Declarar as duas tambem cala
    // `env-raiz-declarado`, nos dois sentidos — declaradas e usadas.
    mutar: (m) => {
      m.manifestoRaiz((x) => ({
        ...x,
        envRequerido: [...x.envRequerido, 'RAIZ_JWT_SECRET', 'RAIZ_API_BASE_URL'],
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
    descricao: 'porta CONFIGURADA em config/portas.json e ausente do manifesto',
    // A primeira das duas brechas que o `$comentario` do schema afirmava fechar e nao fechava:
    // `storage` esta no vocabulario do schema, entao `schema-config` passa. O caso acusa UM id.
    mutar: (m) => m.config('portas', (x) => ({ ...x, storage: 'disco' })),
  },
  {
    regra: 'porta-declarada',
    descricao: 'porta DECLARADA no manifesto e ausente de config/portas.json',
    // A segunda brecha: o schema nao tem `required`, entao porta declarada e nunca configurada
    // passava. `storage` esta no enum do modulo.schema.json, entao `schema-manifesto` tambem cala.
    // Esta e a direcao que DERRUBA O BOOT — `resolverDependencias` nao acha o provedor e lanca.
    mutar: (m) => m.manifesto((x) => ({ ...x, portas: [...x.portas, 'storage'] })),
  },
  {
    regra: 'navegacao-declarada',
    descricao: 'navegacao declarada com rotaWeb nula',
    // Declara os DOIS lados no proprio caso, como o `web-declarado` faz: assim vale nos tres
    // bindings, e nao depende de o molde daquele binding nascer com tela (o Python nao nasce).
    //
    // `web-declarado` e `testes-web` tem a mesma guarda `rotaWeb == null` e ficam caladas — e e
    // justamente o que torna este achado necessario: com a tela zerada, ninguem mais notaria a
    // entrada de menu apontando para o nada.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      rotaWeb: null,
      navegacao: { label: 'Molde', icone: 'Box', ordem: 100 },
    })),
  },
  {
    regra: 'permissao-literal',
    descricao: 'permissao escrita como literal no argumento de exigirPermissao',
    // Nao registra rota: um `router.get` novo violaria tambem `contrato-sincronizado`, e o caso
    // deixaria de provar qual regra esta viva. So a chamada, com o literal que a regra persegue.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: "\nexport const exigirLiteral = (req) => exigirPermissao('molde:ler')(req);\n",
      py: '\n\ndef exigir_literal(request):\n    exigir_permissao(request, "molde:ler")\n',
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
      'core/dominio/mau.ts',
      "export const base = 'https://api.exemplo.com';\n"
        + "export const consulta = 'select hash from alguma_coisa where titulo = $1';\n",
    ),
  },
  {
    regra: 'hardcode-numero',
    descricao: 'literal numerico de infraestrutura no codigo',
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export const timeoutMs = 30000;\n'),
  },
  {
    regra: 'fallback-silencioso',
    descricao: 'default silencioso de env',
    // Cascata legitima: a mesma linha embute URL literal e le env fora do carregador.
    tambem: ['hardcode-url', 'env-fora-do-carregador'],
    mutar: (m) => m.escrever('core/dominio/mau.ts', "export const u = process.env['X'] ?? 'http://localhost';\n"),
  },
  {
    regra: 'env-declarado',
    descricao: 'env usada e nao declarada no manifesto',
    // Cascata legitima: ler env dentro de `core/` e, por definicao, fora do carregador.
    tambem: ['env-fora-do-carregador'],
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export const s = process.env.MOLDE_SEGREDO_NOVO;\n'),
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
    // razao, as tres entradas de `rotasPublicas` deixam de apontar para rota que existe — defeito
    // real, e nao ruido: uma spec sem `/health` faz "GET /health" isentar coisa nenhuma.
    tambem: ['contrato-sincronizado', 'rota-publica-autenticada'],
    // O `servers:` e as `properties:` entram na spec minima de proposito: sem eles o caso acusaria
    // tambem `rota-nomenclatura` e `projecao-contrato`, e deixaria de provar a ausencia das rotas
    // OBRIGATORIAS, que e o dele. As propriedades sao TODAS as que os mapeadores do molde projetam
    // (paraContrato, paraMeta, paraColecao — desde o N.2, os tres sao vistos, nao so o primeiro).
    mutar: (m) => m.escrever(
      'contrato/openapi.yaml',
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
        '                  nome: { type: string }',
        '                  versao: { type: string }',
        '                  papel: { type: string }',
        '                  rotaBase: { type: string }',
        '                  rotaWeb: { type: string }',
        '                  navegacao: { type: object }',
        '                  exportaResumo: { type: boolean }',
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
      'contrato/openapi.yaml',
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
    // Substitui o caso "description antes de url", que deixou de ser ilegivel quando o leitor de
    // `servers:` passou a aceitar essa forma. O proposito e o mesmo, e continua necessario: provar
    // que a deteccao NAO e "flow style" e que a mensagem nomeia a secao certa. Este YAML e bloco
    // valido, indentado com 4 — e o leitor exige recuo 2 na rota e 4 no metodo.
    mutar: (m) => m.escrever('contrato/openapi.yaml', [
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
    mutar: (m) => m.substituir('contrato/openapi.yaml', 'url: /api/v1/<modulo>', 'url: /api/v1/outro-lugar'),
  },
  {
    regra: 'rota-nomenclatura',
    descricao: 'parametro de caminho fora de camelCase',
    // `{Hash}` e `:hash` normalizam para o mesmo `{}`, entao `contrato-sincronizado` continua
    // calado — este caso acusa UM id, e prova que a checagem de segmento esta viva.
    mutar: (m) => m.substituir('contrato/openapi.yaml', '/registros/{hash}:', '/registros/{Hash}:'),
  },
  {
    regra: 'rota-nomenclatura',
    descricao: 'verbo em portugues como segmento de path',
    // A rota entra na spec E no codigo, senao o caso acusaria tambem `contrato-sincronizado`.
    mutar: (m) => {
      m.substituir('contrato/openapi.yaml', '  /health:', [
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
    // deixava esta regra provada so em TypeScript.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: "\nrouter.get('/nao-declarada', () => undefined);\n",
      py: '\n\n@router.get("/nao-declarada")\ndef nao_declarada():\n    return {}\n',
    }),
  },
  {
    regra: 'contrato-sincronizado',
    descricao: 'rota no contrato e ausente do codigo',
    mutar: (m) => m.substituir(
      'contrato/openapi.yaml',
      'paths:\n',
      'paths:\n  /so-na-spec:\n    get:\n      summary: fantasma\n      responses:\n        200:\n          description: ok\n',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'PRIMEIRA chave da projecao nao declarada (molde Python)',
    // Escrito para o binding Python de proposito: e o unico em que a primeira chave nao tinha um
    // `{` sobrando antes dela, e por isso era invisivel ao extrator antigo. Com o extrator antigo
    // este caso NAO acusa nada — e a diferenca entre consertar de verdade e mover o sintoma.
    mutar: (m) => m.substituir(
      'api/src/mapeadores.py',
      'mascarado.\n    """\n    return {\n        "hash": registro.hash,',
      'mascarado.\n    """\n    return {\n        "campoFantasma": registro.hash,',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'projecao em arrow de UMA linha, com campo nao declarado',
    // A forma que o extrator antigo nao sabia terminar: fecha na mesma linha, sem `\n` antes do
    // `}`. Prova que o balanceamento continua LENDO a projecao — o conserto da sobre-captura nao
    // pode ter virado cegueira para a forma que a causava.
    mutar: (m) => m.escrever(
      'api/src/mapeador-arrow.ts',
      'export const paraContratoArrow = (r) => ({ hash: r.hash, campoArrow: r.extra });\n',
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'projecao publica campo que nenhum schema de resposta declara',
    // Arquivo novo em `api/src/` cujo nome casa com /mapeador/i: vale nos tres bindings, sem
    // depender do caminho do mapeador de cada um (`mapeadores/index.ts` x `mapeadores.py`).
    // `hash` esta declarado em `Registro`; `campoFantasma` nao esta em resposta nenhuma.
    //
    // As duas ultimas linhas travam uma NAO-acusacao, pela tecnica do caso do `log`: `naoPublica`
    // nao e projecao nenhuma, e `created_at` NAO pode ser acusado. Se o extrator voltar a aceitar
    // REFERENCIA a `paraContrato*` como sitio de projecao, o `map(...)` engata na abertura da funcao
    // seguinte, `payload-camelcase` acusa `created_at`, e o id extra reprova este caso na hora.
    mutar: (m) => m.escrever(
      'api/src/mapeador-extra.ts',
      'export function paraContratoExtra(r) {\n  return { hash: r.hash, campoFantasma: r.fantasma };\n}\n'
        + 'export const paraContratoLista = (rs) => rs.map(paraContratoExtra);\n'
        + 'export function naoPublica(r) {\n  return { created_at: r.criadoEm };\n}\n',
    ),
  },
  // --- N.2: as 18 formas do extrator de projecao (plan-2.md) ----------------------------------
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 1 — tipo de retorno inline desvia o extrator antigo',
    // `): { hash: string; campoForma1: string } {` — sob o extrator antigo a primeira `{` depois
    // do nome era a do TIPO, nao a do corpo. O separador `;` do tipo (nao `,`) e por isso que so
    // "hash" as vezes escapava por acidente e "campoForma1" nunca era visto (medido no plano, com
    // "cpf"). O extrator novo nunca olha a assinatura: procura `return {` direto.
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma1.ts',
      'export function paraContratoForma1(r: { hash: string }): { hash: string; campoForma1: string } {\n'
        + "  return { hash: r.hash, campoForma1: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 2 — um parametro com tipo inline',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma2.ts',
      'export function paraContratoForma2(o: { a: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, campoForma2: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 3 — dois parametros com tipo inline',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma3.ts',
      'export function paraContratoForma3(o: { a: string }, p: { b: string }): Record<string, unknown> {\n'
        + "  return { a: o.a, b: p.b, campoForma3: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 4 — generico com objeto (<T extends { id: string }>)',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma4.ts',
      'export function paraContratoForma4<T extends { id: string }>(o: T): Record<string, unknown> {\n'
        + "  return { id: o.id, campoForma4: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 5 — Array<{ … }> no retorno',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma5.ts',
      'export function paraContratoForma5(r: { hash: string }): Array<{ hash: string }> {\n'
        + "  return { hash: r.hash, campoForma5: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 6 — Promise<{ … }> no retorno',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma6.ts',
      'export async function paraContratoForma6(r: { hash: string }): Promise<{ hash: string }> {\n'
        + "  return { hash: r.hash, campoForma6: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 7 — default de parametro "= {}", nos tres bindings',
    mutar: (m) => m.acrescentarEm('mapeadores', {
      js: "\nexport function paraContratoForma7(opcoes: Record<string, unknown> = {}): Record<string, unknown> {\n"
        + "  return { campoForma7: 'x' };\n}\n",
      py: "\n\ndef para_contrato_forma7(opcoes=None):\n    return {\"campoForma7\": \"x\"}\n",
    }),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 8 — tipo inline COM default',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma8.ts',
      "export function paraContratoForma8(o: { a: string } = { a: 'x' }): Record<string, unknown> {\n"
        + "  return { campoForma8: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 9 — corpo canonico "): Record<string, unknown> {" nao pode regredir',
    // E a forma que o proprio molde usa (paraContrato) — este caso trava que uma violacao SOB essa
    // forma continua sendo pega, nao so que a forma boa passa.
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma9.ts',
      "export function paraContratoForma9(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, campoForma9: 'x' };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 11 — objeto aninhado dentro da projecao nao pode regredir',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma11.ts',
      "export function paraContratoForma11(r: { hash: string }): Record<string, unknown> {\n"
        + "  return { hash: r.hash, aninhado: { campoForma11: 'x' } };\n}\n",
    ),
  },
  {
    regra: 'projecao-contrato',
    descricao: 'N.2 forma 12 — dois "return" na mesma funcao rendem DUAS regioes',
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma12.ts',
      "export function paraContratoForma12(r: { hash: string }, resumo: boolean): Record<string, unknown> {\n"
        + "  if (resumo) {\n    return { campoForma12Resumo: 'x' };\n  }\n"
        + "  return { hash: r.hash, campoForma12Detalhe: 'x' };\n}\n",
    ),
  },
  {
    regra: 'log',
    descricao: 'N.2 forma 14 — "const interno = { … }" dentro da funcao NAO e projecao (chamariz)',
    // O objeto intermediario nao esta em posicao de `return` nem de `=>`, entao nunca casa
    // PADRAO_RETORNO_OBJETO — nenhuma guarda nova precisou existir para isso. `console.log` arma o
    // chamariz: se `campoInterno` fosse (erradamente) visto como projetado, apareceria um id extra
    // (`projecao-contrato`) NAO DECLARADO, e o caso reprovaria.
    mutar: (m) => m.escrever(
      'api/src/mapeador-forma14.ts',
      "export function paraContratoForma14(r: { hash: string }): Record<string, unknown> {\n"
        + "  const interno = { campoInterno: 'nunca publicado' };\n"
        + "  console.log(interno);\n"
        + "  return { hash: r.hash };\n}\n",
    ),
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'N.2 item 1(a) — "cpf" vazado em paraMeta, a rota SEM TOKEN (regressao que a N.1 fechou)',
    // paraMeta serve /meta, rota sem token — o mesmo vazamento que a N.1 fechou. Sob a ancora de
    // nome ESTREITA (so paraContrato*) a funcao inteira era invisivel ao extrator, e um campo
    // sensivel acrescentado aqui nunca seria pego por regra nenhuma. Tenta os tres caminhos; so o
    // do binding em teste existe, os outros dois viram ENOENT e sao ignorados aqui mesmo.
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, camposSensiveis: ['cpf'] }));
      for (const caminho of ['api/src/mapeadores/index.ts', 'api/src/mapeadores/index.js']) {
        try {
          m.substituir(caminho, 'exportaResumo: manifesto.exportaResumo,', "exportaResumo: manifesto.exportaResumo,\n    cpf: 'x',");
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substituir(
          'api/src/mapeadores.py',
          '"exportaResumo": manifesto["exportaResumo"],',
          '"exportaResumo": manifesto["exportaResumo"],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'N.2 item 1(a) — "cpf" vazado em paraColecao (pre-existente, nunca medido antes)',
    tambem: ['projecao-contrato'],
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, camposSensiveis: ['cpf'] }));
      for (const caminho of ['api/src/mapeadores/index.ts', 'api/src/mapeadores/index.js']) {
        try {
          m.substituir(
            caminho,
            'return { itens: registros.map(paraContrato), pagina, tamanho, total };',
            "return { itens: registros.map(paraContrato), pagina, tamanho, total, cpf: 'x' };",
          );
        } catch { /* binding errado para este caminho — ENOENT esperado */ }
      }
      try {
        m.substituir(
          'api/src/mapeadores.py',
          '"itens": [para_contrato(r) for r in registros],',
          '"itens": [para_contrato(r) for r in registros],\n        "cpf": "x",',
        );
      } catch { /* binding errado — ENOENT esperado */ }
    },
  },
  {
    regra: 'log',
    descricao: 'N.2 — "created_at" em linhaParaDominio/dominioParaLinha (direcao BANCO) NAO acusa (chamariz)',
    // As duas funcoes de direcao BANCO usam "created_at" (campo do banco, snake_case) e nao devem
    // ser lidas como projecao de SAIDA — o nome delas nao COMECA com "para" (comeca no MEIO:
    // linhaParaDominio, dominioParaLinha). Ja estao no molde, sem mutacao nenhuma; o chamariz so
    // precisa de um id esperado para o harness comparar. Se a ancora de nome regredir para "o
    // arquivo inteiro", `payload-camelcase` acusa "created_at" e este caso reprova com id NAO
    // declarado — e essa nao-acusacao vira verificacao, nao impressao.
    mutar: (m) => m.escrever(
      'api/src/mapeador-chamariz-banco.ts',
      "export function logarChamariz() {\n  console.log('x');\n}\n",
    ),
  },
  {
    regra: 'payload-camelcase',
    descricao: 'campo snake_case na projecao de saida',
    // `hash` esta declarado no contrato e `criado_em` fica fora do camelCase, entao
    // `projecao-contrato` (que ignora chave nao-camelCase de proposito) segue calada: UM id.
    mutar: (m) => m.acrescentarEm('mapeadores', {
      js: '\nexport function paraContratoErrado(r) {\n  return { hash: r.hash, criado_em: r.criadoEm };\n}\n',
      py: '\n\ndef para_contrato_errado(r):\n    return {"hash": r.hash, "criado_em": r.criado_em}\n',
    }),
  },
  {
    regra: 'saida-sensivel',
    descricao: 'campo sensivel citado em schema de resposta do OpenAPI',
    // `modulo` e declarado na resposta de /health e NUNCA projetado nem logado — isola o lado do
    // CONTRATO. Com `status` (que o mapeador projeta) o caso acusaria tambem `sensivel-em-saida`.
    // NAO usar `total`: desde o N.2 (ancora de nome larga), `paraColecao` projeta `total` de
    // verdade — o proprio campo que este caso precisa NUNCA estar projetado deixou de servir,
    // porque o extrator novo enxerga exatamente o que antes era ponto cego.
    mutar: (m) => m.manifesto((x) => ({ ...x, camposSensiveis: ['modulo'] })),
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'campo sensivel citado em chamada de log',
    // Isola o lado do CODIGO pela metade de LOG: campo que nao existe em schema nenhum, entao
    // `saida-sensivel` nao tem o que acusar. Todo campo PROJETADO esta, por construcao, declarado
    // em resposta (`projecao-contrato` cobra isso), logo a projecao nunca isola esta regra.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, camposSensiveis: ['segredoDeLog'] }));
      m.escrever('api/src/vaza.ts',
        'export function registrar(logger, segredoDeLog) {\n  logger.info("processado", segredoDeLog);\n}\n');
    },
  },
  {
    regra: 'resumo-exportado',
    descricao: '/resumo sem "total" no schema 200, com o "total" de /registros INTACTO',
    // O `total` de `/registros` fica de pe justamente para provar que a regra le a ROTA, e nao o
    // arquivo: com um leitor de arquivo inteiro (`propriedadesDeResposta`) este caso NAO acusaria
    // nada, e a regra teria aprovado por acidente. E essa a diferenca que o caso existe para
    // demonstrar. Liga `exportaResumo` no manifesto para nao depender do default do binding.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, exportaResumo: true }));
      m.substituir(
        'contrato/openapi.yaml',
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
    descricao: 'devolve "manifesto" cru — a metade BORDA, sem lista de isentos (plan-2.md N.1)',
    // Trava o defeito que a N.1 mediu de verdade: `res.json(<identificador>)` acusa SEMPRE, sem
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
    // O padrao do mapeador (`return (linha|linhas|row|rows)$`) nao muda com a N.1. Trava isso nos
    // tres bindings, nao so no Python que o caso acima ja cobre.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport function outraRota(linha) {\n  return linha\n}\n',
      py: '\n\ndef outra_rota(linha):\n    return linha\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'saida-crua CALA: objeto literal e chamada de projecao nao sao "cru" (chamariz de log)',
    // `res.json({ total })` e `res.json(paraContrato(x))` NUNCA casam o padrao da borda — o proximo
    // caractere depois do identificador nao e `)`. O chamariz (`console.log`, regra `log`) prova que
    // saida-crua ficou muda: se a borda regredir para aceitar chamada/objeto, este id aparece
    // NAO DECLARADO e o caso reprova.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport const chamarizObjeto = (res) => {\n  console.log("x");\n'
        + '  res.json({ total: 1 });\n  return res.json(paraContrato({}));\n};\n',
    }),
  },
  {
    regra: 'log',
    descricao: 'Python: saida-crua CALA fora de handler roteado e em chamada (chamariz de log)',
    // `return router` (fim de `criar_rotas`, MESMO recuo do ultimo decorator) e `return
    // para_contrato(...)` (chamada, nao identificador puro) sao os dois casos que a formulacao por
    // "qualquer return" acusava errado e a formulacao por indentacao/decorator cala corretamente.
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
    // exatamente um id. O truque e o mesmo da I.2 (o SDK legitimo em `adapters/`) — o id esperado e
    // de OUTRA regra, e as formas proibidas entram em COMENTARIO ao lado.
    //
    // Se `importesDe`, `env-declarado`, `env-fora-do-carregador` ou `tabela-alheia` voltarem a ler
    // `conteudo` cru, cada uma emite um id NAO DECLARADO e este caso reprova na hora. Sem ele, a
    // nao-acusacao ficaria garantida so por inspecao — a lacuna do harness registrada no Bloco H.
    //
    // As DUAS ultimas linhas do bloco js e o `mapeador-doc` cobrem a familia Contrato, e cada um
    // trava um extrator diferente de `contrato.mjs`: a rota comentada acusaria
    // `contrato-sincronizado` (extrator `rotasDoCodigo`), e a projecao comentada acusaria
    // `projecao-contrato`, `payload-camelcase` e `sensivel-em-saida` de uma vez (extrator
    // `chavesDaProjecao`) — quatro ids NAO DECLARADOS na primeira volta ao texto cru.
    //
    // O defeito de verdade e o `console.log`/`print`, e e o unico achado que pode sair daqui.
    exigeVizinho: true,
    mutar: (m) => {
      // `cpf` sensivel e o que arma a metade `sensivel-em-saida` do chamariz do mapeador. Nao
      // acusa `saida-sensivel`: campo nenhum chamado `cpf` aparece em schema do contrato do molde.
      m.manifesto((x) => ({ ...x, camposSensiveis: ['cpf'] }));
      // Arquivo cujo nome casa /mapeador/i e cujo conteudo e SO comentario: projecao nenhuma
      // existe aqui, e nada pode ser acusado. Vale nos tres bindings — `linhasCodigo` descarta a
      // linha `//` qualquer que seja a extensao.
      m.escrever(
        'api/src/mapeador-doc.ts',
        '// A projecao, escrita como documentacao. NENHUMA destas chaves e publicada:\n'
          + '//   export function paraContratoDoc(r) { return { cpf: r.cpf, criado_em: r.criadoEm }; }\n',
      );
      m.acrescentarEm('rotas', {
        js: '\n// A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + "//   import { X } from '@<escopo>/vizinho';\n"
          + "//   import { c } from '../../adapters/memoria/index.js';\n"
          + "//   import pg from 'pg';\n"
          + '//   const s = process.env.MOLDE_SEGREDO_DOC;\n'
          + "//   select nome from vizinho_metadados where id = ' + id\n"
          + "//   router.get('/rota-desativada', listarLegado);\n"
          + "export const gritar = () => console.log('este si e defeito');\n",
        py: '\n\n# A lei, escrita como documentacao. NENHUMA destas linhas pode ser acusada:\n'
          + '#   from adapters.memoria import criar\n'
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
    mutar: (m) => m.escrever('core/dominio/mau.ts', "export function f() { console.log('oi'); }\n"),
  },
  {
    regra: 'determinismo',
    descricao: 'nao-determinismo dentro de core/',
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export const agora = new Date();\n'),
  },
  {
    regra: 'rota-publica-autenticada',
    descricao: 'rotasPublicas declara rota que o contrato nao tem',
    // Entrada com typo NAO isenta nada: o autor acredita que abriu a rota, a cadeia continua
    // exigindo token, e o defeito so aparece em producao. A forma passa no JSON Schema
    // (`^(GET|POST|PATCH|PUT|DELETE) /`), entao `schema-manifesto` cala e o caso acusa UM id.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      rotasPublicas: [...x.rotasPublicas, 'GET /helth'],
    })),
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
      m.manifesto((x) => ({ ...x, envRequerido: [...x.envRequerido, 'MOLDE_OPENAI_API_KEY'] }));
      // Sem isto o caso violava tambem `env-exemplo` — ruido do fixture, nao da credencial.
      m.acrescentar('.env.example', 'MOLDE_OPENAI_API_KEY=\n');
    },
  },

  // --- Escrita -------------------------------------------------------------------------------
  {
    regra: 'limiar-funcao',
    descricao: 'funcao acima de 40 linhas',
    mutar: (m) => m.escrever('core/dominio/mau.ts', `export function longa() {\n${'  let x = 1;\n'.repeat(45)}}\n`),
  },
  {
    regra: 'limiar-aninhamento',
    descricao: 'aninhamento de controle acima de 3',
    mutar: (m) => m.escrever(
      'core/dominio/mau.ts',
      'export function f(a) {\n  if (a) {\n    for (;;) {\n      while (a) {\n        if (a) { return 1; }\n      }\n    }\n  }\n  return 0;\n}\n',
    ),
  },
  {
    regra: 'limiar-parametros',
    descricao: 'funcao com mais de 4 parametros',
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export function f(a, b, c, d, e) {\n  return [a, b, c, d, e];\n}\n'),
  },
  {
    regra: 'excecao-engolida',
    descricao: 'catch vazio',
    mutar: (m) => m.escrever('core/dominio/mau.ts', 'export function f(g) {\n  try { g(); } catch (e) {}\n}\n'),
  },
];
