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
    regra: 'web-declarado',
    descricao: 'rotaWeb declarada sem pagina real',
    // Cascata legitima: sem as paginas, as chaves de `config/textos.json` ficam sem leitor. So em
    // TS/JS — o molde Python nasce sem `web/`, e por isso `tambem` e teto, nao obrigacao.
    tambem: ['config-morta'],
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
    regra: 'sdk-fornecedor',
    descricao: 'SDK de fornecedor dentro do modulo',
    mutar: (m) => m.escrever('core/dominio/mau.ts', "import pg from 'pg';\nexport const y = pg;\n"),
  },
  {
    regra: 'gateway-http',
    descricao: 'gateway falando com banco',
    // Cascata legitima: o arquivo novo em `core/gateways/` nao tem entrada em `consome`.
    tambem: ['gateway-declarado'],
    mutar: (m) => m.escrever('core/gateways/vizinho.ts', "export const q = 'select 1 from t';\nexport async function f(c) { return c.query(q); }\n"),
  },
  {
    regra: 'gateway-declarado',
    descricao: 'gateway sem entrada em consome',
    mutar: (m) => m.escrever('core/gateways/vizinho.ts', 'export async function f(u) { return fetch(u); }\n'),
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
    // Cascata legitima: a tabela nova tambem nao tem ENABLE ROW LEVEL SECURITY no SQL.
    tambem: ['rls'],
    mutar: (m) => m.manifesto((x) => ({ ...x, dados: { ...x.dados, tabelas: [...x.dados.tabelas, 'clientes'] } })),
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
    mutar: (m) => m.escrever('core/dominio/mau.ts', "export const base = 'https://api.exemplo.com';\n"),
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
    // registra, entao divergir do codigo e consequencia do proprio defeito sob teste.
    tambem: ['contrato-sincronizado'],
    // O `servers:` e as `properties:` entram na spec minima de proposito: sem eles o caso acusaria
    // tambem `rota-nomenclatura` e `projecao-contrato`, e deixaria de provar a ausencia das rotas
    // OBRIGATORIAS, que e o dele. As propriedades sao as que o mapeador do molde projeta.
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
    mutar: (m) => m.escrever(
      'api/src/mapeador-extra.ts',
      'export function paraContratoExtra(r) {\n  return { hash: r.hash, campoFantasma: r.fantasma };\n}\n',
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
    // `total` e declarado em resposta e NUNCA projetado nem logado — isola o lado do CONTRATO.
    // Com `status` (que o mapeador projeta) o caso acusava tambem `sensivel-em-saida`.
    mutar: (m) => m.manifesto((x) => ({ ...x, camposSensiveis: ['total'] })),
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
    regra: 'saida-crua',
    descricao: 'devolve o registro cru na resposta',
    // As duas metades do padrao, uma por sintaxe: `json(registro)` no lado Express, e o `return`
    // direto do nome do lado do BANCO no lado FastAPI, que nao passa por `.json(...)`.
    mutar: (m) => m.acrescentarEm('rotas', {
      js: '\nexport const cru = (res, registro) => res.json(registro);\n',
      py: '\n\ndef cru(linha):\n    return linha\n',
    }),
  },

  // --- Operacao ------------------------------------------------------------------------------
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
