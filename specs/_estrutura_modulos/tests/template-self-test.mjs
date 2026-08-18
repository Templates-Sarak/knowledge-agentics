#!/usr/bin/env node
/**
 * template-self-test.mjs — prova que o TEMPLATE gera projeto que passa na própria cadeia que ele
 * prescreve.
 *
 *   node template-self-test.mjs [--binding typescript] [--manter] [--autoteste]
 *
 * Fora de `tools/` DE PROPÓSITO: este script é consumido por quem MANTÉM o template, nunca por um
 * projeto gerado — `create-project.mjs` copia `tools/` inteiro para o destino, e um script de teste
 * ali viajaria como fixture morta, nascendo vermelha em todo projeto novo. Um projeto gerado não
 * gera projetos; este script ali seria peso sem consumidor.
 *
 * ESCOPO: as quatro combinações de flag de `create-module.mjs` (padrão, `--sem-artefato`,
 * `--sem-web`, as duas juntas) — ver `COMBINACOES_DE_MODULO` abaixo.
 *
 * NÚCLEO × CASCA, precedente de `tools/affected.mjs`/`ci-dependencies.mjs`/`ci-security.mjs`:
 * `passosDoBinding` (que passos rodam, em que ordem) e `classificarPasso` (como um resultado de
 * processo vira ok/reprovado) são puros — nenhuma linha toca `fs`, `child_process` ou o relógio. A
 * casca executa CADA passo por um único despachante (`executarPasso`) e nunca usa `shell: true`.
 *
 * TRÊS FORMAS DE "NÃO RODOU", NENHUMA VIRA "ok" (lei 7 do gate, aplicada a este autoteste): `error`
 * (o executável não resolveu — ENOENT), `status === null` (matado por sinal/timeout, nunca
 * terminou) e `status !== 0` (rodou e reprovou). As três passam por `classificarPasso` e as três
 * reprovam.
 *
 * LIMPEZA: a pasta temporária de cada binding é removida no `finally`, e uma falha de limpeza NUNCA
 * troca o exit code da verificação pelo da faxina (ela só avisa em stderr e seque adiante).
 *
 * `clone-simulado` — o passo que prova a outra metade da promessa: não basta o projeto NASCER
 * verde, ele precisa CONTINUAR verde depois de CLONADO, e gerar+verificar+apagar (sem nunca clonar)
 * não mede isso. `generated/` entra no `.gitignore` da raiz do jeito que anula o `.gitkeep` do
 * molde, e um projeto clonado de verdade nasce SEM a pasta que `artefato-declarado` exige. Sem rede
 * nem remoto (o script não pode depender de nenhum dos dois): `git init` + `git add -A` + `git
 * ls-files` na própria pasta temporária, e então apaga do disco, DENTRO de `modules/`, tudo que não
 * ficou rastreado — é a simulação mínima de "o que sobrevive a um clone", sem virar um projeto git
 * de verdade. O passo `verificar`, que já vem a seguir no pipeline, é quem lê o resultado: se o
 * `.gitignore` comeu estrutura, ele reprova ali, não aqui.
 *
 * `primeiro-commit` — a EXCEÇÃO deliberada de fronteira deste arquivo: é o único passo que sai de
 * `specs/_estrutura_modulos/` e chama `skills/git-verificacao-commit/scripts/verificar_commit.py`,
 * na BASE. Todo o resto deste script só toca o TEMPLATE (tools/, bindings/) porque só ele decide se
 * um projeto gerado nasce verde; mas "o repositório nasce COMMITÁVEL?" é uma pergunta sobre o
 * template **e** o gate de segredos **compostos** — e a base é dona dos dois. Medir isso sem sair
 * da base seria fingir medir. Roda sobre o STAGED que `clone-simulado` acabou de produzir (`git
 * init` + `git add -A`) e exige ZERO achado — nenhuma allowlist, nenhum `--no-verify`: achado aqui
 * é o template instalando o próprio vazamento.
 *
 * `criar-adapter:<porta>` — um passo POR PORTA do vocabulário (`tools/gate/ports-vocabulary.mjs`),
 * reusando o projeto que os passos acima já geraram: é a única forma automatizada, na agenda
 * semanal, de exercitar `create-adapter.mjs` de verdade. Sem isto, o gerador só era provado por
 * fixture — cópia do molde — e foi exatamente uma fixture que envelheceu sem ninguém comparar
 * (âncora Python, ramo de porta nova em TS/Python) que produziu os dois bugs da rodada anterior.
 * Varrer o vocabulário INTEIRO, em vez de citar `repositorio`/`verificadorDeToken` a dedo, cobre os
 * dois ramos do gerador que interessam — porta JÁ em `FABRICAS` (a maioria) e porta AUSENTE dela
 * (hoje só `verificadorDeToken`) — e cobre a porta nova sozinho no dia em que o vocabulário crescer
 * de novo (`fila` tem retorno prometido no comentário de `ports-vocabulary.mjs`), sem editar este
 * arquivo. Cada passo confere **exit 0 e conteúdo**: só o exit code não distingue "registrou" de
 * "não fez nada" — a classe exata dos dois bugs, em que a âncora não batia e o script abortava, mas
 * uma âncora que batesse errado por acidente escreveria algo sem ser o esperado e passaria calada.
 * Roda depois do ÚLTIMO `criar-modulo`, antes de `clone-simulado`: os `adapters/`/`src/composicao.*`
 * que ele escreve entram no commit simulado e são revalidados por `verify`/`verificar.py` a seguir,
 * de graça — nenhum passo novo depois disso, só reaproveitamento do que já roda.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORTAS_CONHECIDAS } from '../tools/gate/ports-vocabulary.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou o relógio.
// ================================================================================================

export const BINDINGS = ['typescript', 'javascript', 'python'];

/**
 * As QUATRO combinações de flag de `create-module.mjs` — o invariante é que *qualquer* combinação
 * produz módulo que passa em `verificar`, e "qualquer" só vira prova rodando as quatro, não uma. Um
 * id por combinação, para os quatro módulos conviverem no MESMO projeto (um só
 * `npm install`/`pip install`, um só `verificar` cobrindo os quatro via workspace/descoberta) —
 * repetir a cadeia inteira quatro vezes pagaria 4× o custo sem medir nada a mais.
 */
export const COMBINACOES_DE_MODULO = [
  // SEM hifen de propósito: o id vira `data.prefix` do módulo (`<id>_`), que nomeia TABELA — e
  // `schema-manifesto` exige `^[a-z][a-z0-9_]*$` para tabela (sem hífen), mais estrito que o do
  // próprio id (`^[a-z][a-z0-9-]*$`, que aceita hífen). Medido: `sonda-padrao` reprovava
  // `data.tables[0]: "sonda-padrao_metadados" nao casa o padrao` — o id em si é válido, a
  // tabela derivada dele não.
  //
  // CURTO de propósito, e é a SEGUNDA medição, não só a primeira: `<modulo>` entra em comentário de
  // CABEÇALHO em vários arquivos do molde Python (`api/src/erros.py:1`, o mais apertado, tem só 13
  // caracteres de folga antes de estourar os 110 do ruff). Ids mais longos ("sondasemartefato",
  // 16 chars) reprovam `ruff check` (E501) e `ruff format --check` no binding Python, sem relação
  // nenhuma com a flag testada — o comprimento do id é que importa. `sonda` (5) tinha
  // folga; estes quatro (6–8) mantêm a mesma folga.
  { id: 'sondapad', flags: [] },
  { id: 'sondaart', flags: ['--sem-artefato'] },
  { id: 'sondaweb', flags: ['--sem-web'] },
  { id: 'sondaamb', flags: ['--sem-artefato', '--sem-web'] },
];

/**
 * Um provedor por porta, kebab-case FIXO por ÍNDICE — nunca derivado do nome da porta. Armadilha
 * medida (rodada anterior): `verificadorDeToken` é camelCase, e um provedor
 * `prov-verificadorDeToken` é inválido — `create-adapter.mjs` REJEITA antes de tocar disco
 * (correto). Por índice sobrevive a qualquer nome de porta futuro, sem repensar.
 *
 * COM HÍFEN de propósito (prefixo `prov-`, não só a letra): `create-adapter.mjs` aceita provedor
 * kebab-case com hífen (`validarOpcoes`), e o código que ele gera para hífen já foi o achado ①
 * (ultimas-atualizacoes.md) — chave de objeto TS/JS não citada e import Python com `-` no meio do
 * caminho. Ficou consertado (chave CITADA nos três bindings, pasta/import Python convertidos pra
 * snake_case — ADR-011) exatamente PORQUE esta rede parou de esconder o defeito atrás de um
 * provedor sem hífen: o índice sozinho (`a`, `b`, ...) nunca exercitava o caminho quebrado. Manter
 * o hífen aqui é o que garante que uma regressão futura volte a pintar esta rede de vermelho.
 */
export function provedorDoIndice(indice) {
  return `prov-${String.fromCharCode(97 + indice)}`;
}

/** PascalCase a partir de kebab-case — mesma forma de `create-adapter.mjs:paraPascalCase`, COPIADA
 * (não importada: `create-adapter.mjs` chama `principal()` ao ser carregado fora de `--autoteste`,
 * e importar o módulo dispararia isso). O que este autoteste confirma é a PRESENÇA do símbolo no
 * arquivo gerado, não a lógica que o produz — essa já é `create-adapter.mjs --autoteste`. */
function paraPascalCase(kebab) {
  return kebab.split('-').map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1)).join('');
}

/** O nome que `create-adapter.mjs` registra em `src/composicao.*` para este binding+provedor —
 * mesma regra de `create-adapter.mjs:nomeDoProvedor`. */
export function nomeDoSimbolo(binding, provedor) {
  const pascal = paraPascalCase(provedor);
  return binding === 'python' ? pascal : `criar${pascal}`;
}

/**
 * Um passo `criar-adapter` por porta do VOCABULÁRIO INTEIRO (`ports-vocabulary.mjs`), não por uma
 * lista curada à mão — é o que faz uma porta nova (`fila`, se voltar) entrar na cobertura sozinha,
 * sem editar este arquivo. Ver o parágrafo "criar-adapter:<porta>" no cabeçalho.
 */
export function passosDeAdapter() {
  return PORTAS_CONHECIDAS.map((porta, indice) => ({
    nome: `criar-adapter:${porta}`,
    tipo: 'criar-adapter',
    porta,
    provedor: provedorDoIndice(indice),
  }));
}

/**
 * Os passos de UM binding, em ordem — a decisão de "o que rodar" separada de "como rodar".
 *
 * `verificar` ANTES de `build`, `build` ANTES de `lint` NÃO É ARBITRÁRIO: `npm run build` quebra
 * `npm run lint` porque o bundle minificado em `dist/` passa a ser lintado. Trocar a ordem faria
 * este autoteste deixar de medir esse defeito.
 *
 * Python não tem passo `build`/`lint` separado: o binding não empacota front-end (sem `web/` nos
 * módulos Python — medido, `bindings/python/_template` não tem pasta `web`), e `verificar.py` já
 * cobre forma + limiares + tipos + testes num só passo, como o `npm run verify` do lado Node.
 *
 * `rapido`: só a combinação PADRÃO (sem flag) — medido, as quatro juntas custam ~70s (TS) / ~52s
 * (JS), e o `--rapido` combinado (TS+JS) foi de ~25s para ~1m58s — bem em cima do teto de ~2min
 * para caber em pre-commit. Mesma solução que o binding Python já usa (`--rapido` pula Python
 * inteiro, cobrindo-o só na agenda): a combinatória cara fica para o run COMPLETO (agenda),
 * pre-commit continua rápido.
 *
 * `ci-dependencias` é o ÚLTIMO passo, nos três: incluí-lo cedo faria este autoteste nascer vermelho
 * por CVE de terceiro antes mesmo de o resto ser medido — um portão que nasce vermelho é um portão
 * que se aprende a ignorar.
 */
export function passosDoBinding(binding, { rapido = false } = {}) {
  const combinacoes = rapido ? COMBINACOES_DE_MODULO.slice(0, 1) : COMBINACOES_DE_MODULO;
  const gerarProjeto = { nome: 'gerar-projeto', tipo: 'gerar-projeto' };
  // As QUATRO combinações — ver COMBINACOES_DE_MODULO acima.
  const passosDeModulo = combinacoes.map((combinacao) => ({
    nome: `criar-modulo:${combinacao.id}`,
    tipo: 'criar-modulo',
    moduloId: combinacao.id,
    flags: combinacao.flags,
  }));
  // Depois do ÚLTIMO `criar-modulo`: reusa o projeto que os passos acima já geraram — custo
  // marginal, sem gerar mais nada. Ver "criar-adapter:<porta>" no cabeçalho.
  const passosAdapter = passosDeAdapter();
  // Ver `rodarPrettierWrite`/`rodarRuffFormat`: MESMO motivo nos dois bindings, so ferramenta
  // diferente. Ate a rodada que fechou o achado ① (hifen no provedor — ultimas-atualizacoes.md,
  // ADR-011), "ruff format ja bate, mesmo varrendo o vocabulario inteiro" era medido e verdadeiro
  // — porque `provedorDoIndice` so gerava provedor de UMA letra, sem hifen. Trocar para kebab COM
  // hifen (pra exercitar o proprio achado ①) engordou a linha de `FABRICAS` alem dos 110 cols do
  // ruff MESMO pro provedor mais curto possivel (medido: `repositorio` ja estava na borda, zero
  // folga, com provedor de uma letra so) — Python precisa do mesmo passo de formatacao que TS/JS
  // sempre teve, pelo mesmo motivo.
  const formatarAdapters = { nome: 'formatar-adapters', tipo: 'formatar-adapters' };
  const formatarAdaptersPy = { nome: 'formatar-adapters', tipo: 'formatar-adapters-py' };
  // Depois do ÚLTIMO `criar-modulo`, antes de `verificar`: o passo em si só poda o disco — quem lê
  // o resultado é o `verificar` que já vem a seguir no pipeline, nos dois bindings.
  const cloneSimulado = { nome: 'clone-simulado', tipo: 'clone-simulado' };

  // Logo depois do `clone-simulado` — a pergunta "este repositório nasce commitável?" só faz
  // sentido sobre o STAGED de um `git init` + `git add -A` reais, que é exatamente o que
  // `clone-simulado` acabou de produzir. Roda ANTES de `verificar`/`build`/`lint` de propósito: se
  // o repositório não commita, nada do resto importa. Alcança a skill `git-verificacao-commit`
  // (fora de `tools/`, fora do template) — deliberado: a pergunta só tem sentido com o template e o
  // gate de segredos COMPOSTOS, e a base é dona dos dois (declarado aqui, exceção de fronteira
  // declarada no cabeçalho deste arquivo).
  const primeiroCommit = { nome: 'primeiro-commit', tipo: 'primeiro-commit' };

  // Depois de `verificar`, nos dois bindings — o mapa instalado é doutrina, não código do módulo,
  // então não precisa esperar o `clone-simulado`: entra assim que o projeto existe. Sem esta linha,
  // `verify-map.mjs --conferir` seria um `--conferir` que existe e ninguém chama.
  const mapaInstalado = { nome: 'mapa', tipo: 'mapa-instalado' };

  if (binding === 'python') {
    return [
      gerarProjeto,
      { nome: 'venv', tipo: 'venv' },
      { nome: 'atualizar-pip', tipo: 'pip-upgrade' },
      { nome: 'instalar', tipo: 'pip-install' },
      ...passosDeModulo,
      ...passosAdapter,
      formatarAdaptersPy,
      cloneSimulado,
      primeiroCommit,
      { nome: 'verificar', tipo: 'verificar-py' },
      mapaInstalado,
      { nome: 'ci-dependencias', tipo: 'ci-dependencias-py' },
    ];
  }
  return [
    gerarProjeto,
    { nome: 'instalar', tipo: 'npm-install' },
    ...passosDeModulo,
    ...passosAdapter,
    formatarAdapters,
    cloneSimulado,
    primeiroCommit,
    { nome: 'verify', tipo: 'npm-script', script: 'verify' },
    mapaInstalado,
    { nome: 'build', tipo: 'npm-script', script: 'build' },
    { nome: 'lint', tipo: 'npm-script', script: 'lint' },
    { nome: 'ci-dependencias', tipo: 'npm-script', script: 'ci:dependencias' },
  ];
}

/**
 * Um resultado bruto de `spawnSync` vira `{ ok, motivo }`. As três formas de "não rodou" — `error`,
 * `status` nulo/indefinido, `status` não-zero — caem em `ok: false`. Nenhuma vira `ok: true`.
 */
export function classificarPasso(resultado) {
  if (resultado === null || resultado === undefined) {
    return { ok: false, motivo: 'nenhum resultado — passo nao foi executado' };
  }
  if (resultado.error !== undefined && resultado.error !== null) {
    return { ok: false, motivo: `erro ao executar: ${resultado.error.message ?? String(resultado.error)}` };
  }
  if (resultado.status === null || resultado.status === undefined) {
    return { ok: false, motivo: 'processo nao terminou (sem status — sinal ou timeout)' };
  }
  if (resultado.status !== 0) {
    return { ok: false, motivo: `saida ${resultado.status}` };
  }
  return { ok: true, motivo: null };
}

/**
 * Varre os resultados de um binding e para no PRIMEIRO passo que falhar (mesmo raciocínio do `&&`
 * dentro de `npm run verify`): passo que depende do anterior rodar sobre um estado que já não é
 * o que o passo espera não mede nada de novo, só duplica o mesmo defeito com outro nome.
 */
export function primeiroFalho(resultadosClassificados) {
  return resultadosClassificados.find((r) => !r.ok) ?? null;
}

// ================================================================================================
// CASCA — toca disco, `child_process` e ambiente. Cada acesso externo isolado num ponto nomeado.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..');
const CRIAR_PROJETO = join(RAIZ_TEMPLATE, 'tools', 'create-project.mjs');
const CRIAR_MODULO = join(RAIZ_TEMPLATE, 'tools', 'create-module.mjs');
const CRIAR_ADAPTER = join(RAIZ_TEMPLATE, 'tools', 'create-adapter.mjs');
const VERIFICAR_MAPA = join(AQUI, 'verify-map.mjs');
// A ÚNICA referência deste arquivo a `skills/` (fora do template) — ver o parágrafo "primeiro-commit"
// no cabeçalho, a exceção de fronteira declarada por escrito.
const RAIZ_BASE = join(RAIZ_TEMPLATE, '..', '..');
const VERIFICAR_COMMIT_PY = join(RAIZ_BASE, 'skills', 'git-verificacao-commit', 'scripts', 'verificar_commit.py');
const CONFIG_SEGREDOS = join(RAIZ_BASE, 'skills', 'git-verificacao-commit', 'scripts', 'config.json');
const NODE = process.execPath;

/** ÚNICO ponto que roda um script Node de verdade. Array de argumentos, NUNCA `shell: true`. */
function rodarNode(args, cwd) {
  return spawnSync(NODE, args, { cwd, encoding: 'utf8', shell: false });
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Copiado de `tools/ci-dependencies.mjs:entrypointDoNpm`
 * (que por sua vez cita `verify-commit.mjs:entrypointDoNpm`) porque este script mora fora de
 * `tools/` e não pode importar de lá — o gate `sql-no-modulo`/isolamento aplicado ao
 * próprio template.
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

function entrypointDoNpm() {
  const raizNode = dirname(NODE);
  for (const candidato of [raizNode, join(raizNode, '..', 'lib')]) {
    const achado = entrypointDoPacote(candidato, 'npm');
    if (achado !== null) return achado;
  }
  return null;
}

/** ÚNICO ponto que roda `npm` de verdade — sempre via entrypoint resolvido, nunca `shell: true`. */
function rodarNpm(args, cwd) {
  const entrada = entrypointDoNpm();
  if (entrada === null) return { error: new Error('npm nao encontrado ao lado do node atual'), status: null };
  return spawnSync(NODE, [entrada, ...args], { cwd, encoding: 'utf8', shell: false });
}

/**
 * `prettier --write` sobre `src/composicao.*` — o passo que, em uso real, é o editor (ou o hook de
 * agente `padrao-format` da base Sarak) quem faz, arquivo por arquivo, a cada edição salva. `npm run
 * formato` só ACUSA (`--check`), nunca escreve (comentário no `package.json` do molde: "só o hook
 * escreve") — e `create-adapter.mjs` deliberadamente não formata o que grava, pelo mesmo motivo que
 * não roda o gate por regra isolada. Sem ESTE passo, `verify`/`formato` reprova depois de varrer o
 * vocabulário inteiro: cada `criar-adapter` acrescenta um provedor à MESMA linha de uma porta que já
 * tinha um ou dois, e a linha cresce além do `printWidth` (110, `.prettierrc.json`) sem que ninguém a
 * quebre de novo — não é bug do gerador, é o passo do fluxo real que este autoteste não tinha.
 */
function rodarPrettierWrite(destino) {
  const entrada = entrypointDoPacote(destino, 'prettier');
  if (entrada === null) return { error: new Error('prettier nao encontrado em node_modules do projeto'), status: null };
  return spawnSync(NODE, [entrada, '--write', 'src/composicao.*'], { cwd: destino, encoding: 'utf8', shell: false });
}

/** `SARAK_PYTHON` (caminho do binário) sobrepõe; senão, `python`/`python3` no PATH — mesma técnica
 * de `ci-dependencies.mjs:resolverPython`, copiada pelo mesmo motivo de fronteira: `tools/` é
 * vendorizado e este script mora fora dele. */
function resolverPythonBase() {
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  return candidatos.find((c) => spawnSync(c, ['--version'], { shell: false }).status === 0) ?? null;
}

function caminhoPythonDoVenv(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
}

function caminhoRuffDoVenv(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'ruff.exe') : join(venvDir, 'bin', 'ruff');
}

/** `ruff format` sobre `src/composicao.py` — equivalente Python de `rodarPrettierWrite`, mesmo
 * motivo (ver comentário de `formatarAdaptersPy` em `passosDoBinding`). */
function rodarRuffFormat(destino, venvDir) {
  const executavel = caminhoRuffDoVenv(venvDir);
  if (!existsSync(executavel)) return { error: new Error('ruff nao encontrado no venv do projeto'), status: null };
  return spawnSync(executavel, ['format', 'src/composicao.py'], { cwd: destino, encoding: 'utf8', shell: false });
}

/** ÚNICO ponto que roda um interpretador Python de verdade — nunca `shell: true`. */
function rodarPython(executavel, args, cwd, envExtra = {}) {
  if (executavel === null) return { error: new Error('interpretador python nao resolvido'), status: null };
  return spawnSync(executavel, args, { cwd, encoding: 'utf8', shell: false, env: { ...process.env, ...envExtra } });
}

/** ÚNICO ponto que roda `git` de verdade — resolvido do PATH, nunca `shell: true`. Ausência de git
 * vira `error` no resultado, e `classificarPasso` já reprova isso (lei 7 — não pula). */
function rodarGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
}

/** Caminho de `absoluto` relativo a `root`, na forma que `git ls-files` usa (barra, sempre). */
function caminhoNoFormatoGit(absoluto, raiz) {
  return relative(raiz, absoluto).split(sep).join('/');
}

/**
 * Apaga, recursivamente, todo ARQUIVO sob `pasta` cujo caminho (relativo a `raizProjeto`, no
 * formato do git) não está em `rastreados` — e, na volta da recursão (pós-ordem), remove a própria
 * pasta se ela ficou vazia.
 *
 * A remoção da pasta vazia NÃO é cosmética: `artefato-declarado` (`temPastaDeArtefato`, para
 * `generated/`) julga a ENTRADA da raiz (`ctx.entradasRaiz`, um `readdirSync` que lista nome de
 * pasta, vazia ou não), não o conteúdo. Deixar a pasta vazia sobrevivendo no disco (contraprova:
 * revertendo o `.gitignore` para o `generated/` antigo) mantém a entrada visível para a regra — a
 * poda comeu o `.gitkeep`, mas `generated` continua aparecendo, e a regra nunca vê a ausência. Git,
 * num clone de verdade, não materializa diretório sem arquivo rastreado dentro — é essa ausência
 * que precisa ser reproduzida, não só a do arquivo.
 */
function podarNaoRastreado(pasta, raizProjeto, rastreados) {
  if (!existsSync(pasta)) return;
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      podarNaoRastreado(caminho, raizProjeto, rastreados);
      continue;
    }
    if (!rastreados.has(caminhoNoFormatoGit(caminho, raizProjeto))) rmSync(caminho, { force: true });
  }
  if (readdirSync(pasta).length === 0) rmSync(pasta, { recursive: true, force: true });
}

/** O `src/composicao.*` que `create-adapter.mjs` reescreve, por binding — mesma regra de
 * `create-adapter.mjs:caminhoDeComposicao`. */
function caminhoDeComposicao(destino, binding) {
  const nome = binding === 'python' ? 'composicao.py' : `composicao.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(destino, 'src', nome);
}

/**
 * Roda `create-adapter.mjs` e, só se ele saiu 0, confere que a fábrica apareceu DE VERDADE em
 * `src/composicao.*` — exit 0 sozinho não distingue "registrou" de "não fez nada", que é a classe
 * exata dos dois bugs da rodada anterior (a âncora não batia, mas um regex que batesse ERRADO por
 * acidente escreveria algo sem ser o esperado e passaria calada, sem este segundo confronto). Erro
 * de conteúdo vira o MESMO formato `{ error, status }` que `classificarPasso` já entende — precedente
 * de `rodarPython`/`rodarNpm` quando a resolução falha antes de qualquer processo rodar.
 */
function criarAdapterEVerificar(destino, binding, porta, provedor) {
  const resultado = rodarNode([CRIAR_ADAPTER, porta, provedor, '--binding', binding], destino);
  if (classificarPasso(resultado).ok !== true) return resultado;

  const caminho = caminhoDeComposicao(destino, binding);
  const conteudo = existsSync(caminho) ? readFileSync(caminho, 'utf8') : '';
  const simbolo = nomeDoSimbolo(binding, provedor);
  if (!conteudo.includes(simbolo)) {
    return {
      error: new Error(`create-adapter saiu 0 mas "${simbolo}" nao apareceu em ${caminho} (porta "${porta}", provedor "${provedor}")`),
      status: null,
    };
  }
  return { error: null, status: 0, stdout: '', stderr: '' };
}

/**
 * `git init` + `git add -A` + `git ls-files`, e então poda `modules/` do que não ficou rastreado —
 * a simulação mínima de "sobreviveu a um clone". Cada comando git que falhar
 * devolve o resultado dele mesmo, sem seguir adiante — é o `classificarPasso` de quem chamou que
 * decide se aquilo é falha (e decide que sim: `error`/`status` não-zero nunca vira `ok`).
 */
function simularClone(destino) {
  const init = rodarGit(['init', '-q'], destino);
  if (classificarPasso(init).ok !== true) return init;

  const add = rodarGit(['add', '-A'], destino);
  if (classificarPasso(add).ok !== true) return add;

  const lsFiles = rodarGit(['ls-files'], destino);
  if (classificarPasso(lsFiles).ok !== true) return lsFiles;

  const rastreados = new Set(lsFiles.stdout.split(/\r?\n/).filter((linha) => linha !== ''));
  podarNaoRastreado(join(destino, 'modules'), destino, rastreados);

  return { error: null, status: 0, stdout: '', stderr: '' };
}

/** Despacha UM passo para a execução real. Único ponto que sabe mapear `tipo` -> processo. */
function executarPasso(passo, ctx) {
  switch (passo.tipo) {
    case 'gerar-projeto':
      return rodarNode([CRIAR_PROJETO, ctx.destino, '--binding', ctx.binding], RAIZ_TEMPLATE);
    case 'npm-install':
      return rodarNpm(['install', '--prefer-offline', '--no-audit', '--no-fund'], ctx.destino);
    case 'criar-modulo':
      return rodarNode([CRIAR_MODULO, passo.moduloId, '--binding', ctx.binding, ...passo.flags], ctx.destino);
    case 'criar-adapter':
      return criarAdapterEVerificar(ctx.destino, ctx.binding, passo.porta, passo.provedor);
    case 'formatar-adapters':
      return rodarPrettierWrite(ctx.destino);
    case 'formatar-adapters-py':
      return rodarRuffFormat(ctx.destino, ctx.venvDir);
    case 'clone-simulado':
      return simularClone(ctx.destino);
    case 'primeiro-commit': {
      const python = ctx.pythonBase ?? resolverPythonBase();
      return rodarPython(
        python,
        [VERIFICAR_COMMIT_PY, '--raiz', ctx.destino, '--config', CONFIG_SEGREDOS],
        RAIZ_BASE,
      );
    }
    case 'mapa-instalado':
      return rodarNode([VERIFICAR_MAPA, '--conferir', join(ctx.destino, 'specs', 'arquitetura')], RAIZ_TEMPLATE);
    case 'npm-script':
      return rodarNpm(['run', passo.script], ctx.destino);
    case 'venv':
      return rodarPython(ctx.pythonBase, ['-m', 'venv', ctx.venvDir], ctx.destino);
    case 'pip-upgrade':
      // O `pip` que `python -m venv` instala vem do INTERPRETADOR do sistema, nunca do template —
      // e pode estar velho o bastante para ter CVE própria (medido: pip 25.2 tinha 6, corrigidas em
      // 26.1+). `ci:dependencias` reprova nisso mesmo com toda dependência do projeto em dia, porque
      // `pip-audit` audita o AMBIENTE inteiro, pip incluso.
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'pip', 'install', '--upgrade', 'pip'], ctx.destino);
    case 'pip-install':
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'pip', 'install', '-e', '.[dev]'], ctx.destino);
    case 'verificar-py':
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['verificar.py'], ctx.destino, { SARAK_NODE: NODE });
    case 'ci-dependencias-py':
      // `--dependencias` delega para `ci-dependencies.mjs` (Node), que por sua vez resolve UM
      // interpretador Python para `pip_audit` via `SARAK_PYTHON` (ou PATH). Sem `SARAK_PYTHON`
      // apontado para o venv desta rodada, ele cai no `python`/`python3` do PATH — que pode nem
      // ter `pip_audit` instalado. Medido: sem isto, o passo reprova com "ferramenta de auditoria
      // ausente", mesmo com tudo instalado no venv certo.
      return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['verificar.py', '--dependencias'], ctx.destino, {
        SARAK_NODE: NODE,
        SARAK_PYTHON: caminhoPythonDoVenv(ctx.venvDir),
      });
    default:
      throw new Error(`passo desconhecido: ${passo.tipo}`);
  }
}

/**
 * Roda a cadeia inteira de UM binding numa pasta temporária própria. Para no primeiro passo que
 * falhar (`primeiroFalho`). A pasta é sempre removida no `finally` — a MENOS que `--manter` peça
 * para preservar (uso: depurar um binding específico sem recriar o projeto do zero).
 */
function executarBinding(binding, { manter, rapido }) {
  const destino = mkdtempSync(join(tmpdir(), `sarak-autoteste-template-${binding}-`));
  const ctx = { binding, destino, pythonBase: null, venvDir: join(destino, '.venv') };
  const passos = passosDoBinding(binding, { rapido });
  const executados = [];

  try {
    if (binding === 'python') ctx.pythonBase = resolverPythonBase();

    for (const passo of passos) {
      if (binding === 'python' && passo.tipo === 'venv' && ctx.pythonBase === null) {
        executados.push({ passo, classificado: { ok: false, motivo: 'nenhum interpretador python resolvido (SARAK_PYTHON/python/python3)' }, saida: null });
        break;
      }
      const resultado = executarPasso(passo, ctx);
      const classificado = classificarPasso(resultado);
      executados.push({ passo, classificado, saida: resultado });
      if (!classificado.ok) break;
    }

    return { binding, ok: primeiroFalho(executados.map((e) => e.classificado)) === null, executados };
  } finally {
    if (!manter) {
      try {
        rmSync(destino, { recursive: true, force: true });
      } catch (causa) {
        process.stderr.write(`aviso: falha ao limpar ${destino}: ${causa.message} (nao afeta o resultado)\n`);
      }
    }
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

function imprimirBinding(resultado) {
  process.stdout.write(`\nbinding ${resultado.binding}:\n`);
  for (const { passo, classificado } of resultado.executados) {
    process.stdout.write(`  ${classificado.ok ? 'ok   ' : 'FALHA'} ${passo.nome}\n`);
    if (!classificado.ok) {
      process.stdout.write(`       ${classificado.motivo}\n`);
      const saida = resultado.executados.find((e) => e.passo === passo).saida;
      const texto = [saida?.stdout, saida?.stderr].filter(Boolean).join('\n').trim();
      if (texto !== '') {
        for (const linha of texto.split('\n')) process.stdout.write(`       | ${linha}\n`);
      }
    }
  }
  const total = resultado.executados.length;
  const okCount = resultado.executados.filter((e) => e.classificado.ok).length;
  process.stdout.write(`  binding ${resultado.binding}: ${resultado.ok ? 'VERDE' : 'VERMELHO'} (${okCount}/${total} passos rodados chegaram a ok)\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

function lerOpcoes(argv) {
  const indiceBinding = argv.indexOf('--binding');
  return {
    binding: indiceBinding === -1 ? null : argv[indiceBinding + 1],
    manter: argv.includes('--manter'),
    autoteste: argv.includes('--autoteste'),
    rapido: argv.includes('--rapido'),
  };
}

/**
 * `--rapido` faz DUAS coisas, as duas para caber no teto de ~2min de pre-commit: só os bindings
 * Node (typescript, javascript) — o binding python sozinho leva ~2m40s (venv + pip install do
 * zero) —, e só a combinação PADRÃO de `criar-modulo` (as quatro combinações custam ~70s/~52s a
 * mais). Uso pretendido: pre-commit da base roda `--rapido`; a agenda (workflow) roda sem essa
 * flag, cobrindo os três bindings × as quatro combinações — é o consumidor que paga o custo cheio.
 */
function bindingsAlvo(opcoes) {
  if (opcoes.binding !== null) return [opcoes.binding];
  if (opcoes.rapido) return BINDINGS.filter((b) => b !== 'python');
  return BINDINGS;
}

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  if (opcoes.binding !== null && !BINDINGS.includes(opcoes.binding)) {
    process.stderr.write(`erro: binding "${opcoes.binding}" invalido — use ${BINDINGS.join(', ')}\n`);
    return 1;
  }

  const alvo = bindingsAlvo(opcoes);
  const pulados = BINDINGS.filter((b) => !alvo.includes(b));
  if (pulados.length > 0) {
    process.stdout.write(`aviso: pulando ${pulados.join(', ')} (${opcoes.binding !== null ? '--binding' : '--rapido'}) — NAO foram medidos nesta rodada.\n`);
  }

  const resultados = alvo.map((binding) => executarBinding(binding, { manter: opcoes.manter, rapido: opcoes.rapido }));
  for (const resultado of resultados) imprimirBinding(resultado);

  const falhos = resultados.filter((r) => !r.ok);
  process.stdout.write(`\nautoteste-template: ${resultados.length - falhos.length}/${resultados.length} bindings verdes\n`);
  if (falhos.length > 0) {
    process.stdout.write(`REPROVADO: ${falhos.map((r) => r.binding).join(', ')}\n`);
  }
  return falhos.length > 0 ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra casos em memória. Rápido, sem processo, sem disco.
// ================================================================================================

function casosDeAutoteste() {
  return [
    { nome: 'passosDoBinding(typescript): build, depois lint, depois ci-dependencias por ULTIMO', fn: () => {
      const nomes = passosDoBinding('typescript').map((p) => p.nome);
      return nomes.at(-3) === 'build' && nomes.at(-2) === 'lint' && nomes.at(-1) === 'ci-dependencias';
    } },
    { nome: 'passosDoBinding(javascript): mesma forma do typescript', fn: () => {
      const nomes = passosDoBinding('javascript').map((p) => p.nome);
      return nomes.at(-3) === 'build' && nomes.at(-2) === 'lint' && nomes.at(-1) === 'ci-dependencias';
    } },
    { nome: 'passosDoBinding(python): sem build/lint separado (sem web/ nos modulos python), ci-dependencias por ULTIMO', fn: () => {
      const nomes = passosDoBinding('python').map((p) => p.nome);
      return !nomes.includes('build') && !nomes.includes('lint') && nomes.at(-3) === 'verificar' && nomes.at(-2) === 'mapa' && nomes.at(-1) === 'ci-dependencias';
    } },
    { nome: 'passosDoBinding(python): venv e instalar ANTES do PRIMEIRO criar-modulo', fn: () => {
      const passos = passosDoBinding('python');
      const iPrimeiroModulo = passos.findIndex((p) => p.tipo === 'criar-modulo');
      const nomes = passos.map((p) => p.nome);
      return nomes.indexOf('venv') < iPrimeiroModulo && nomes.indexOf('instalar') < iPrimeiroModulo;
    } },
    { nome: 'passosDoBinding: clone-simulado depois do ULTIMO passo de setup (criar-modulo/criar-adapter/formatar-adapters), nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        const nomes = passos.map((p) => p.nome);
        const iUltimoSetup = passos.findLastIndex((p) => (
          p.tipo === 'criar-modulo' || p.tipo === 'criar-adapter'
          || p.tipo === 'formatar-adapters' || p.tipo === 'formatar-adapters-py'
        ));
        const iClone = nomes.indexOf('clone-simulado');
        return iUltimoSetup !== -1 && iClone === iUltimoSetup + 1;
      })
    ) },
    { nome: 'passosDoBinding: primeiro-commit logo depois de clone-simulado e antes de verificar/verify, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = passosDoBinding(binding).map((p) => p.nome);
        const nomeVerificar = binding === 'python' ? 'verificar' : 'verify';
        const iCommit = nomes.indexOf('primeiro-commit');
        return iCommit === nomes.indexOf('clone-simulado') + 1 && iCommit === nomes.indexOf(nomeVerificar) - 1;
      })
    ) },
    { nome: 'passosDoBinding: mapa roda logo depois de verificar/verify, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = passosDoBinding(binding).map((p) => p.nome);
        const nomeVerificar = binding === 'python' ? 'verificar' : 'verify';
        return nomes.indexOf('mapa') === nomes.indexOf(nomeVerificar) + 1;
      })
    ) },
    { nome: 'passosDoBinding: as QUATRO combinacoes de flag de criar-modulo, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passosDeModulo = passosDoBinding(binding).filter((p) => p.tipo === 'criar-modulo');
        if (passosDeModulo.length !== COMBINACOES_DE_MODULO.length) return false;
        return COMBINACOES_DE_MODULO.every((c, i) => (
          passosDeModulo[i].moduloId === c.id
          && JSON.stringify(passosDeModulo[i].flags) === JSON.stringify(c.flags)
        ));
      })
    ) },
    { nome: 'COMBINACOES_DE_MODULO: ids unicos (workspaces/descoberta nao podem colidir)', fn: () => (
      new Set(COMBINACOES_DE_MODULO.map((c) => c.id)).size === COMBINACOES_DE_MODULO.length
    ) },
    { nome: 'COMBINACOES_DE_MODULO: nenhum id tem hifen (viraria dados.tabelas invalido)', fn: () => (
      COMBINACOES_DE_MODULO.every((c) => !c.id.includes('-'))
    ) },
    { nome: 'passosDoBinding(..., {rapido:true}): so a combinacao PADRAO, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passosDeModulo = passosDoBinding(binding, { rapido: true }).filter((p) => p.tipo === 'criar-modulo');
        return passosDeModulo.length === 1 && passosDeModulo[0].moduloId === COMBINACOES_DE_MODULO[0].id;
      })
    ) },
    { nome: 'provedorDoIndice: kebab-case valido, COM hifen (achado ① fechado — exercita o caminho consertado), NUNCA derivado do nome da porta', fn: () => (
      /^[a-z][a-z0-9-]*$/.test(provedorDoIndice(0)) && provedorDoIndice(5).includes('-')
      && provedorDoIndice(5) !== 'verificadordetoken'
    ) },
    { nome: 'provedorDoIndice: um indice, um provedor unico', fn: () => {
      const gerados = PORTAS_CONHECIDAS.map((_, i) => provedorDoIndice(i));
      return new Set(gerados).size === PORTAS_CONHECIDAS.length;
    } },
    { nome: 'nomeDoSimbolo: typescript/javascript prefixam "criar", python nao', fn: () => (
      nomeDoSimbolo('typescript', 'prov-a') === 'criarProvA'
      && nomeDoSimbolo('javascript', 'prov-a') === 'criarProvA'
      && nomeDoSimbolo('python', 'prov-a') === 'ProvA'
    ) },
    { nome: 'passosDeAdapter: um passo por porta do VOCABULARIO INTEIRO, tipo criar-adapter', fn: () => {
      const passos = passosDeAdapter();
      return passos.length === PORTAS_CONHECIDAS.length
        && passos.every((p, i) => p.tipo === 'criar-adapter' && p.porta === PORTAS_CONHECIDAS[i]);
    } },
    { nome: 'passosDoBinding: criar-adapter roda logo depois do ULTIMO criar-modulo, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        const iUltimoModulo = passos.findLastIndex((p) => p.tipo === 'criar-modulo');
        const iPrimeiroAdapter = passos.findIndex((p) => p.tipo === 'criar-adapter');
        return iPrimeiroAdapter === iUltimoModulo + 1;
      })
    ) },
    { nome: 'passosDoBinding: formatar-adapters (prettier TS/JS, ruff format Python) logo apos o ULTIMO criar-adapter e logo antes de clone-simulado, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        const tipoEsperado = binding === 'python' ? 'formatar-adapters-py' : 'formatar-adapters';
        const iUltimoAdapter = passos.findLastIndex((p) => p.tipo === 'criar-adapter');
        const iFormatar = passos.findIndex((p) => p.tipo === tipoEsperado);
        const iClone = passos.findIndex((p) => p.tipo === 'clone-simulado');
        return iFormatar === iUltimoAdapter + 1 && iClone === iFormatar + 1;
      })
    ) },
    { nome: 'passosDoBinding: cobre pelo menos uma porta ja em FABRICAS (repositorio) e a unica ausente (verificadorDeToken)', fn: () => (
      BINDINGS.every((binding) => {
        const portas = passosDoBinding(binding).filter((p) => p.tipo === 'criar-adapter').map((p) => p.porta);
        return portas.includes('repositorio') && portas.includes('verificadorDeToken');
      })
    ) },
    { nome: 'classificarPasso: status 0 e sem error -> ok', fn: () => classificarPasso({ error: undefined, status: 0 }).ok === true },
    { nome: 'classificarPasso: error definido -> nao ok, mesmo com status 0', fn: () => classificarPasso({ error: new Error('ENOENT'), status: 0 }).ok === false },
    { nome: 'classificarPasso: status null (matado por sinal) -> nao ok', fn: () => classificarPasso({ error: undefined, status: null }).ok === false },
    { nome: 'classificarPasso: status !== 0 -> nao ok', fn: () => classificarPasso({ error: undefined, status: 1 }).ok === false },
    { nome: 'classificarPasso: resultado ausente (nao rodou) -> nao ok, nunca ok por omissao', fn: () => classificarPasso(undefined).ok === false },
    { nome: 'primeiroFalho: lista toda ok -> null', fn: () => primeiroFalho([{ ok: true }, { ok: true }]) === null },
    { nome: 'primeiroFalho: para no PRIMEIRO que falha, ignora os depois', fn: () => {
      const r = primeiroFalho([{ ok: true }, { ok: false, motivo: 'x' }, { ok: false, motivo: 'y' }]);
      return r !== null && r.motivo === 'x';
    } },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (nucleo puro): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
