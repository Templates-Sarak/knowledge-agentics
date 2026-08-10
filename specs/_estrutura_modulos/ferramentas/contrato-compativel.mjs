#!/usr/bin/env node
/**
 * contrato-compativel.mjs — esta mudança no `contrato/openapi.yaml` quebra quem consome o módulo?
 * Lei dona: specs/arquitetura/02-contrato-e-dados.md §5 ("v1 é estável... consulte o grafo antes").
 *
 *   node ferramentas/contrato-compativel.mjs [--desde <ref>] [<modulo>] [--json]
 *   node ferramentas/contrato-compativel.mjs --autoteste
 *
 * O QUE ISTO NÃO É: não é regra de gate. O gate compara UM estado (04-regras.md); isto compara DOIS —
 * precisa de baseline git, e por isso é FERRAMENTA, não regra: "o gate não roda git de propósito, é o
 * que o mantém puro e chamável de dentro de um hook" (gate/README.md). Não ganha id, não entra no
 * §4.x, não conta para as 74 regras com caso.
 *
 * ============================================================================================
 * A LEI, E O QUE DELA ESTE ARQUIVO COBRE — 02-contrato-e-dados.md §5, cláusula por cláusula:
 *
 *   COBERTO (provado por --autoteste):
 *     - "rota nova é compatível"                          → rota em depois e não em antes: nada
 *     - "remover... campo [rota] não é [compatível]"       → rota em antes e não em depois: BREAKING
 *     - método de uma rota que continua, removido          → BREAKING (mesma cláusula, granularidade menor)
 *     - "acrescentar campo opcional [na resposta] é compatível" → propriedade nova na resposta: nada
 *     - "remover... campo [da resposta]... não é [compatível]"  → propriedade sumida da resposta: BREAKING
 *     - direção INVERSA na requisição (não é cláusula literal da lei, é a mecânica por trás dela):
 *       campo que passa a ser OBRIGATÓRIO na entrada → BREAKING; deixar de ser obrigatório → nada
 *     - `servers[0].url` alterado → BREAKING (muda o prefixo, quebra todo consumidor)
 *
 *   NÃO COBERTO, declarado como limite em 04-regras.md §7.2 (não fingido, não testado como coberto):
 *     - "mudar tipo" de um campo (`type: string` → `type: integer`)
 *     - "apertar validação" (minLength, maximum, pattern, format mais estritos)
 *     - "enum que perdeu valor"
 *     - "mudar semântica" — nunca decidível por máquina, nem tentado
 *
 * Por quê parar aqui: os quatro primeiros exigem um leitor CIENTE DE TIPO — o que `spec.mjs` tem hoje
 * é um leitor de NOME (property existe? está em `required`?), não de FORMA. Estender para tipo/validação
 * é redesenho do extrator (a mesma fronteira que `spec.mjs` já documenta para `projecao-contrato`: "o
 * conserto não é uma guarda, é a região passar a ser... redesenho do extrator"). Prefiro cinco cláusulas
 * provadas e quatro limites escritos a nove cláusulas alegadas — é a lei 1 deste prompt (falso positivo
 * não se aceita) aplicada ao MEU PRÓPRIO relatório: dizer "cubro a lei inteira" sem provar seria a mesma
 * cegueira-fingida-de-certeza que este arquivo existe para impedir na spec.
 * ============================================================================================
 *
 * NÚCLEO × CASCA — o precedente é `afetados.mjs` (grafo) e `gate/spec.mjs` (leitura), os dois já
 * fixaram esta forma duas vezes:
 *
 *   `compararContratos(yamlAntes, yamlDepois)` é o núcleo: recebe TEXTO, devolve DADO, nunca toca
 *   `fs` nem `child_process`. É o que permite `--autoteste` provar cada cláusula com fixture em
 *   memória, sem escrever projeto em disco nem precisar de repositório git.
 *
 *   A casca (`principal`, `git`, `lerNoRef`, `lerAtual`, `caminhosMudados`) é quem toca disco e git.
 *   `git()` é o ÚNICO ponto que roda `git` de verdade — mesmo isolamento de `caminhosAlteradosDesde`
 *   em `afetados.mjs`. `execFileSync` sempre com ARRAY de argumentos, nunca `shell: true`: a etapa
 *   anterior deste plano foi reprovada por shell concatenando argumento hostil em comando — aqui o
 *   argumento hostil é a PRÓPRIA ref (`--desde`), e ela nunca toca um interpretador de shell.
 *
 * CEGUEIRA ≠ COMPATIBILIDADE — a armadilha central. Se `leiturasFalhas` (gate/spec.mjs) disser que
 * `paths:` ou `servers:` de QUALQUER um dos dois lados não pôde ser lido, a resposta NUNCA é
 * "compatível": é "não consegui comparar", com exit 1 e a seção nomeada. Dizer "sem breaking change"
 * sobre uma spec que não se leu é a pior saída possível — libera um deploy que quebra consumidor
 * acreditando que foi verificado.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  leiturasFalhas, obrigatoriosDaRequisicao, operacoesDaSpec, propriedadesDaResposta,
  servidorDaSpec, statusDaOperacao,
} from './gate/spec.mjs';
import { montarGrafo } from './afetados.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou `process.env`.
// ================================================================================================

/** Rota removida é BREAKING; rota nova não é reportada (compatível, lei explícita). */
function compararRotas(antes, depois) {
  const achados = [];
  for (const [rota, metodos] of operacoesDaSpec(antes)) {
    const metodosDepois = operacoesDaSpec(depois).get(rota);
    if (metodosDepois === undefined) {
      achados.push({ tipo: 'rota-removida', mensagem: `rota "${rota}" existia e foi removida — quebra quem consome` });
      continue;
    }
    for (const metodo of metodos) {
      if (!metodosDepois.has(metodo)) {
        achados.push({ tipo: 'metodo-removido', mensagem: `${metodo} "${rota}": existia e foi removido — quebra quem consome` });
      }
    }
  }
  return achados;
}

/** `servers[0].url` é o prefixo do módulo — mudar quebra todo consumidor. Só compara quando os dois lados leem. */
function compararServidor(antes, depois) {
  const urlAntes = servidorDaSpec(antes);
  const urlDepois = servidorDaSpec(depois);
  if (urlAntes === null || urlDepois === null || urlAntes === urlDepois) return [];
  return [{ tipo: 'servidor-alterado', mensagem: `servers[0].url mudou de "${urlAntes}" para "${urlDepois}" — o prefixo do modulo mudou, todo consumidor quebra` }];
}

/**
 * Campo de RESPOSTA removido é BREAKING; campo novo não é reportado. Só compara rota+método+status
 * presentes nos DOIS lados — rota/método removidos já viraram achado em `compararRotas`, e status
 * code que desapareceu é uma pergunta diferente desta cláusula (não coberta, ver cabeçalho do arquivo).
 */
/** O laco de `status` isolado do de `compararRespostas` — so por isso o aninhamento de UM cai
 * dentro do limiar (04-regras.md §4.7): a mesma tecnica que separa `compararCamposDaResposta`.
 * `{ antes, depois }` e `{ rota, metodo }` agrupados: os dois pares sempre viajam juntos, e sem
 * agrupar a extracao trocaria um limiar (aninhamento) por outro (parametros). */
function achadosDeStatusNaResposta(specs, operacao, statusAntes, statusDepois) {
  const achados = [];
  for (const status of statusAntes) {
    if (!statusDepois.has(status)) continue;
    achados.push(...compararCamposDaResposta(specs.antes, specs.depois, { ...operacao, status }));
  }
  return achados;
}

function compararRespostas(antes, depois) {
  const achados = [];
  for (const [rota, metodos] of operacoesDaSpec(antes)) {
    const metodosDepois = operacoesDaSpec(depois).get(rota);
    if (metodosDepois === undefined) continue;
    for (const metodo of metodos) {
      if (!metodosDepois.has(metodo)) continue;
      const statusAntes = statusDaOperacao(antes, rota, metodo) ?? new Set();
      const statusDepois = statusDaOperacao(depois, rota, metodo) ?? new Set();
      achados.push(...achadosDeStatusNaResposta({ antes, depois }, { rota, metodo }, statusAntes, statusDepois));
    }
  }
  return achados;
}

/** `{ rota, metodo, status }` em vez de tres parametros soltos — o limiar de 4 parametros
 * (04-regras.md §4.7) que este arquivo tambem cobra do codigo do usuario. */
function compararCamposDaResposta(antes, depois, operacao) {
  const { rota, metodo, status } = operacao;
  const propsAntes = propriedadesDaResposta(antes, rota, metodo, status) ?? new Set();
  const propsDepois = propriedadesDaResposta(depois, rota, metodo, status) ?? new Set();
  const achados = [];
  for (const campo of propsAntes) {
    if (!propsDepois.has(campo)) {
      achados.push({
        tipo: 'campo-resposta-removido',
        mensagem: `${metodo} "${rota}" ${status}: campo "${campo}" existia na resposta e foi removido — quebra quem consome`,
      });
    }
  }
  return achados;
}

/**
 * Campo que PASSA A SER obrigatório na requisição é BREAKING (quem não manda o campo novo passa a
 * ser rejeitado); deixar de ser obrigatório não é reportado — a direção é o INVERSO da resposta, e é
 * a própria lei que a inverte (acrescentar é compatível na resposta, mas obrigar é que quebra na
 * requisição). Mesma guarda de rota/método presentes nos dois lados que `compararRespostas`.
 */
/** O laco de `campo` isolado do de `compararRequisicoes` — mesma tecnica de
 * `achadosDeStatusNaResposta`, para o aninhamento caber no limiar (04-regras.md §4.7). */
function achadosDeCampoNaRequisicao(rota, metodo, antesObrig, depoisObrig) {
  const achados = [];
  for (const campo of depoisObrig) {
    if (!antesObrig.has(campo)) {
      achados.push({
        tipo: 'campo-obrigatorio-acrescentado',
        mensagem: `${metodo} "${rota}": campo "${campo}" passou a ser OBRIGATORIO na requisicao — quem consome sem enviar esse campo passa a ser rejeitado`,
      });
    }
  }
  return achados;
}

function compararRequisicoes(antes, depois) {
  const achados = [];
  for (const [rota, metodos] of operacoesDaSpec(antes)) {
    const metodosDepois = operacoesDaSpec(depois).get(rota);
    if (metodosDepois === undefined) continue;
    for (const metodo of metodos) {
      if (!metodosDepois.has(metodo)) continue;
      const antesObrig = obrigatoriosDaRequisicao(antes, rota, metodo) ?? new Set();
      const depoisObrig = obrigatoriosDaRequisicao(depois, rota, metodo) ?? new Set();
      achados.push(...achadosDeCampoNaRequisicao(rota, metodo, antesObrig, depoisObrig));
    }
  }
  return achados;
}

/**
 * O núcleo inteiro. Recebe o texto dos dois lados (qualquer um pode ser `null` — spec ausente
 * naquele lado) e devolve o veredito. NUNCA afirma `compativel: true` sobre um lado que não leu.
 *
 * As quatro formas de "não há o que comparar", em ordem de checagem:
 *   1. os dois `null` — nunca existiu, nada a dizer (trivial, não deveria acontecer na prática).
 *   2. só `antes` é `null` — spec NOVA. Não é breaking, é CRIAÇÃO: não há consumidor antigo para quebrar.
 *   3. só `depois` é `null` — spec REMOVIDA (o módulo pode ou não ter sumido junto; a casca decide a
 *      frase exata, o núcleo só sabe que sumiu). SEMPRE breaking: quem consumia perdeu o contrato.
 *   4. qualquer um dos dois é ILEGÍVEL (`leiturasFalhas` não-vazio) — CEGUEIRA, nunca "compatível".
 */
export function compararContratos(yamlAntes, yamlDepois) {
  if (yamlAntes === null && yamlDepois === null) {
    return { status: 'sem-baseline', compativel: true, achados: [] };
  }
  if (yamlAntes === null) {
    return { status: 'sem-baseline', compativel: true, achados: [] };
  }
  if (yamlDepois === null) {
    return {
      status: 'removido',
      compativel: false,
      achados: [{ tipo: 'spec-removida', mensagem: 'contrato/openapi.yaml existia no baseline e foi removido — quem consome perdeu o contrato' }],
    };
  }

  const falhasAntes = leiturasFalhas(yamlAntes);
  const falhasDepois = leiturasFalhas(yamlDepois);
  if (falhasAntes.length > 0 || falhasDepois.length > 0) {
    return {
      status: 'ilegivel',
      compativel: false,
      achados: [
        ...falhasAntes.map((secao) => ({ tipo: 'ilegivel', mensagem: `baseline: secao "${secao}:" nao pode ser lida — nao da para afirmar compatibilidade` })),
        ...falhasDepois.map((secao) => ({ tipo: 'ilegivel', mensagem: `atual: secao "${secao}:" nao pode ser lida — nao da para afirmar compatibilidade` })),
      ],
    };
  }

  const achados = [
    ...compararRotas(yamlAntes, yamlDepois),
    ...compararServidor(yamlAntes, yamlDepois),
    ...compararRespostas(yamlAntes, yamlDepois),
    ...compararRequisicoes(yamlAntes, yamlDepois),
  ];
  return { status: 'comparado', compativel: achados.length === 0, achados };
}

// ================================================================================================
// CASCA — toca disco e git. `git()` é o ÚNICO ponto que roda `git` de verdade.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Mesmo raciocínio de `gate/contexto.mjs:acharRaizProjeto` — não importado: só `spec.mjs` e
 * `afetados.mjs` estão liberados para import neste escopo, `contexto.mjs` não. */
function acharRaiz(partida) {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = join(atual, '..');
    if (relative(pai, atual) === '') break;
    atual = pai;
  }
  return partida;
}

const RAIZ = acharRaiz(AQUI);

/** ÚNICO ponto que roda `git` de verdade — array de argumentos, NUNCA `shell: true` (lição da etapa anterior). */
function git(args) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
}

/** A ref existe? Verificado ANTES de qualquer comparação — ref hostil/inválida REPROVA, nunca vira "nada mudou". */
function refValida(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Conteúdo de um arquivo NAQUELE ref — `null` se não existir ali (git falha por design, não exceção nossa). */
function lerNoRef(ref, caminhoRelativo) {
  const alvo = caminhoRelativo.split('\\').join('/');
  try {
    return git(['show', `${ref}:${alvo}`]);
  } catch {
    return null;
  }
}

function lerAtual(id) {
  const caminho = join(RAIZ, 'modulos', id, 'contrato', 'openapi.yaml');
  return existsSync(caminho) ? readFileSync(caminho, 'utf8') : null;
}

/** Os ids de módulo cujo `contrato/openapi.yaml` mudou (criado, editado ou apagado) desde a ref. */
function modulosComContratoMudado(ref) {
  const padrao = /^modulos\/([^/]+)\/contrato\/openapi\.yaml$/;
  const mudados = git(['diff', '--name-only', '--no-renames', ref])
    .split(/\r?\n/)
    .map((linha) => linha.match(padrao))
    .filter((m) => m !== null)
    .map((m) => m[1]);
  return [...new Set(mudados)];
}

/** Quem DECLARA `consome` apontando para `id`, no grafo ATUAL — inclusive se `id` não existe mais
 * (a declaração continua no manifesto de quem consome, ainda que o dono tenha sumido). Mesma
 * pergunta que `consome-contrato` faz no gate ("reportado no consumidor"), UM salto só — não
 * transitivo como `afetados.mjs:calcularAfetados` (que responde "o que precisa reverificar", uma
 * pergunta mais ampla que "quem depende DIRETO deste contrato"). */
function consumidoresDiretos(grafo, id) {
  const consumidores = [];
  for (const [outroId, { consome }] of grafo.modulos) {
    if (consome.includes(id)) consumidores.push(outroId);
  }
  return consumidores.sort();
}

function compararModulo(ref, grafo, id) {
  const antes = lerNoRef(ref, join('modulos', id, 'contrato', 'openapi.yaml'));
  const depois = lerAtual(id);
  const resultado = compararContratos(antes, depois);
  const consumidores = resultado.compativel ? [] : consumidoresDiretos(grafo, id);
  const moduloExisteAinda = existsSync(join(RAIZ, 'modulos', id));
  return { modulo: id, moduloExisteAinda, consumidores, ...resultado };
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function imprimirHumano(ref, resultados) {
  process.stdout.write(`contrato-compativel: comparando com --desde ${ref}\n`);
  if (resultados.length === 0) {
    process.stdout.write('  nenhum contrato/openapi.yaml mudou nesta area\n');
    return;
  }
  for (const r of resultados) {
    if (r.status === 'sem-baseline') {
      process.stdout.write(`  ${r.modulo}: contrato novo (sem baseline) — criacao, nao ha o que quebrar\n`);
      continue;
    }
    const marca = r.compativel ? 'ok   ' : 'FALHA';
    const qualificador = r.status === 'removido'
      ? (r.moduloExisteAinda ? ' (modulo continua, so o contrato sumiu)' : ' (modulo inteiro removido)')
      : '';
    process.stdout.write(`  ${marca} ${r.modulo}${qualificador}\n`);
    for (const achado of r.achados) process.stdout.write(`        [${achado.tipo}] ${achado.mensagem}\n`);
    if (r.consumidores.length > 0) {
      process.stdout.write(`        consumidores afetados: ${r.consumidores.join(', ')}\n`);
    } else if (!r.compativel) {
      process.stdout.write('        consumidores afetados: nenhum modulo atual declara "consome" para este\n');
    }
  }
}

function imprimirJson(ref, resultados) {
  const erros = resultados.filter((r) => !r.compativel).length;
  process.stdout.write(`${JSON.stringify({ desde: ref, modulos: resultados, erros }, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function lerOpcoes(argv) {
  const opcoes = { desde: null, modulo: null, json: false, autoteste: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--autoteste') { opcoes.autoteste = true; continue; }
    if (argv[i] === '--json') { opcoes.json = true; continue; }
    if (argv[i] === '--desde') { opcoes.desde = argv[i + 1] ?? null; i += 1; continue; }
    if (!argv[i].startsWith('--')) { opcoes.modulo = argv[i]; continue; }
  }
  return opcoes;
}

/**
 * `HEAD~1`, não `@{u}`. Este é passo de CI (ver cabeçalho): checkout de CI é frequentemente HEAD
 * destacado, sem upstream configurado — `@{u}` (a escolha certa em `verificar-commit.mjs:pre-push`,
 * onde há sempre um clone de dev com upstream) falharia na maioria dos provedores por padrão.
 * `HEAD~1` sempre existe em qualquer histórico com 2+ commits e não depende de configuração de rede
 * nem de branch remota — é o "compare com o commit anterior" que faz sentido tanto em squash-merge
 * (1 commit por PR) quanto rodando localmente por curiosidade.
 */
const REF_PADRAO = 'HEAD~1';

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  const ref = opcoes.desde ?? REF_PADRAO;
  if (!refValida(ref)) {
    process.stderr.write(`erro: ref invalida ou inexistente: "${ref}" — nao da para afirmar compatibilidade sem baseline\n`);
    return 1;
  }

  const grafo = montarGrafo(RAIZ);
  const ids = opcoes.modulo !== null ? [opcoes.modulo] : modulosComContratoMudado(ref);
  const resultados = ids.map((id) => compararModulo(ref, grafo, id));

  if (opcoes.json) imprimirJson(ref, resultados);
  else imprimirHumano(ref, resultados);

  const reprovado = resultados.some((r) => !r.compativel);
  if (!opcoes.json) {
    process.stdout.write(`\ncontrato-compativel: ${reprovado ? 'REPROVADO' : 'OK'}\n`);
  }
  return reprovado ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — o núcleo contra fixtures em memória. Lei 6: sem prova por máquina, não entra.
// ================================================================================================

const BASE = `
openapi: 3.1.0
servers:
  - url: /api/v1/pedidos
paths:
  /registros:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  itens: { type: array }
                  total: { type: integer }
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NovoRegistro' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Registro' }
  /registros/{hash}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Registro' }
components:
  schemas:
    Registro:
      type: object
      properties:
        hash: { type: string }
        titulo: { type: string }
    NovoRegistro:
      type: object
      required: [titulo]
      properties:
        titulo: { type: string }
`;

/** Fixture ILEGÍVEL de propósito — `paths:` em *flow style*, que `spec.mjs:operacoesDaSpec` não alcança. */
const ILEGIVEL = 'openapi: 3.1.0\npaths: {"/x": {"get": {}}}\n';

function casosDeAutoteste() {
  return [
    {
      nome: 'rota removida: BREAKING',
      antes: BASE,
      depois: BASE.replace(/ {2}\/registros\/\{hash\}:[\s\S]*?(?=\ncomponents:)/, ''),
      esperado: { compativel: false, tipo: 'rota-removida' },
    },
    {
      nome: 'rota acrescentada: compativel',
      antes: BASE,
      depois: `${BASE.replace('components:', '  /saude:\n    get:\n      responses:\n        \'200\':\n          content: {}\ncomponents:')}`,
      esperado: { compativel: true },
    },
    {
      nome: 'metodo removido de rota que continua: BREAKING',
      antes: BASE,
      depois: BASE.replace(/ {4}post:[\s\S]*?(?=\n {2}\/registros\/)/, ''),
      esperado: { compativel: false, tipo: 'metodo-removido' },
    },
    {
      nome: 'campo de resposta removido: BREAKING',
      antes: BASE,
      depois: BASE.replace('                  total: { type: integer }\n', ''),
      esperado: { compativel: false, tipo: 'campo-resposta-removido' },
    },
    {
      nome: 'campo de resposta acrescentado: compativel',
      antes: BASE,
      depois: BASE.replace('                  total: { type: integer }', '                  total: { type: integer }\n                  pagina: { type: integer }'),
      esperado: { compativel: true },
    },
    {
      nome: 'campo obrigatorio acrescentado na requisicao: BREAKING',
      antes: BASE,
      depois: BASE.replace('required: [titulo]', 'required: [titulo, status]'),
      esperado: { compativel: false, tipo: 'campo-obrigatorio-acrescentado' },
    },
    {
      nome: 'campo obrigatorio removido da requisicao: compativel',
      antes: BASE.replace('required: [titulo]', 'required: [titulo, status]'),
      depois: BASE,
      esperado: { compativel: true },
    },
    {
      nome: 'servers[0].url alterado: BREAKING',
      antes: BASE,
      depois: BASE.replace('/api/v1/pedidos', '/api/v1/pedidos-v2'),
      esperado: { compativel: false, tipo: 'servidor-alterado' },
    },
    {
      nome: 'spec ilegivel no ANTES: reprova e nomeia a secao, nunca "compativel"',
      antes: ILEGIVEL,
      depois: BASE,
      esperado: { compativel: false, status: 'ilegivel' },
    },
    {
      nome: 'spec ilegivel no DEPOIS: reprova e nomeia a secao, nunca "compativel"',
      antes: BASE,
      depois: ILEGIVEL,
      esperado: { compativel: false, status: 'ilegivel' },
    },
    {
      nome: 'spec nova sem baseline: NAO reprova (criacao, nao breaking)',
      antes: null,
      depois: BASE,
      esperado: { compativel: true, status: 'sem-baseline' },
    },
    {
      nome: 'spec removida: BREAKING',
      antes: BASE,
      depois: null,
      esperado: { compativel: false, status: 'removido' },
    },
  ];
}

function resultadoBate(resultado, esperado) {
  if (resultado.compativel !== esperado.compativel) return false;
  if (esperado.status !== undefined && resultado.status !== esperado.status) return false;
  if (esperado.tipo !== undefined && !resultado.achados.some((a) => a.tipo === esperado.tipo)) return false;
  return true;
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    const resultado = compararContratos(caso.antes, caso.depois);
    const ok = resultadoBate(resultado, caso.esperado);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)}\n`);
      process.stdout.write(`       obtido:   compativel=${resultado.compativel} status=${resultado.status} achados=${JSON.stringify(resultado.achados)}\n`);
    }
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
