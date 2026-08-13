#!/usr/bin/env node
/**
 * affected.mjs — dado um conjunto de arquivos alterados, diz o que precisa ser VERIFICADO.
 * Lei dona: nenhuma — ferramenta, como `sync-env.mjs` e `generate-lint-config.mjs`. Não é
 * regra de gate, não tem id, não conta para as 73 regras com caso do catálogo.
 *
 *   node tools/affected.mjs <caminho...>          caminhos por argumento
 *   git diff --name-only | node tools/affected.mjs   caminhos por stdin (sem argumento)
 *   node tools/affected.mjs --desde <ref>          chama `git diff --name-only <ref>`
 *   node tools/affected.mjs ... --json             saida estruturada em vez de texto
 *   node tools/affected.mjs --autoteste            roda a prova interna (fixtures em memoria)
 *
 * ============================================================================================
 * O PRINCIPIO QUE MANDA EM TODA DECISAO DESTE ARQUIVO: ERRA PARA MAIS, NUNCA PARA MENOS.
 *
 * Selecionar demais custa minutos de CI. Selecionar de menos deixa código NAO VERIFICADO passar
 * com o pipeline verde — e "verde indistinguível de não verificou" é exatamente a doença que todo
 * o template em `specs/_estrutura_modulos/` existe para tratar (04-regras.md §7). Toda dúvida, todo
 * caminho não reconhecido, toda falha de leitura resolve em "verificar TUDO", nunca em "não afeta
 * nada". Quem mexer neste arquivo depois: a direção proibida é fazer o cálculo mais preciso à
 * custa de arriscar um falso negativo. Precisão que arrisca esconder código não verificado NAO
 * entra aqui — é a mesma lei do §7.2 do catálogo, na direção oposta (lá é falso positivo que não
 * se aceita; aqui é falso negativo).
 * ============================================================================================
 *
 * ARQUITETURA DO ARQUIVO — duas metades, como `gate/context.mjs` e `gate/spec.mjs` já separam:
 *
 *   - `montarGrafo` é a ÚNICA função que toca disco. Lê `module.json` de cada módulo (via
 *     `listarModulos`/`acharRaizProjeto`, REUSADOS de `gate/context.mjs` — a mesma definição de
 *     "o que é um módulo" em todo o template, nunca uma segunda);
 *   - `normalizarCaminho` e `calcularAfetados` são PURAS: recebem dado, devolvem dado, nunca
 *     `existsSync`/`readFileSync`. É o que permite `--autoteste` provar o cálculo inteiro com
 *     fixtures em memória, sem escrever um projeto em disco — o mesmo raciocínio do cabeçalho de
 *     `spec.mjs` ("não toca o disco: recebe o texto e devolve dado").
 */
import { readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { acharRaizProjeto, listarModulos } from './gate/context.mjs';

// ================================================================================================
// CASCA — toca disco. Só esta função.
// ================================================================================================

/** Lê removendo o BOM (U+FEFF) — editor e shell do Windows gravam por padrão, `JSON.parse` rejeita. */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^\uFEFF/, '');
}

/**
 * Monta o grafo do projeto a partir do disco: um nó por pasta de `modules/` com manifesto (via
 * `listarModulos`, que JÁ inclui `_template` — "Lista as pastas de modules/ que tem manifesto —
 * inclusive os moldes", context.mjs). Decisão sobre `_template` (armadilha do Passo 4): entra sem
 * tratamento especial. Reusar `listarModulos` em vez de reimplementar significa aceitar a definição
 * dela inteira — e é segura aqui pelo mesmo motivo que é segura no gate: nenhum módulo REAL declara
 * `consumes` apontando pra `_template` (não faria sentido semântico), então o conjunto afetado por
 * uma mudança nele é, na prática, só ele mesmo — o mesmo isolamento que `validate.mjs --todos` já
 * mostra ao reportar "molde" como uma unidade própria, separada dos módulos reais.
 *
 * A CHAVE do grafo é o NOME DA PASTA, não o `id` de dentro do manifesto. É a mesma chave que
 * `context.mjs:idDaPasta` usa, e a razão é dupla: (1) é o que aparece no CAMINHO do arquivo
 * alterado (`modules/<pasta>/...`), que é o único dado que este script recebe; (2) `consumes[].module`
 * referencia o módulo DONO pelo nome que a regra `manifesto` já obriga a casar com a pasta — se
 * meta.json:id divergir do nome da pasta, o gate já está vermelho por outro motivo (`manifesto`), e
 * não é este script que precisa ser a segunda rede de segurança para esse defeito.
 */
export function montarGrafo(raizProjeto) {
  const pastas = listarModulos(raizProjeto);
  const modulos = new Map();
  let ilegivel = false;

  for (const pasta of pastas) {
    const id = basename(pasta);
    try {
      const manifesto = JSON.parse(lerTexto(resolve(pasta, 'module.json')));
      const consome = Array.isArray(manifesto.consumes)
        ? manifesto.consumes.map((entrada) => entrada.module).filter((alvo) => typeof alvo === 'string')
        : [];
      modulos.set(id, { consome });
    } catch {
      // Armadilha do Passo 4 — "module.json ilegível": JSON quebrado numa pasta é grafo INCOMPLETO,
      // não "módulo sem arestas". Não dá pra saber se este módulo consome alguém nem quem o
      // consome de verdade — qualquer resposta que não seja "não confio neste grafo" seria
      // inventar aresta que pode não existir, ou omitir uma que existe. `ilegivel` propaga para
      // "tudo" em `calcularAfetados`, sem exceção.
      modulos.set(id, { consome: [] });
      ilegivel = true;
    }
  }

  return { modulos, ilegivel };
}

/**
 * ÚNICO ponto deste arquivo que roda comando externo. Isolado de propósito: as ferramentas deste
 * repositório (lei 3 do prompt que encomendou este script) não dependem de nada além de
 * `node:fs`/`path`/`url` — `git` no PATH não é uma dependência de PACOTE, mas é uma dependência de
 * AMBIENTE, e por isso fica marcada aqui, isolada, nunca escondida dentro do cálculo. Quem não quiser
 * essa dependência usa `<caminho...>` ou stdin — as outras duas portas de entrada não tocam em nada
 * fora de `node:fs`/`path`.
 */
function caminhosAlteradosDesde(ref, raizProjeto) {
  const saida = execFileSync('git', ['diff', '--name-only', '--no-renames', ref], {
    cwd: raizProjeto,
    encoding: 'utf8',
  });
  return saida.split(/\r?\n/).filter((linha) => linha.trim() !== '');
}

// ================================================================================================
// PURO — nunca toca disco. É a metade que `--autoteste` prova.
// ================================================================================================

/**
 * Normaliza um caminho bruto (do usuário, do git, de stdin) para relativo à raiz do projeto, com
 * `/` sempre — armadilha do Passo 4 "caminho absoluto × relativo, `\` × `/`". `null` quando o
 * caminho cai FORA da raiz do projeto (`../`, ou absoluto de outro lugar): isso é "não reconhecido"
 * na mesma direção das outras armadilhas — não filtramos silenciosamente, o chamador resolve em
 * "tudo" (ver `calcularAfetados`).
 *
 * PURA apesar de usar `path.resolve`/`path.relative`: as duas são matemática de string sobre os
 * caminhos recebidos, nunca leem o disco para saber se o caminho existe.
 */
export function normalizarCaminho(bruto, raizProjeto) {
  const semEspaco = bruto.trim();
  if (semEspaco === '') return null;
  const absoluto = isAbsolute(semEspaco) ? semEspaco : resolve(raizProjeto, semEspaco);
  const rel = relative(raizProjeto, absoluto);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * Em que ÁREA do projeto este caminho (já normalizado, relativo, `/`) cai — a pergunta que decide
 * tudo. `grafo` só é usado para confirmar que um `modules/<id>` é um id que EXISTE hoje.
 *
 * O DEFAULT (nenhum prefixo reconhecido) é `tudo` — não uma lista de exceções que precisa ser
 * mantida em dia. É a forma como a armadilha "caminho não reconhecido" (Passo 4) e a decisão do
 * Passo 1 sobre `tools/`, `config/`, `.env`, `package.json`/`pyproject.toml` da raiz e config
 * de linter viram a MESMA linha de código: nenhum desses é `modules/`, `adapters/`, `src/` ou
 * `packages/`, então caem aqui por construção, sem precisar nomear cada arquivo (`.env`,
 * `.gitignore`, `tsconfig.json`, `.ruff.toml`, `verificar.py`, `project.json`, `specs/**`, ...).
 * Medido (Passo 1): mudar o VERIFICADOR (`tools/`) ou a POLÍTICA do projeto (config raiz,
 * manifesto raiz, lint gerado) pode mudar o resultado de QUALQUER checagem — a resposta segura é
 * literalmente "tudo", e é isso que este `default` devolve sem lista para manter.
 */
function classificarCaminho(caminho, grafo) {
  const [primeiro, segundo, ...resto] = caminho.split('/');

  if (primeiro === 'modules') {
    if (segundo === undefined) {
      return { tipo: 'tudo', motivo: `caminho "${caminho}" aponta para modules/ sem um modulo especifico` };
    }
    if (!grafo.modulos.has(segundo)) {
      // Armadilhas "arquivo apagado" / "modulo apagado" (Passo 4): a pasta pode ter sumido
      // inteira, ou nunca ter existido sob esse nome. Sem o grafo de ANTES da mudança não há como
      // achar quem consumia este módulo — silenciar seria inventar "ninguém o consumia".
      return {
        tipo: 'tudo',
        motivo: `"${segundo}" nao existe em modules/ hoje (apagado, renomeado, ou nome desconhecido) —`
          + ' sem o grafo de antes da mudanca nao ha como achar quem o consumia',
      };
    }
    const subCaminho = resto.join('/');
    const somenteTeste = subCaminho === 'tests' || subCaminho.startsWith('tests/');
    return { tipo: 'module', id: segundo, somenteTeste };
  }

  if (primeiro === 'adapters' || primeiro === 'src') {
    // Medido (Passo 1): adapter é INJETADO — módulo nenhum importa `adapters/` nem `src/`
    // (`import-adapter` proíbe até em teste ser a forma recomendada). Mudança aqui não muda o
    // código de NENHUM módulo; muda o sistema COMPOSTO — as regras de escopo `root`. Não é "tudo":
    // é uma resposta calculada, não um escape.
    return { tipo: 'fiacao' };
  }

  if (primeiro === 'packages') {
    // Medido (Passo 1): módulo importar `packages/ports` é OPCIONAL por projeto (o molde traz
    // cópia local "para ser autossuficiente desde o primeiro teste" — comentário de
    // `api/src/erros.ts`), e `packages/ui-kit` só entra quando `ui.modo: "kit"`. As duas são
    // condicionais que só se resolvem PARSEANDO import de cada módulo — a mesma máquina de
    // `isolation.mjs`, que este script não deveria duplicar. Sem essa máquina, não dá pra provar
    // que um módulo NÃO importa `packages/`, e por "erra para mais" a resposta segura é afetar a
    // raiz E todos os módulos — computada, não bailout: por isso é um `tipo` próprio, não `tudo`.
    return { tipo: 'packages' };
  }

  if (primeiro === 'tools') {
    return { tipo: 'tudo', motivo: 'tools/ e o proprio verificador — mudar o gate pode mudar o resultado de QUALQUER checagem' };
  }

  return {
    tipo: 'tudo',
    motivo: `caminho fora das areas conhecidas (modules/, adapters/, src/, packages/, tools/): "${caminho}"`,
  };
}

/** Mapa reverso `id -> [quem declara consumir id]` — a direção em que a mudança se propaga. */
function construirReversa(grafo) {
  const reversa = new Map();
  for (const [id, { consome }] of grafo.modulos) {
    for (const alvo of consome) {
      if (!reversa.has(alvo)) reversa.set(alvo, []);
      reversa.get(alvo).push(id);
    }
  }
  return reversa;
}

/**
 * O cálculo inteiro. PURA: `grafo` já vem montado, `caminhosBrutos` são strings quaisquer — nenhuma
 * chamada a `fs` aqui. Direção medida no Passo 1 e reproduzida no mundo real (ver relatório): se A
 * declara `consumes: [{module: "B"}]`, é A quem lê o CONTRATO de B (`consome-contrato`, "Reportado
 * no consumidor") — então quando B muda, quem precisa reverificar é A, e transitivamente quem
 * consome A. A aresta salva no grafo é "A consome B" (a direção de dependência RUNTIME); a
 * propagação de afetados anda ao CONTRÁRIO dela.
 *
 * Armadilha "ciclo em consome" (Passo 4): a fila de propagação usa um `Set` de visitados
 * (`afetados`) — um nó só entra na fila UMA vez, então um ciclo A→B→A não trava o cálculo, só faz a
 * busca visitar o mesmo par de nós e parar por falta de novidade. Não há proteção ESPECIAL contra
 * ciclo porque a busca por visitados já é, por construção, imune a ele.
 */
export function calcularAfetados(grafo, caminhosBrutos) {
  if (grafo.ilegivel) {
    return { tudo: true, motivo: 'module.json ilegivel em pelo menos um modulo — grafo de consome incompleto' };
  }

  const afetados = new Set();
  const disparaPropagacao = new Set();
  let raiz = false;

  for (const caminho of caminhosBrutos) {
    if (caminho === null) {
      return { tudo: true, motivo: 'caminho fora da raiz do projeto (fora de modules/, adapters/, src/, packages/, tools/ e da propria raiz)' };
    }

    const classe = classificarCaminho(caminho, grafo);

    if (classe.tipo === 'tudo') return { tudo: true, motivo: classe.motivo };

    if (classe.tipo === 'fiacao') {
      raiz = true;
      continue;
    }

    if (classe.tipo === 'packages') {
      raiz = true;
      for (const id of grafo.modulos.keys()) {
        afetados.add(id);
        disparaPropagacao.add(id);
      }
      continue;
    }

    // classe.tipo === 'modulo'
    afetados.add(classe.id);
    if (!classe.somenteTeste) disparaPropagacao.add(classe.id);
  }

  const reversa = construirReversa(grafo);
  const fila = [...disparaPropagacao];
  while (fila.length > 0) {
    const atual = fila.pop();
    for (const consumidor of reversa.get(atual) ?? []) {
      if (afetados.has(consumidor)) continue;
      afetados.add(consumidor);
      fila.push(consumidor);
    }
  }

  return { tudo: false, raiz, modulos: [...afetados].sort() };
}

// ================================================================================================
// SAIDA
// ================================================================================================

/**
 * Formato texto: um id por linha (o formato que qualquer CI consome com `xargs`/`for`). `(tudo)` e
 * `(root)` são sentinelas entre parênteses — nenhum id de módulo passa pela regra `manifesto`
 * (nomes de pasta, sem parênteses) com essa forma, então não colidem por acidente com um módulo
 * real. "Tudo" nunca fica indistinguível de "todos os módulos happen to ser a lista inteira": são
 * dois campos (`tudo` e `modules`) que nunca aparecem preenchidos ao mesmo tempo.
 */
function formatarTexto(resultado) {
  if (resultado.tudo) return '(tudo)\n';
  const linhas = resultado.raiz ? ['(root)', ...resultado.modulos] : [...resultado.modulos];
  return linhas.length > 0 ? `${linhas.join('\n')}\n` : '';
}

function formatarJson(resultado) {
  const objeto = resultado.tudo
    ? { tudo: true, motivo: resultado.motivo, raiz: null, modulos: null }
    : { tudo: false, motivo: null, raiz: resultado.raiz, modulos: resultado.modulos };
  return `${JSON.stringify(objeto, null, 2)}\n`;
}

// ================================================================================================
// AUTOTESTE — a prova por máquina (lei 6: sem prova, não entra). `cases.mjs` prova REGRA do gate;
// este script não é regra, então prova a si mesmo, aqui dentro, com fixture em memória — sem tocar
// disco, do mesmo jeito que `calcularAfetados` foi desenhada para permitir.
// ================================================================================================

function grafoDeTeste() {
  return {
    ilegivel: false,
    modulos: new Map([
      ['a', { consome: [] }],
      ['b', { consome: ['a'] }],
      ['c', { consome: ['b'] }],
      ['solto', { consome: [] }],
    ]),
  };
}

function grafoComCiclo() {
  return {
    ilegivel: false,
    modulos: new Map([
      ['a', { consome: ['b'] }],
      ['b', { consome: ['a'] }],
    ]),
  };
}

function mesmoConjunto(lista, esperada) {
  const a = [...lista].sort();
  const b = [...esperada].sort();
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

function resultadoBate(resultado, esperado) {
  if (resultado.tudo !== esperado.tudo) return false;
  if (resultado.tudo) return true;
  if (resultado.raiz !== esperado.raiz) return false;
  return mesmoConjunto(resultado.modulos, esperado.modulos);
}

/** Os casos mínimos exigidos pelo plano, mais os que a implementação revelou precisarem de prova. */
function casosDeAutoteste() {
  return [
    {
      nome: 'cadeia transitiva de tres modulos (a muda -> b e c tambem, "solto" fica de fora)',
      grafo: grafoDeTeste(),
      caminhos: ['modules/a/core/domain/index.ts'],
      esperado: { tudo: false, raiz: false, modulos: ['a', 'b', 'c'] },
    },
    {
      nome: 'caminho desconhecido vira "tudo"',
      grafo: grafoDeTeste(),
      caminhos: ['docker-compose.yml'],
      esperado: { tudo: true },
    },
    {
      nome: 'arquivo apagado / modulo que nao existe mais vira "tudo"',
      grafo: grafoDeTeste(),
      caminhos: ['modules/removido/core/domain/index.ts'],
      esperado: { tudo: true },
    },
    {
      nome: 'module.json ilegivel vira "tudo", mesmo com o resto do grafo saudavel',
      grafo: { ilegivel: true, modulos: new Map() },
      caminhos: ['modules/a/core/domain/index.ts'],
      esperado: { tudo: true },
    },
    {
      nome: 'ciclo em consome nao trava o calculo (a <-> b)',
      grafo: grafoComCiclo(),
      caminhos: ['modules/a/core/domain/index.ts'],
      esperado: { tudo: false, raiz: false, modulos: ['a', 'b'] },
    },
    {
      nome: 'mudanca em packages/ alcanca todos os modulos e a raiz',
      grafo: grafoDeTeste(),
      caminhos: ['packages/ports/index.ts'],
      esperado: { tudo: false, raiz: true, modulos: ['a', 'b', 'c', 'solto'] },
    },
    {
      nome: 'mudanca so em tests/ de um modulo nao arrasta os consumidores',
      grafo: grafoDeTeste(),
      caminhos: ['modules/a/tests/domain/test_a.py'],
      esperado: { tudo: false, raiz: false, modulos: ['a'] },
    },
    {
      nome: 'adapters/ afeta a raiz mas nenhum modulo (adapter e injetado, nao importado)',
      grafo: grafoDeTeste(),
      caminhos: ['adapters/memory/index.ts'],
      esperado: { tudo: false, raiz: true, modulos: [] },
    },
    {
      nome: 'src/ afeta a raiz mas nenhum modulo (composicao nao e codigo de modulo)',
      grafo: grafoDeTeste(),
      caminhos: ['src/composicao.ts'],
      esperado: { tudo: false, raiz: true, modulos: [] },
    },
    {
      nome: 'tools/ (o proprio verificador) vira "tudo"',
      grafo: grafoDeTeste(),
      caminhos: ['tools/gate/validate.mjs'],
      esperado: { tudo: true },
    },
    {
      nome: 'config/policy da raiz vira "tudo" (cai no default, nenhum prefixo reconhecido)',
      grafo: grafoDeTeste(),
      caminhos: ['config/verificacao.json'],
      esperado: { tudo: true },
    },
    {
      nome: 'caminho fora da raiz do projeto (normalizarCaminho devolveu null) vira "tudo"',
      grafo: grafoDeTeste(),
      caminhos: [null],
      esperado: { tudo: true },
    },
    {
      nome: 'dois modulos folha independentes mudando juntos: uniao dos afetados, sem ciclo espurio',
      grafo: grafoDeTeste(),
      caminhos: ['modules/a/core/domain/index.ts', 'modules/solto/core/domain/index.ts'],
      esperado: { tudo: false, raiz: false, modulos: ['a', 'b', 'c', 'solto'] },
    },
    {
      nome: 'lista vazia de caminhos nao afeta nada (nem "tudo", nem raiz, nem modulo)',
      grafo: grafoDeTeste(),
      caminhos: [],
      esperado: { tudo: false, raiz: false, modulos: [] },
    },
  ];
}

/** Prova de `normalizarCaminho` — a armadilha de Windows (`\`, absoluto x relativo) isolada. */
function casosDeNormalizacao() {
  const raiz = 'C:\\tmp\\projeto';
  return [
    { bruto: 'modules\\a\\core\\domain\\index.ts', esperado: 'modules/a/core/domain/index.ts' },
    { bruto: 'modules/a/core/domain/index.ts', esperado: 'modules/a/core/domain/index.ts' },
    { bruto: 'C:\\tmp\\projeto\\modules\\a\\core\\domain\\index.ts', esperado: 'modules/a/core/domain/index.ts' },
    { bruto: '..\\fora\\arquivo.ts', esperado: null },
    { bruto: 'C:\\tmp\\outro-projeto\\arquivo.ts', esperado: null },
  ].map((c) => ({ ...c, raiz }));
}

function rodarAutoteste() {
  let falhas = 0;

  for (const caso of casosDeAutoteste()) {
    const resultado = calcularAfetados(caso.grafo, caso.caminhos);
    const ok = resultadoBate(resultado, caso.esperado);
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)}\n`);
      process.stdout.write(`       obtido:   ${JSON.stringify(resultado)}\n`);
    }
  }

  for (const caso of casosDeNormalizacao()) {
    const obtido = normalizarCaminho(caso.bruto, caso.raiz);
    const ok = obtido === caso.esperado;
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} normalizarCaminho(${JSON.stringify(caso.bruto)})\n`);
    if (!ok) {
      falhas += 1;
      process.stdout.write(`       esperado: ${JSON.stringify(caso.esperado)} obtido: ${JSON.stringify(obtido)}\n`);
    }
  }

  const total = casosDeAutoteste().length + casosDeNormalizacao().length;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function lerOpcoes(argv) {
  const flagsComValor = new Set(['--desde', '--raiz']);
  const opcoes = { autoteste: false, json: false, desde: null, raiz: null, caminhos: [] };

  for (let indice = 0; indice < argv.length; indice += 1) {
    const atual = argv[indice];
    if (atual === '--autoteste') { opcoes.autoteste = true; continue; }
    if (atual === '--json') { opcoes.json = true; continue; }
    if (flagsComValor.has(atual)) {
      opcoes[atual.slice(2)] = argv[indice + 1] ?? null;
      indice += 1;
      continue;
    }
    opcoes.caminhos.push(atual);
  }
  return opcoes;
}

/** `null` quando não há entrada nenhuma (nem argumento, nem `--desde`, nem stdin com dado). */
function lerCaminhosDeEntrada(opcoes, raizProjeto) {
  if (opcoes.desde !== null) return caminhosAlteradosDesde(opcoes.desde, raizProjeto);
  if (opcoes.caminhos.length > 0) return opcoes.caminhos;
  if (process.stdin.isTTY) return null;
  return readFileSync(0, 'utf8').split(/\r?\n/).filter((linha) => linha.trim() !== '');
}

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  const raizProjeto = opcoes.raiz !== null ? resolve(process.cwd(), opcoes.raiz) : acharRaizProjeto(process.cwd());
  const brutos = lerCaminhosDeEntrada(opcoes, raizProjeto);
  if (brutos === null) {
    process.stderr.write(
      'uso: node tools/affected.mjs <caminho...>\n'
      + '     node tools/affected.mjs --desde <ref>\n'
      + '     <algo que lista arquivos> | node tools/affected.mjs\n'
      + '     node tools/affected.mjs --autoteste\n',
    );
    return 1;
  }

  const grafo = montarGrafo(raizProjeto);
  const normalizados = brutos.map((bruto) => normalizarCaminho(bruto, raizProjeto));
  const resultado = calcularAfetados(grafo, normalizados);
  process.stdout.write(opcoes.json ? formatarJson(resultado) : formatarTexto(resultado));
  return 0;
}

// Só executa quando ESTE arquivo é o entrypoint — mesma guarda de `generate-lint-config.mjs`: importar
// as funções puras (num hook, num teste) não pode ter o efeito colateral de rodar o CLI.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
