#!/usr/bin/env node
/**
 * verificar-commit.mjs — a lógica por trás dos hooks de git do template.
 * Lei dona: nenhuma — ferramenta, como `afetados.mjs` e `sincronizar-env.mjs`: não é regra de gate,
 * não tem id, não conta para as regras com caso do catálogo.
 *
 *   node ferramentas/verificar-commit.mjs pre-commit   camada de SEGUNDOS (03-operacao.md §7):
 *                                                       gate nos módulos AFETADOS pelo staged + env +
 *                                                       formato + lint
 *   node ferramentas/verificar-commit.mjs pre-push     camada de DEZENAS DE SEGUNDOS: tipos e testes
 *                                                       dos módulos afetados desde o upstream
 *   node ferramentas/verificar-commit.mjs --autoteste  a prova por máquina deste arquivo (§ZERO SHELL)
 *
 * ============================================================================================
 * UMA IMPLEMENTAÇÃO PARA OS TRÊS BINDINGS, DE PROPÓSITO.
 *
 * `.githooks/pre-commit` e `.githooks/pre-push` são o MESMO arquivo, byte a byte, nos três bindings
 * — prova em `gate/testes/casos.mjs`. Cada um só delega para cá com duas linhas de shell. Detectar o
 * binding (package.json × pyproject.toml) e decidir os comandos é trabalho DESTE script, não do
 * hook: a alternativa — três pares de hook com lógica própria — é exatamente o custo medido que
 * cancelou a G.2 (seis arquivos que precisam concordar, nada verificando que concordam). Aqui há uma
 * fonte só, e os hooks não podem divergir porque não carregam lógica nenhuma para divergir.
 * ============================================================================================
 *
 * ZERO SHELL, DE PROPÓSITO — histórico do defeito, para quem for mexer aqui de novo.
 *
 * A primeira versão rodava `spawnSync(comando, args, { shell: true })` porque, sem shell, `npm` no
 * Windows dava `ENOENT` (resolve para `.cmd`, que `spawnSync` sem shell não encontra). O diagnóstico
 * estava certo; a saída, não: `shell: true` concatena `args` numa STRING ÚNICA sem citação, e o id do
 * módulo — nome de PASTA, vindo de `readdirSync` via `listarModulos`, nunca validado antes de virar
 * argumento — entra ali inteiro. Uma pasta `modulos/x&echo INJETADO/` bastava para rodar `echo
 * INJETADO` como comando separado, E o resultado ainda saía "ok" — porque com shell o `status` é do
 * ÚLTIMO comando da cadeia (`echo`, que sempre sai 0), não do `validar.mjs` que já tinha falhado.
 * Ferramenta ausente/comando errado virando "ok" é a lei 7 do gate quebrada por dentro do hook que
 * existe para cobri-la.
 *
 * O conserto: NUNCA shell. `npm`/`npx`/`tsc` são scripts Node — resolvidos pelo campo `bin` do
 * `package.json` deles e rodados com `process.execPath` direto no arquivo `.js`, sem passar pelo shim
 * `.cmd`/`.sh` nenhuma vez (a mesma técnica de `hooks/padrao-limiares.js:entrypointDoProjeto` — não
 * importada de lá porque `hooks/` é do agente Claude Code e nunca viaja para o projeto gerado; o
 * raciocínio é o mesmo, a cópia é porque a fonte não pode ser dependência de `ferramentas/`).
 * `ruff`/`mypy`/`pytest` não são scripts Node — rodam via `<python> -m <ferramenta>`, a MESMA forma
 * que `verificar.py` já usa pelo motivo que ele já documenta (`_resolver`: "ferramenta Python roda
 * pelo interpretador ATUAL, nunca pelo PATH — `shutil.which` não enxerga um venv não ativado"). Medi
 * a alternativa (achar `ruff.exe`/`mypy.exe`/`pytest.exe` em `Scripts/`) e descartei: exigiria saber
 * ONDE fica o venv, que este script não tem como inferir sem inventar convenção nova; `-m` funciona
 * com qualquer interpretador já resolvido, do mesmo jeito nos dois SO. Em nenhum dos dois casos um
 * argumento de usuário (id de módulo, caminho) passa por um interpretador de shell — nunca há `&`,
 * `;`, `|` para interpretar, porque não há shell nenhum lendo a linha de comando.
 *
 * STAGED × WORKING TREE — decisão tomada e declarada aqui, não escondida.
 *
 * `pre-commit` decide O QUE verificar a partir do staged (`git diff --cached --name-only`), mas o
 * GATE em si (`validar.mjs`) lê a ÁRVORE DE TRABALHO, não o índice. Um arquivo com alteração
 * NÃO-staged no meio do caminho pode fazer o veredito não ser exatamente sobre o que será commitado.
 * A forma rigorosa — índice temporário (`git stash --keep-index`) ou checkout do blob staged para
 * uma pasta paralela — é lenta e arriscada para um hook de SEGUNDOS, e arriscar corromper o working
 * tree do autor por um hook é pior que o limite que ele evita. A escolha pragmática: verificar a
 * árvore, e declarar o limite aqui e em `ferramentas/gate/README.md` — nunca escondê-lo. Quem precisa
 * do veredito exato sobre o staged sozinho roda `git stash -k -u` manualmente antes de verificar.
 *
 * `--no-verify` FURA este hook, por desenho do próprio git — não há como um hook impedir isso. É o
 * limite declarado: quem cobra SEM esse furo é o CI, nunca o hook local (03-operacao.md §7, mesma
 * frase de `hooks/README.md` na base: "Quem protege o repositório independente de quem edita é o CI").
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { acharRaizProjeto, listarModulos } from './gate/contexto.mjs';
import { calcularAfetados, montarGrafo, normalizarCaminho } from './afetados.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = acharRaizProjeto(AQUI);
/** O MESMO Node que roda este script — nunca a string `'node'` resolvida de novo por PATH. */
const NODE = process.execPath;

function escrever(texto) {
  process.stdout.write(texto);
}

/** Comando de git que não pode derrubar o hook por si só — falha vira lista vazia, nunca exceção. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  } catch {
    return '';
  }
}

function linhas(texto) {
  return texto.split(/\r?\n/).filter((linha) => linha.trim() !== '');
}

function caminhosStaged() {
  return linhas(git(['diff', '--cached', '--name-only']));
}

/** `null` quando não há upstream (primeiro push do branch) — o chamador então verifica TUDO. */
function refDoUpstream() {
  try {
    execFileSync('git', ['rev-parse', '--abbrev-ref', '@{u}'], { cwd: RAIZ, encoding: 'utf8' });
    return '@{u}';
  } catch {
    return null;
  }
}

function calcularAfetadosDe(caminhosBrutos) {
  const grafo = montarGrafo(RAIZ);
  const normalizados = caminhosBrutos.map((bruto) => normalizarCaminho(bruto, RAIZ));
  return calcularAfetados(grafo, normalizados);
}

/** Binding do projeto pelo manifesto de pacote presente na raiz — a mesma pergunta de `verificar.py`. */
function binding() {
  if (existsSync(join(RAIZ, 'package.json'))) return 'node';
  if (existsSync(join(RAIZ, 'pyproject.toml'))) return 'python';
  return null;
}

// ================================================================================================
// EXECUÇÃO — o único ponto que toca `spawnSync`, sempre sem shell. `--autoteste` exercita ESTE ponto
// (não uma cópia), então uma regressão para `shell: true` aqui derruba produção E o autoteste juntos.
// ================================================================================================

function executar(executavel, args, opcoesExtra = {}) {
  return spawnSync(executavel, args, { cwd: RAIZ, stdio: 'inherit', shell: false, ...opcoesExtra });
}

/**
 * PURA: decide se um resultado de `spawnSync` conta como "ok". Separada de `executar`/`rodar` para o
 * `--autoteste` provar as três formas de "não rodou" com fixtures sintéticas — sem matar processo de
 * verdade nem depender de SO (o mesmo raciocínio de `afetados.mjs`: metade que toca processo, metade
 * pura que o autoteste alcança sem I/O). Lei 7 do gate: ferramenta ausente REPROVA, nunca "ok".
 */
function avaliarResultado(resultado) {
  if (resultado.error !== undefined) {
    return { ok: false, motivo: `ferramenta ausente ou não executável — ${resultado.error.code ?? resultado.error.message}` };
  }
  if (resultado.status === null) {
    return { ok: false, motivo: `processo encerrado pelo sinal ${resultado.signal ?? '?'} — nunca terminou` };
  }
  return { ok: resultado.status === 0, motivo: resultado.status === 0 ? null : `saiu com código ${resultado.status}` };
}

function reportar(rotulo, ok, motivo) {
  if (!ok && motivo !== null) escrever(`  ! ${rotulo}: ${motivo}\n`);
  escrever(`${ok ? '  ok   ' : '  FALHA'} ${rotulo}\n`);
  return ok;
}

/** Roda um passo já resolvido para um executável real (nunca um nome que precise de PATH+shell). */
function rodar(rotulo, executavel, args, cwd = RAIZ) {
  const { ok, motivo } = avaliarResultado(executar(executavel, args, { cwd }));
  return reportar(rotulo, ok, motivo);
}

function ferramentaAusente(rotulo, oQueFalta) {
  return reportar(rotulo, false, `ferramenta ausente — ${oQueFalta}`);
}

// ================================================================================================
// RESOLUÇÃO DE FERRAMENTA — sempre um ARQUIVO/EXECUTÁVEL real, nunca uma string que dependa de PATH
// resolvido por shell. Ver o cabeçalho do arquivo para o porquê.
// ================================================================================================

/**
 * O entrypoint JS de um pacote instalado em `<raizNode>/node_modules/<pastaPacote>`, pelo campo `bin`
 * do manifesto dele. Técnica de `hooks/padrao-limiares.js:entrypointDoProjeto` (comentário no topo do
 * arquivo explica por que a função é copiada, não importada). `chaveBin` existe porque `bin` é um MAPA
 * por comando, e a chave pode divergir do nome da pasta (`typescript` publica o comando `tsc`).
 */
function entrypointDoPacote(raizNode, pastaPacote, chaveBin = pastaPacote) {
  const pasta = join(raizNode, 'node_modules', pastaPacote);
  try {
    const { bin } = JSON.parse(readFileSync(join(pasta, 'package.json'), 'utf8'));
    const relativo = typeof bin === 'string' ? bin : bin?.[chaveBin];
    if (!relativo) return null;
    const alvo = join(pasta, relativo);
    return existsSync(alvo) ? alvo : null;
  } catch {
    return null;
  }
}

/**
 * `npm`/`npx` não são dependência do PROJETO — vêm empacotados ao lado do próprio binário `node`.
 * Dois layouts candidatos: Windows (irmão do `node.exe`) e POSIX (`lib/node_modules`, um nível acima
 * do `bin/`). O primeiro que existir vence; nenhum shell nem `.cmd` envolvido.
 */
function entrypointDoNpm(pacote) {
  const raizNode = dirname(NODE);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const achado = entrypointDoPacote(candidato, pacote);
    if (achado !== null) return achado;
  }
  return null;
}

function rodarNpm(rotulo, args, cwd = RAIZ) {
  const entrada = entrypointDoNpm('npm');
  if (entrada === null) return ferramentaAusente(rotulo, 'npm (node_modules/npm do próprio Node.js — instalação corrompida?)');
  return rodar(rotulo, NODE, [entrada, ...args], cwd);
}

function rodarTsc(rotulo, args, cwd = RAIZ) {
  const entrada = entrypointDoPacote(RAIZ, 'typescript', 'tsc');
  if (entrada === null) return ferramentaAusente(rotulo, 'typescript (node_modules/typescript ausente — "npm install"?)');
  return rodar(rotulo, NODE, [entrada, ...args], cwd);
}

/**
 * O interpretador Python, memoizado por processo. `SARAK_PYTHON` sobrepõe (mesmo vocabulário de
 * `SARAK_NODE` em `verificar.py`); senão tenta `python` e `python3`, na ordem — sem shell, então um
 * nome que não exista devolve `ENOENT`/status≠0 aqui, nunca dispara um resolvedor de PATH de shell.
 */
let pythonResolvido;
function resolverPython() {
  if (pythonResolvido !== undefined) return pythonResolvido;
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter((c) => Boolean(c));
  pythonResolvido = candidatos.find((c) => executar(c, ['--version'], { stdio: 'ignore' }).status === 0) ?? null;
  return pythonResolvido;
}

function rodarPython(rotulo, modulo, args, cwd = RAIZ) {
  const python = resolverPython();
  if (python === null) return ferramentaAusente(rotulo, 'python (nem "python" nem "python3" no PATH; ou defina SARAK_PYTHON)');
  return rodar(rotulo, python, ['-m', modulo, ...args], cwd);
}

// ================================================================================================
// OS PASSOS
// ================================================================================================

function idDoPrimeiroModulo() {
  const pastas = listarModulos(RAIZ);
  return pastas.length > 0 ? basename(pastas[0]) : null;
}

function idsDosModulos() {
  return listarModulos(RAIZ).map((pasta) => basename(pasta));
}

/**
 * O gate propriamente dito, escopado pelo resultado de `afetados.mjs`.
 *
 * `(tudo)` roda tudo e IMPRIME O MOTIVO — hook que fica lento em silêncio é hook que o time desativa
 * sem saber por quê. `(raiz)` sem módulo nenhum ainda precisa cobrar as regras de escopo raiz: elas
 * rodam em QUALQUER invocação de `validar.mjs` com ao menos um módulo no projeto
 * (`motor.mjs:rodarRegrasDeRaiz` usa `contextos[0].projeto`, não o alvo pedido) — por isso basta
 * passar UM módulo qualquer como referência, não `--todos`.
 */
function rodarGate(resultado) {
  const validar = join('ferramentas', 'gate', 'validar.mjs');
  if (resultado.tudo) {
    escrever(`  (tudo) — ${resultado.motivo}\n`);
    return rodar('gate (--todos)', NODE, [validar, '--todos']);
  }

  const alvos = [...resultado.modulos];
  if (alvos.length === 0 && resultado.raiz) {
    const referencia = idDoPrimeiroModulo();
    if (referencia !== null) alvos.push(referencia);
    else escrever('  (raiz) — projeto ainda sem nenhum modulo: regras de raiz ficam pendentes ate o primeiro\n');
  }
  if (alvos.length === 0) {
    escrever('  gate: nada nesta area afeta modulo ou raiz\n');
    return true;
  }

  escrever(`  modulo(s) afetado(s): ${alvos.join(', ')}${resultado.raiz ? ' + (raiz)' : ''}\n`);
  return alvos.every((id) => rodar(`gate: ${id}`, NODE, [validar, id]));
}

function formatoELint() {
  const bind = binding();
  if (bind === 'node') {
    return [
      () => rodarNpm('formato (prettier --check)', ['run', 'formato']),
      () => rodarNpm('lint (eslint)', ['run', 'lint']),
    ];
  }
  if (bind === 'python') {
    return [
      () => rodarPython('formato (ruff format --check)', 'ruff', ['format', '--check', '.']),
      () => rodarPython('limiares (ruff check)', 'ruff', ['check', '.']),
    ];
  }
  return [() => { escrever('  ! nenhum package.json nem pyproject.toml na raiz — formato/lint pulados\n'); return true; }];
}

function preCommit() {
  const resultado = calcularAfetadosDe(caminhosStaged());
  escrever('[pre-commit] gate nos modulos afetados\n');
  const passos = [() => rodarGate(resultado), () => rodarSincronizarEnv()];
  passos.push(...formatoELint());
  return concluir(passos);
}

/** `sincronizar-env.mjs` é sempre Node, nos dois bindings — não passa por `formatoELint`. */
function rodarSincronizarEnv() {
  return rodar('env (.env.example)', NODE, [join('ferramentas', 'sincronizar-env.mjs'), '--conferir']);
}

/** Tipos e testes de UM módulo Node, escopados pelo workspace — nunca o repositório inteiro. */
function tiposETestesDoModuloNode(id) {
  const alvo = `--workspace=modulos/${id}`;
  return [
    () => rodarNpm(`tipos: ${id}`, ['run', 'tipos', alvo, '--if-present']),
    () => rodarNpm(`testes: ${id}`, ['test', alvo, '--if-present']),
  ];
}

/** Tipos e testes de UM módulo Python — de dentro da pasta dele, a mesma condição de `verificar.py`. */
function tiposETestesDoModuloPython(id) {
  const pasta = join(RAIZ, 'modulos', id);
  return [
    () => rodarPython(`tipos: ${id}`, 'mypy', ['.'], pasta),
    () => rodarPython(`testes: ${id}`, 'pytest', ['-q'], pasta),
  ];
}

function prePush() {
  const ref = refDoUpstream();
  const resultado = ref === null
    ? { tudo: true, motivo: 'sem upstream (@{u}) — primeiro push do branch, verifica tudo' }
    : calcularAfetadosDe(linhas(git(['diff', '--name-only', '--no-renames', ref])));

  escrever('[pre-push] tipos e testes nos modulos afetados\n');
  const bind = binding();
  if (bind === null) {
    escrever('  ! nenhum package.json nem pyproject.toml na raiz — tipos/testes pulados\n');
    return concluir([]);
  }

  // `_template` fica de fora: não é workspace npm ("workspaces": ["modulos/[a-z]*", ...] — o
  // padrão já exclui o molde DE PROPÓSITO, package.json:"//workspaces" explica o motivo), então
  // `npm run tipos --workspace=modulos/_template` sempre falha com "No workspaces found", mesmo
  // sem nada errado no molde. `criar-modulo.mjs`/`criar-projeto.mjs` já tratam `_template` como não
  // sendo um pacote publicável pelo mesmo motivo — aqui é a mesma exclusão, não uma nova regra.
  const semMolde = (id) => !id.startsWith('_');
  const alvos = (resultado.tudo ? idsDosModulos() : [...resultado.modulos]).filter(semMolde);
  const cobreRaiz = resultado.tudo || resultado.raiz;
  if (resultado.tudo) escrever(`  (tudo) — ${resultado.motivo}\n`);
  else escrever(`  modulo(s) afetado(s): ${alvos.join(', ') || '(nenhum)'}${cobreRaiz ? ' + (raiz)' : ''}\n`);

  const passos = [];
  if (cobreRaiz) {
    passos.push(bind === 'node'
      ? () => rodarTsc('tipos: raiz', ['--noEmit'])
      : () => rodarPython('tipos: raiz', 'mypy', ['.']));
  }
  for (const id of alvos) {
    passos.push(...(bind === 'node' ? tiposETestesDoModuloNode(id) : tiposETestesDoModuloPython(id)));
  }
  if (passos.length === 0) escrever('  nada nesta area afeta modulo ou raiz\n');
  return concluir(passos);
}

function concluir(passos) {
  const resultados = passos.map((passo) => passo());
  const falhas = resultados.filter((ok) => !ok).length;
  escrever(`\nverificar-commit: ${falhas === 0 ? 'OK' : `REPROVADO — ${falhas} passo(s)`}\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — a prova por máquina de que NENHUM argumento passa por shell (lei 6: sem prova, não
// entra). Não spawna o gate nem toca em módulo real: prova o PONTO ÚNICO (`executar`/`avaliarResultado`)
// que produção usa, o mesmo raciocínio de `afetados.mjs --autoteste` para a metade pura dele.
// ================================================================================================

/** Fixtures sintéticas de `spawnSync` — nenhuma toca processo de verdade. Prova as 3 formas de "não rodou". */
function casosDeAvaliarResultado() {
  return [
    { nome: 'status 0 conta como ok', resultado: { status: 0, error: undefined, signal: null }, esperado: true },
    { nome: 'status != 0 REPROVA', resultado: { status: 1, error: undefined, signal: null }, esperado: false },
    { nome: 'error de spawn (ENOENT) REPROVA, nunca "ok"', resultado: { status: null, error: { code: 'ENOENT' }, signal: null }, esperado: false },
    { nome: 'status null sem error (morto por sinal) REPROVA', resultado: { status: null, error: undefined, signal: 'SIGKILL' }, esperado: false },
  ];
}

/**
 * O alvo hostil do relatório de segurança: nome de PASTA com `&` — o separador de comando que
 * `shell: true` respeitava. Roda pelo MESMO `executar()` de produção, capturando stdio (produção usa
 * `inherit`) só para o autoteste conseguir inspecionar o que o processo filho recebeu.
 *
 * O discriminador é IGUALDADE EXATA, não "contém INJETADO" — "INJETADO" é substring do PRÓPRIO
 * payload hostil (`echo INJETADO`), então ele aparece na saída também no caso SEGURO, onde o processo
 * filho ecoa `process.argv[1]` literal. O que muda com `shell: true` é a IGUALDADE: o `&` vira
 * separador de comando, o `node -e` recebe só `"x"` como argumento, e `echo INJETADO` roda como
 * comando SEPARADO — a saída deixa de ser exatamente o payload original. Medido: revertendo `shell:
 * false` para `true` em `executar()`, este caso passa a FALHAR (ver relatório da correção).
 */
function casoAlvoHostil() {
  const hostil = 'x&echo INJETADO';
  const resultado = executar(NODE, ['-e', 'process.stdout.write(process.argv[1] ?? "")', hostil], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return String(resultado.stdout ?? '') === hostil;
}

/** O caso sem má-fé nenhuma: nome de módulo com espaço não pode virar dois argumentos. */
function casoNomeComEspaco() {
  const nome = 'meu modulo';
  const resultado = executar(NODE, ['-e', 'process.stdout.write(process.argv[1] ?? "")', nome], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return String(resultado.stdout ?? '') === nome;
}

function rodarAutoteste() {
  let falhas = 0;
  const registrar = (nome, ok) => {
    escrever(`  ${ok ? 'ok   ' : 'FALHA'} ${nome}\n`);
    if (!ok) falhas += 1;
  };

  for (const caso of casosDeAvaliarResultado()) {
    registrar(caso.nome, avaliarResultado(caso.resultado).ok === caso.esperado);
  }
  registrar('alvo hostil ("x&echo INJETADO"): chega literal, nada injetado, zero shell', casoAlvoHostil());
  registrar('nome com espaco ("meu modulo"): chega como UM argumento, nao dois', casoNomeComEspaco());

  const total = casosDeAvaliarResultado().length + 2;
  escrever(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function principal() {
  const modo = process.argv[2];
  if (modo === '--autoteste') return rodarAutoteste();
  if (modo === 'pre-commit') return preCommit();
  if (modo === 'pre-push') return prePush();
  process.stderr.write('uso: node ferramentas/verificar-commit.mjs pre-commit | pre-push | --autoteste\n');
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
