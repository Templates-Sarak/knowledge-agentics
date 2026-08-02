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
    mutar: (m) => m.manifesto((x) => ({ ...x, papel: 'inventado' })),
  },
  {
    regra: 'estrutura',
    descricao: 'contrato/openapi.yaml ausente',
    mutar: (m) => m.remover('contrato/openapi.yaml'),
  },
  {
    regra: 'estrutura-estrita',
    descricao: 'entrada nao prevista na raiz do modulo',
    mutar: (m) => m.escrever('lixo.txt', 'nao previsto'),
  },
  {
    regra: 'web-declarado',
    descricao: 'rotaWeb declarada sem pagina real',
    // Declara a rotaWeb no proprio caso: assim vale tambem para molde que nasce sem tela
    // (o binding Python), em vez de depender do default de um binding especifico.
    mutar: (m) => {
      m.manifesto((x) => ({ ...x, rotaWeb: '/molde' }));
      m.removerPasta('web/src/pages');
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
    // O contrato declarado tem de EXISTIR na spec do vizinho (`/resumo` e obrigatoria em todo
    // modulo). Com `GET /x`, este caso violava tambem `consome-contrato` e deixava de exercitar
    // uma regra so — caso de teste com duas violacoes nao prova qual das duas esta viva.
    mutar: (m) => m.manifesto((x) => ({
      ...x,
      consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'ciclo' }],
      envRequerido: [...x.envRequerido, 'VIZINHO_URL'],
    })),
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

  // --- Dados ---------------------------------------------------------------------------------
  {
    regra: 'schema-nao-public',
    descricao: 'schema do banco e public',
    mutar: (m) => m.manifesto((x) => ({ ...x, dados: { ...x.dados, schema: 'public' } })),
  },
  {
    regra: 'tabela-prefixo',
    descricao: 'tabela declarada sem o prefixo do modulo',
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

  // --- Configuracao e ambiente ---------------------------------------------------------------
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
    mutar: (m) => m.escrever('core/dominio/mau.ts', "export const u = process.env['X'] ?? 'http://localhost';\n"),
  },
  {
    regra: 'env-declarado',
    descricao: 'env usada e nao declarada no manifesto',
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
    mutar: (m) => m.acrescentar('api/src/routes/index.ts', "\nrouter.get('/nao-declarada', () => undefined);\n"),
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
    mutar: (m) => m.acrescentar(
      'api/src/mapeadores/index.ts',
      '\nexport function paraContratoErrado(r) {\n  return { hash: r.hash, criado_em: r.criadoEm };\n}\n',
    ),
  },
  {
    regra: 'saida-sensivel',
    descricao: 'campo sensivel citado em schema de resposta do OpenAPI',
    mutar: (m) => m.manifesto((x) => ({ ...x, camposSensiveis: ['status'] })),
  },
  {
    regra: 'sensivel-em-saida',
    descricao: 'campo sensivel entra na projecao de saida',
    mutar: (m) => m.manifesto((x) => ({ ...x, camposSensiveis: ['titulo'] })),
  },
  {
    regra: 'saida-crua',
    descricao: 'devolve o registro cru na resposta',
    mutar: (m) => m.acrescentar('api/src/routes/index.ts', '\nexport const cru = (res, registro) => res.json(registro);\n'),
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
    mutar: (m) => m.manifesto((x) => ({ ...x, envRequerido: [...x.envRequerido, 'MOLDE_OPENAI_API_KEY'] })),
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
