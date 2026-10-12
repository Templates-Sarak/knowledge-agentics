#!/usr/bin/env node
/**
 * template-self-test.mjs — prova que o TEMPLATE gera projeto que passa na própria cadeia que ele
 * prescreve.
 *
 *   node template-self-test.mjs [--binding typescript] [--fast] [--keep] [--selftest]
 *
 * Fora de `tools/` DE PROPÓSITO: este script é consumido por quem MANTÉM o template, nunca por um
 * projeto gerado — `create-project.mjs` copia `tools/` inteiro para o destino, e um script de teste
 * ali viajaria como fixture morta, nascendo vermelha em todo projeto novo. Um projeto gerado não
 * gera projetos; este script ali seria peso sem consumidor.
 *
 * ESCOPO: as CINCO entradas de `MODULE_COMBINATIONS` — as quatro combinações de flag de
 * `create-module.mjs` (padrão, `--no-artifact`,
 * `--no-web`, as duas juntas) — ver `MODULE_COMBINATIONS` abaixo.
 *
 * NÚCLEO × CASCA, precedente de `tools/affected.mjs`/`ci-dependencies.mjs`/`ci-security.mjs`:
 * `bindingSteps` (que passos rodam, em que ordem) e `classifyStep` (como um resultado de
 * processo vira ok/reprovado) são puros — nenhuma linha toca `fs`, `child_process` ou o relógio. A
 * casca executa CADA passo por um único despachante (`runStep`) e nunca usa `shell: true`.
 *
 * TRÊS FORMAS DE "NÃO RODOU", NENHUMA VIRA "ok" (lei 7 do gate, aplicada a este autoteste): `error`
 * (o executável não resolveu — ENOENT), `status === null` (matado por sinal/timeout, nunca
 * terminou) e `status !== 0` (rodou e reprovou). As três passam por `classifyStep` e as três
 * reprovam.
 *
 * LIMPEZA: a pasta temporária de cada binding é removida no `finally`, e uma falha de limpeza NUNCA
 * troca o exit code da verificação pelo da faxina (ela só avisa em stderr e seque adiante).
 *
 * `simulated-clone` — o passo que prova a outra metade da promessa: não basta o projeto NASCER
 * verde, ele precisa CONTINUAR verde depois de CLONADO, e gerar+verify+apagar (sem nunca clonar)
 * não mede isso. `generated/` entra no `.gitignore` da raiz do jeito que anula o `.gitkeep` do
 * molde, e um projeto clonado de verdade nasce SEM a pasta que `artifact-declared` exige. Sem rede
 * nem remoto (o script não pode depender de nenhum dos dois): `git init` + `git add -A` + `git
 * ls-files` na própria pasta temporária, e então apaga do disco, DENTRO de `modules/`, tudo que não
 * ficou rastreado — é a simulação mínima de "o que sobrevive a um clone", sem virar um projeto git
 * de verdade. O passo `verify`, que já vem a seguir no pipeline, é quem lê o resultado: se o
 * `.gitignore` comeu estrutura, ele reprova ali, não aqui.
 *
 * `first-commit` — a EXCEÇÃO deliberada de fronteira deste arquivo: é o único passo que sai de
 * `specs/_estrutura_modulos/` e chama `skills/git-verificacao-commit/scripts/verificar_commit.py`,
 * na BASE. Todo o resto deste script só toca o TEMPLATE (tools/, bindings/) porque só ele decide se
 * um projeto gerado nasce verde; mas "o repositório nasce COMMITÁVEL?" é uma pergunta sobre o
 * template **e** o gate de segredos **compostos** — e a base é dona dos dois. Medir isso sem sair
 * da base seria fingir medir. Roda sobre o STAGED que `simulated-clone` acabou de produzir (`git
 * init` + `git add -A`) e exige ZERO achado — nenhuma allowlist, nenhum `--no-verify`: achado aqui
 * é o template instalando o próprio vazamento.
 *
 * `create-adapter:<port>` — um passo POR PORTA do vocabulário (`tools/gate/ports-vocabulary.mjs`),
 * reusando o projeto que os passos acima já geraram: é a única forma automatizada, na agenda
 * semanal, de exercitar `create-adapter.mjs` de verdade. Sem isto, o gerador só era provado por
 * fixture — cópia do molde — e foi exatamente uma fixture que envelheceu sem ninguém comparar
 * (âncora Python, ramo de porta nova em TS/Python) que produziu os dois bugs da rodada anterior.
 * Varrer o vocabulário INTEIRO, em vez de citar `repository`/`tokenVerifier` a dedo, cobre os
 * dois ramos do gerador que interessam — porta JÁ em `FACTORIES` (a maioria) e porta AUSENTE dela
 * (hoje só `tokenVerifier`) — e cobre a porta nova sozinho no dia em que o vocabulário crescer
 * de novo (`fila` tem retorno prometido no comentário de `ports-vocabulary.mjs`), sem editar este
 * arquivo. Cada passo confere **exit 0 e conteúdo**: só o exit code não distingue "registrou" de
 * "não fez nada" — a classe exata dos dois bugs, em que a âncora não batia e o script abortava, mas
 * uma âncora que batesse errado por acidente escreveria algo sem ser o esperado e passaria calada.
 * Roda depois do ÚLTIMO `create-module`, antes de `simulated-clone`: os `adapters/`/`src/composition.*`
 * que ele escreve entram no commit simulado e são revalidados por `verify`/`verify.py` a seguir,
 * de graça — nenhum passo novo depois disso, só reaproveitamento do que já roda.
 *
 * `boot` — o passo que SOBE o processo composto do projeto gerado e consulta o `health` de um módulo
 * criado. Existe porque nenhum passo anterior subia o processo, e a tabela `FACTORIES` do
 * `composition.*` usou a chave `memoria` enquanto o `ports.json` dizia `memory`: todo projeto TS/JS
 * gerado quebrava no boot e o autoteste seguia verde. Roda DEPOIS de `first-commit` (o boot pode
 * escrever em disco; o commit simulado já foi medido sobre o staged limpo) e ANTES de
 * `verify`/`verify`: se o processo não sobe, o resto não mede nada que importe. Porta livre
 * escolhida pelo SO, ambiente mínimo passado pelo PROCESSO filho (nenhum `.env` é reescrito), e a
 * árvore de processos sempre encerrada — ver `supervise.mjs`. A parte pura (ambiente, URL,
 * comando) é núcleo; subir, sondar e matar é a casca.
 *
 * `container-files` — a prova SEM Docker de que o projeto nasce dockerizado (ADR-022): os arquivos de
 * container existem, nenhum marcador (`<project>`, `<scope>`…) sobrou, e `sync-deploy.mjs --check` passa
 * com uma `location` por `webPath` declarado. Barato, roda em todo modo — inclusive `--fast`. Cada
 * `create-module` já confere o mesmo `--check` logo depois de criar (o gerador roda dentro dele).
 *
 * `docker` — OPCIONAL, atrás de `--docker`: builda as duas imagens e SOBE o profile `app` do projeto
 * gerado, e sonda `/healthz` do front e `<basePath>/health` pela origem única (no Python, pela própria
 * API, que não tem front). Sem Docker no host o passo sai **PULADO: docker indisponível**, visível na
 * saída e contado à parte — nunca "ok" calado. Derruba containers, volumes e as duas imagens no `finally`.
 * Roda ANTES de `artifact` (que troca o provedor do primeiro módulo para `postgres`) e do `shutdown`
 * (que instala um módulo que o gate reprovaria): o projeto tem de estar no estado que o `verify` aprovou.
 *
 * TETOS DE TEMPO: todo processo que este arquivo dispara roda sob um teto por CLASSE de passo
 * (`LIMITES`, o ÚNICO lugar dos tunables de tempo). Estourar reprova com "estourou o teto de N s",
 * nunca com um "falhou" genérico, e a ÁRVORE de processos do passo é encerrada (o `spawnSync` com
 * `timeout` mata só o filho direto; o `pytest` órfão que pendurou uma rodada por 57 minutos era neto).
 * A casca de processo é `supervise.mjs`, ao lado deste arquivo.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KNOWN_PORTS } from '../tools/gate/ports-vocabulary.mjs';
import { EXIT_CAP } from './supervise.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou o relógio.
// ================================================================================================

export const BINDINGS = ['typescript', 'javascript', 'python'];

/**
 * As CINCO entradas: as QUATRO combinações de flag de `create-module.mjs` MAIS o id com hífen
 * (regressão do `<module_snake>`, ver abaixo) — o invariante é que *qualquer* combinação
 * produz módulo que passa em `verify`, e "qualquer" só vira prova rodando as quatro, não uma. Um
 * id por combinação, para os quatro módulos conviverem no MESMO projeto (um só
 * `npm install`/`pip install`, um só `verify` cobrindo os quatro via workspace/descoberta) —
 * repetir a cadeia inteira quatro vezes pagaria 4× o custo sem medir nada a mais.
 */
export const MODULE_COMBINATIONS = [
  // UM id COM HIFEN é obrigatório aqui, e é regressão, não variedade: `id` é kebab-case por lei
  // (01-modulo.md §3), e até a correção do marcador `<module_snake>` NENHUM id com hífen tinha
  // manifesto válido possível — `table-prefix` exigia `nota-fiscal_` e `manifest-schema` proibia
  // o hífen na tabela que começa por ele. O defeito sobreviveu justamente porque todo id daqui era
  // de uma palavra só: o teste foi ajustado para desviar dele em vez de acusá-lo. Tirar
  // `sonda-hifen` desta lista devolve o ponto cego inteiro.
  //
  // CURTO de propósito, e é a SEGUNDA medição, não só a primeira: `<module>` entra em comentário de
  // CABEÇALHO em vários arquivos do molde Python (`api/src/errors.py:1`, o mais apertado, tem só 13
  // caracteres de folga antes de estourar os 110 do ruff). Ids mais longos ("sondasemartifact",
  // 16 chars) reprovam `ruff check` (E501) e `ruff format --check` no binding Python, sem relação
  // nenhuma com a flag testada — o comprimento do id é que importa. `sonda` (5) tinha
  // folga; estes quatro (6–8) mantêm a mesma folga.
  { id: 'sondapad', flags: [] },
  { id: 'sondaart', flags: ['--no-artifact'] },
  { id: 'sondaweb', flags: ['--no-web'] },
  { id: 'sondaamb', flags: ['--no-artifact', '--no-web'] },
  // O id COM HÍFEN, e com 8 chars pelo mesmo motivo dos quatro acima: medido, a linha mais longa
  // que carrega o id (`api/src/errors.py`) fica em 105/110 com 8 chars — a MESMA folga de 5 que
  // `sondapad` tem. (`sonda-hifen`, 11, cabia em 108/110, mas com folga 2: passa hoje e quebra no
  // primeiro caractere que alguém acrescentar àquela linha, e o vermelho apontaria para o hífen,
  // que não é a causa.) Exercita a cadeia inteira — gate, migrations, `.env`, tipos, testes —
  // sobre `data.prefix` = `sonda_hi_`.
  { id: 'sonda-hi', flags: [] },
];

/**
 * Um provedor por porta, kebab-case FIXO por ÍNDICE — nunca derivado do nome da porta. Armadilha
 * medida (rodada anterior): `tokenVerifier` é camelCase, e um provedor
 * `prov-tokenVerifier` é inválido — `create-adapter.mjs` REJEITA antes de tocar disco
 * (correto). Por índice sobrevive a qualquer nome de porta futuro, sem repensar.
 *
 * COM HÍFEN de propósito (prefixo `prov-`, não só a letra): `create-adapter.mjs` aceita provedor
 * kebab-case com hífen (`validateOptions`), e o código que ele gera para hífen já foi o achado ①
 * — chave de objeto TS/JS não citada e import Python com `-` no meio do
 * caminho. Ficou consertado (chave CITADA nos três bindings, pasta/import Python convertidos pra
 * snake_case — ADR-011) exatamente PORQUE esta rede parou de esconder o defeito atrás de um
 * provedor sem hífen: o índice sozinho (`a`, `b`, ...) nunca exercitava o caminho quebrado. Manter
 * o hífen aqui é o que garante que uma regressão futura volte a pintar esta rede de vermelho.
 */
export function indexProvider(index) {
  return `prov-${String.fromCharCode(97 + index)}`;
}

/** PascalCase a partir de kebab-case — mesma forma de `create-adapter.mjs:toPascalCase`, COPIADA
 * (não importada: `create-adapter.mjs` chama `principal()` ao ser carregado fora de `--selftest`,
 * e importar o módulo dispararia isso). O que este autoteste confirma é a PRESENÇA do símbolo no
 * arquivo gerado, não a lógica que o produz — essa já é `create-adapter.mjs --selftest`. */
function toPascalCase(kebab) {
  return kebab.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/** O nome que `create-adapter.mjs` registra em `src/composition.*` para este binding+provedor —
 * mesma regra de `create-adapter.mjs:providerName`. */
export function symbolName(binding, provider) {
  const pascal = toPascalCase(provider);
  return binding === 'python' ? pascal : `criar${pascal}`;
}

/**
 * Um passo `create-adapter` por porta do VOCABULÁRIO INTEIRO (`ports-vocabulary.mjs`), não por uma
 * lista curada à mão — é o que faz uma porta nova (`fila`, se voltar) entrar na cobertura sozinha,
 * sem editar este arquivo. Ver o parágrafo "create-adapter:<port>" no cabeçalho.
 */
export function adapterSteps() {
  return KNOWN_PORTS.map((port, index) => ({
    name: `create-adapter:${port}`,
    tipo: 'create-adapter',
    port,
    provider: indexProvider(index),
  }));
}

/**
 * OS TUNABLES DE TEMPO — vivem em `template-self-test.config.json` (config versionada, o ÚNICO
 * lugar: nenhum teto, intervalo ou margem é literal neste arquivo). Segundos por CLASSE de passo
 * (`TYPE_CLASS`): install dependência é longo, `--version`/`git` é curto, e um teto só serviria
 * mal a todos. É a ÚNICA leitura de disco do núcleo, feita uma vez na carga do módulo — o resto das
 * funções daqui continua sem tocar `fs`.
 */
export const LIMITS = JSON.parse(
  readFileSync(fileURLToPath(new URL('./template-self-test.config.json', import.meta.url)), 'utf8'),
);

/** Classe de tempo de cada `tipo` de passo. Tipo ausente aqui é erro de programação (ver `stepCap`). */
const TYPE_CLASS = {
  'generate-project': 'generation',
  'create-module': 'generation',
  'create-adapter': 'generation',
  'format-adapters': 'generation',
  'format-adapters-python': 'generation',
  'simulated-clone': 'light',
  'first-commit': 'light',
  'verify-installed-map': 'light',
  venv: 'installation',
  'pip-upgrade': 'installation',
  'pip-install': 'installation',
  'npm-install': 'installation',
  'verify-python': 'verification',
  'ci-dependencies-python': 'verification',
  'npm-script': 'verification',
  boot: 'boot',
  'composition-selftest': 'generation',
  'container-files': 'light',
  docker: 'docker',
  shutdown: 'shutdown',
  artifact: 'installation',
};

/** O teto, em ms, de um passo — pela CLASSE do tipo dele. Tipo desconhecido LANÇA (nunca "sem teto"). */
export function stepCap(step) {
  const cls = TYPE_CLASS[step.tipo];
  if (cls === undefined) throw new Error(`step has no time-limit class: ${step.tipo}`);
  return LIMITS.capSecondsByClass[cls] * 1000;
}

/** Os passos de `create-module`, um por combinação (todas, ou só a PADRÃO no `--fast`). */
function moduleSteps(fast) {
  const combinations = fast ? MODULE_COMBINATIONS.slice(0, 1) : MODULE_COMBINATIONS;
  return combinations.map((combination) => ({
    name: `create-module:${combination.id}`,
    tipo: 'create-module',
    moduleId: combination.id,
    flags: combination.flags,
  }));
}

/**
 * O que roda DEPOIS do último `create-module` e antes do que lê o resultado, nos três bindings:
 *   - `create-adapter:<port>` — reusa o projeto já gerado (ver "create-adapter:<port>" no cabeçalho);
 *   - `format-adapters` — `runPrettierWrite`/`runRuffFormat`: MESMO motivo nos dois bindings,
 *     só a ferramenta muda. Até a rodada que fechou o defeito do hífen no provedor (ADR-011), "ruff
 *     format já bate, mesmo varrendo o vocabulário inteiro" era medido e verdadeiro — porque
 *     `indexProvider` só gerava provedor de UMA letra, sem hífen. Trocar para kebab COM hífen (pra
 *     exercitar o próprio achado ①) engordou a linha de `FACTORIES` além dos 110 cols do ruff MESMO
 *     pro provedor mais curto possível — Python precisa do mesmo passo que TS/JS sempre teve;
 *   - `simulated-clone` — só poda o disco; quem lê o resultado é o `verify` mais adiante;
 *   - `first-commit` — "este repositório nasce commitável?" só faz sentido sobre o STAGED de um
 *     `git init` + `git add -A` reais, que é o que `simulated-clone` acabou de produzir. Alcança a
 *     skill `git-verificacao-commit` (exceção de fronteira declarada no cabeçalho);
 *   - `boot` — sobe o processo composto e consulta o `health` (ver "boot" no cabeçalho).
 */
function setupSteps(binding, fast) {
  const format = binding === 'python' ? 'format-adapters-python' : 'format-adapters';
  return [
    ...moduleSteps(fast),
    ...adapterSteps(),
    { name: 'format-adapters', tipo: format },
    { name: 'simulated-clone', tipo: 'simulated-clone' },
    { name: 'first-commit', tipo: 'first-commit' },
    { name: 'boot', tipo: 'boot' },
  ];
}

/**
 * Python: sem `build`/`lint` separado — o binding não empacota front-end (sem `web/` nos módulos
 * Python — medido, `bindings/python/_template` não tem pasta `web`), e `verify.py` já cobre forma +
 * limiares + tipos + testes num só passo, como o `npm run verify` do lado Node.
 */
function pythonSteps({ fast, docker }) {
  return [
    { name: 'generate-project', tipo: 'generate-project' },
    { name: 'venv', tipo: 'venv' },
    { name: 'upgrade-pip', tipo: 'pip-upgrade' },
    { name: 'install', tipo: 'pip-install' },
    ...setupSteps('python', fast),
    { name: 'verify', tipo: 'verify-python' },
    // Depois de `verify`: o verify-map instalado é doutrina, não código do módulo. Sem este passo,
    // `verify-map.mjs --check` seria um `--check` que existe e ninguém chama.
    { name: 'verify-map', tipo: 'verify-installed-map' },
    { name: 'container-files', tipo: 'container-files' },
    { name: 'ci-dependencies', tipo: 'ci-dependencies-python' },
    ...dockerSteps(docker),
    ...runtimeSteps(),
  ];
}

/**
 * O que roda DEPOIS de toda a cadeia de verificacao, nos tres bindings: o `--selftest` da PROPRIA
 * raiz de composicao do projeto gerado (as decisoes puras dela — `composition.*` nao e alcancado por
 * nenhum teste da base, so vive no projeto instanciado) e o shutdown gracioso com PROCESSO REAL.
 * `shutdown` e o ultimo de proposito: ele instala um modulo descartavel (`zz-slow`, com uma rota
 * lenta) que o gate reprovaria se `verify` rodasse depois.
 */
/** O passo `docker` só entra com `--docker`: custa minutos de build e exige um daemon no host. */
function dockerSteps(docker) {
  return docker ? [{ name: 'docker', tipo: 'docker' }] : [];
}

function runtimeSteps() {
  return [
    { name: 'composition-selftest', tipo: 'composition-selftest' },
    { name: 'shutdown', tipo: 'shutdown' },
  ];
}

function nodeSteps(binding, { fast, docker }) {
  return [
    { name: 'generate-project', tipo: 'generate-project' },
    { name: 'install', tipo: 'npm-install' },
    ...setupSteps(binding, fast),
    { name: 'verify', tipo: 'npm-script', script: 'verify' },
    { name: 'verify-map', tipo: 'verify-installed-map' },
    { name: 'container-files', tipo: 'container-files' },
    { name: 'build', tipo: 'npm-script', script: 'build' },
    { name: 'lint', tipo: 'npm-script', script: 'lint' },
    { name: 'ci-dependencies', tipo: 'npm-script', script: 'ci:dependencies' },
    ...dockerSteps(docker),
    { name: 'artifact', tipo: 'artifact' },
    ...runtimeSteps(),
  ];
}

/**
 * Os passos de UM binding, em ordem — a decisão de "o que rodar" separada de "como rodar".
 *
 * `verify` ANTES de `build`, `build` ANTES de `lint` NÃO É ARBITRÁRIO: `npm run build` quebra
 * `npm run lint` porque o bundle minificado em `dist/` passa a ser lintado. Trocar a ordem faria
 * este autoteste deixar de medir esse defeito.
 *
 * `rapido`: só a combinação PADRÃO (sem flag) — medido, as quatro juntas custam ~70s (TS) / ~52s
 * (JS), e o `--fast` combinado (TS+JS) foi de ~25s para ~1m58s — bem em cima do teto de ~2min
 * para caber em pre-commit. Mesma solução que o binding Python já usa (`--fast` pula Python
 * inteiro, cobrindo-o só na agenda): a combinatória cara fica para o run COMPLETO (agenda),
 * pre-commit continua rápido.
 *
 * `ci-dependencies` é o ÚLTIMO passo, nos três: incluí-lo cedo faria este autoteste nascer vermelho
 * por CVE de terceiro antes mesmo de o resto ser medido — um portão que nasce vermelho é um portão
 * que se aprende a ignorar.
 */
export function bindingSteps(binding, { fast = false, docker = false } = {}) {
  const options = { fast, docker };
  return binding === 'python' ? pythonSteps(options) : nodeSteps(binding, options);
}

/** O manifesto cujo `health` o passo `boot` consulta: o do PRIMEIRO módulo criado (o padrão). */
export function chooseBootManifest(manifests) {
  return manifests.find((m) => m.id === MODULE_COMBINATIONS[0].id) ?? null;
}

/** `*_PORT` = a porta livre; `*_HOST` = loopback (um host inocuo nao escuta); o resto = valor inocuo. */
function bootKeyValue(key, port) {
  if (key.endsWith('_PORT')) return String(port);
  if (key.endsWith('_HOST')) return LIMITS.boot.loopbackHost;
  return LIMITS.boot.harmlessValue;
}

/**
 * O ambiente MÍNIMO do boot, passado pelo processo filho (nunca reescrevendo `.env`): toda chave
 * que a raiz (`project.json:requiredEnv`) ou um manifesto (`module.json:requiredEnv`) exige. Chave
 * `*_PORT` recebe a porta livre escolhida, `*_HOST` o loopback; as demais, o valor inócuo de `LIMITES.boot`. Pura.
 */
export function bootEnvironment({ rootKeys, manifests, port }) {
  const keys = new Set(['ROOT_API_PORT', ...rootKeys, ...manifests.flatMap((m) => m.requiredEnv ?? [])]);
  const environment = {};
  for (const key of keys) {
    environment[key] = bootKeyValue(key, port);
  }
  return environment;
}

/** A URL do `health` de um módulo, em loopback: `basePath` vem do `module.json`. Pura. */
export function healthUrl(manifest, port) {
  return `http://127.0.0.1:${port}${manifest.basePath}/health`;
}

/**
 * O comando que sobe o processo composto, por binding — o `start` do `package.json` (TS e JS, via
 * `npm run start`, o mesmo que o operador usa) ou `python -m src.composition` pelo Python do venv
 * (rodar `src/composition.py` direto poria `src/` no `sys.path` em vez da raiz do projeto, e o
 * `from adapters.memory import ...` não resolveria). Devolve `{ executavel, args }`. Pura.
 */
export function bootCommand(binding, { node, npm, venvPython }) {
  if (binding === 'python') return { executable: venvPython, args: ['-m', 'src.composition'] };
  return { executable: node, args: [npm, 'run', 'start'] };
}

/** Os argumentos de `supervise.mjs` para um comando sob teto, com ou sem sonda de URL. Pura. */
export function supervisorArguments({ capMs, command, probe = null }) {
  const probing = probe === null
    ? []
    : ['--until-url', probe.url, '--interval-ms', String(probe.intervalMs), '--tail-lines', String(probe.tailLines)];
  return ['--timeout-ms', String(capMs), ...probing, '--', ...command];
}

/** Sums the `N warning(s)` lines printed by the gate. A new module must have none. */
export function countGateWarnings(text) {
  let total = 0;
  for (const finding of String(text ?? '').matchAll(/(\d+) warning\(s\)/g)) total += Number(finding[1]);
  return total;
}

/** Os arquivos de container que TODO projeto gerado tem na raiz; os do front só onde há tela. */
export const CONTAINER_FILES = ['Dockerfile', '.dockerignore', '.gitleaks.toml', 'compose.yml', 'deploy/.env.example'];
export const FRONT_FILES = ['front.Dockerfile', 'deploy/nginx.conf'];

/**
 * Marcadores que o `create-project` tem de ter resolvido nos arquivos de container. Lista FECHADA de
 * propósito: o texto cita `<MODULE>_DB_URL` e `<basePath>` em prosa, e uma regex genérica `<...>` os
 * acusaria — aqui só entra o marcador que é substituído de verdade.
 */
export const CONTAINER_MARKERS = ['<project>', '<PROJECT>', '<scope>', '<INFRA_DIR>', '<WEB_PATH>', '<MAX_BODY_SIZE>', '<PROXY_READ_TIMEOUT>'];

/** PURA — `[{ arquivo, marcador }]` do que sobrou nos textos (`{ [arquivo]: texto }`). Vazia = ok. */
export function leftoverMarkers(texts) {
  return Object.entries(texts).flatMap(([file, text]) => (
    CONTAINER_MARKERS.filter((marker) => text.includes(marker)).map((marker) => ({ arquivo: file, marker }))
  ));
}

/**
 * PURA — problemas do conjunto de container de um projeto gerado. `presentes` = os caminhos relativos
 * que existem; `comFront` = algum módulo publica tela; `textos` = o conteúdo dos arquivos presentes.
 */
export function containerProblems({ present, withFront, texts }) {
  const required = withFront ? [...CONTAINER_FILES, ...FRONT_FILES] : CONTAINER_FILES;
  const missing = required.filter((file) => !present.includes(file)).map((file) => `required file is missing: ${file}`);
  const leftovers = leftoverMarkers(texts).map(({ arquivo: file, marker }) => `${file}: unresolved marker ${marker}`);
  return [...missing, ...leftovers];
}

/**
 * PURA — problemas das rotas do front: cada `webPath` não-nulo tem a `location` dele no arquivo gerado, e
 * nenhuma `location` de módulo sem tela. `manifestos` são os `module.json` dos módulos criados.
 */
export function routeProblems(generatedNginx, manifests) {
  const problems = [];
  for (const { id, webPath } of manifests) {
    const has = typeof webPath === 'string' && generatedNginx.includes(`location ${webPath}/ {`);
    if (typeof webPath === 'string' && !has) problems.push(`Module "${id}" is missing a location for ${webPath}`);
    if (typeof webPath !== 'string' && generatedNginx.includes(`/${id}/`)) problems.push(`Module "${id}" has a location but no webPath`);
  }
  return problems;
}

/**
 * PURA — os valores de um `.env.example` (`{ chaves }` = as chaves, na ordem), preenchidos para o
 * autoteste: `*_PORT` recebe uma porta livre da fila, `*_PASSWORD` o segredo efêmero, o resto o valor
 * inócuo. Preencher A PARTIR do exemplo é o que prova que ele declara tudo o que o compose exige.
 */
export function fillDeployEnv(keys, { ports, secret, harmless }) {
  const queue = [...ports];
  return keys.map((key) => {
    if (key.endsWith('_PORT')) return `${key}=${queue.shift()}`;
    if (key.endsWith('_PASSWORD')) return `${key}=${secret}`;
    return `${key}=${harmless}`;
  }).join('\n').concat('\n');
}

/** PURA — as chaves (`KEY=`) de um `.env.example`, em ordem, sem comentário. */
export function exampleEnvKeys(text) {
  return text.split(/\r?\n/).map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]).filter((c) => c !== undefined);
}

/**
 * PURA — as sondas do passo `docker`: `{ url, esperado }`. Com front (TS/JS) a origem ÚNICA responde
 * `/healthz` 200, `/` 404 (sem catch-all), o `health` da API e a página do módulo; sem front (Python) a
 * própria API responde o `health`.
 */
export function dockerProbes({ withFront, origin, manifest }) {
  const health = { url: `${origin}${manifest.basePath}/health`, expected: 200 };
  if (!withFront) return [health];
  const probes = [{ url: `${origin}/healthz`, expected: 200 }, { url: `${origin}/`, expected: 404 }, health];
  if (typeof manifest.webPath === 'string') probes.push({ url: `${origin}${manifest.webPath}/`, expected: 200 });
  return probes;
}

/**
 * PURA — o que o `package.json` do artifact backend NAO pode ter / TEM de ter. `comPostgres` = algum
 * modulo escolheu o provedor `postgres`: so entao o driver `pg` viaja (dependencia de adapter entra
 * junto com o adapter, nunca por padrao). `react`/`react-dom` sao do front (o Vite os empacota no
 * build): nunca no artifact do backend. Devolve a lista de problemas (vazia = ok).
 */
export function artifactProblems(pkg, { withPostgres, hasLock }) {
  const dependencies = pkg?.dependencies ?? {};
  const problems = [];
  for (const frontDependency of ['react', 'react-dom']) {
    if (dependencies[frontDependency] !== undefined) problems.push(`"${frontDependency}" (frontend) is included in the backend artifact`);
  }
  if (dependencies.express === undefined) problems.push('"express" is missing from the backend artifact (required at runtime)');
  if (withPostgres && dependencies.pg === undefined) problems.push('Postgres is selected but "pg" is missing');
  if (!withPostgres && dependencies.pg !== undefined) problems.push('"pg" is included in the backend artifact but no module uses Postgres');
  if (typeof pkg?.scripts?.start !== 'string') problems.push('backend artifact has no start script');
  if (!hasLock) problems.push('package-lock.json is missing (installation is not reproducible)');
  return problems;
}

/** O modulo descartavel que o passo `shutdown` instala: uma rota lenta (`?ms=N`), por binding. */
export const SLOW_MODULE_ID = 'zz-slow';
export const SLOW_PATH = `/api/v1/${SLOW_MODULE_ID}/slow`;

const SLOW_MANIFEST = JSON.stringify({
  id: SLOW_MODULE_ID,
  name: 'Lento',
  basePath: `/api/v1/${SLOW_MODULE_ID}`,
  role: 'domain',
  ports: [],
});

/** O app lento de Node: responde 200 depois de `?ms=N` (TS e JS: o mesmo texto, sem anotacao de tipo). */
const SLOW_NODE_APP = [
  "import express from 'express';",
  '',
  'export function createApp() {',
  '  const app = express();',
  '  app.use((req, res) => {',
  '    const ms = Number(req.query.ms ?? 0);',
  "    setTimeout(() => res.status(200).send('ok'), ms);",
  '  });',
  '  return app;',
  '}',
  '',
].join('\n');

/** O app lento de Python: o `create_app` do modulo, sem FastAPI — um ASGI de 6 linhas. */
const SLOW_PYTHON_APP = [
  'import asyncio',
  'from urllib.parse import parse_qs',
  '',
  'import core.ports  # noqa: F401 — o composition le `sys.modules["core.ports"].ModuleDependencies`',
  '',
  '',
  'def load_configuration(pasta):',
  '    return {}',
  '',
  '',
  'def create_app(deps, auth, config):',
  '    async def app(scope, receive, send):',
  "        ms = int(parse_qs(scope.get('query_string', b'').decode()).get('ms', ['0'])[0])",
  '        await asyncio.sleep(ms / 1000)',
  "        await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', b'text/plain')]})",
  "        await send({'type': 'http.response.body', 'body': b'ok'})",
  '',
  '    return app',
  '',
].join('\n');

const SLOW_PYTHON_PORTS = ['from dataclasses import dataclass', '', '', '@dataclass', 'class ModuleDependencies:', '    pass', ''].join('\n');

/** PURA — os arquivos do modulo lento, por binding: `[{ caminho, conteudo }]` relativos a raiz do projeto. */
export function slowFixture(binding) {
  const base = `modules/${SLOW_MODULE_ID}`;
  const common = [
    { caminho: `${base}/module.json`, content: `${SLOW_MANIFEST}\n` },
    { caminho: `${base}/config/ports.json`, content: '{}\n' },
  ];
  if (binding === 'python') {
    return [
      ...common,
      { caminho: `${base}/core/ports/__init__.py`, content: SLOW_PYTHON_PORTS },
      { caminho: `${base}/api/__init__.py`, content: '' },
      { caminho: `${base}/api/src/__init__.py`, content: SLOW_PYTHON_APP },
    ];
  }
  const file = binding === 'typescript' ? 'index.ts' : 'index.js';
  return [...common, { caminho: `${base}/api/src/${file}`, content: SLOW_NODE_APP }];
}

/**
 * PURA — as duas duracoes da requisicao lenta, a partir do teto de drenagem do PROJETO
 * (`config/runtime.json`): "drena" cabe no teto (limitada a metade dele), "estoura" o ultrapassa.
 */
export function shutdownDurations(drainTimeoutMs) {
  const { slowDrainMs, overflowFactor } = LIMITS.shutdown;
  return { drain: Math.min(slowDrainMs, Math.floor(drainTimeoutMs / 2)), overflow: drainTimeoutMs * overflowFactor };
}

/** PURA — o comando de UM processo (sem `npm`/`sh` no meio) para a prova de sinal: o sinal tem de chegar nele. */
export function singleProcessCommand(binding, { node, venvPython }) {
  if (binding === 'python') return { executable: venvPython, args: ['-m', 'src.composition'] };
  if (binding === 'typescript') return { executable: node, args: ['--import', 'tsx', 'src/composition.ts'] };
  return { executable: node, args: ['src/composition.js'] };
}

/** Estourou o teto: o `spawnSync` de segurança (`ETIMEDOUT`) ou o supervisor (`EXIT_CAP`). */
function capOverflowed(result) {
  return result.error?.code === 'ETIMEDOUT' || result.status === EXIT_CAP;
}

function capReason(capMs) {
  if (typeof capMs !== 'number') return 'timeout expired (limit not provided)';
  return `timeout expired after ${capMs / 1000} s`;
}

/**
 * Um resultado bruto vira `{ ok, motivo }` (e `pulado`, quando o passo se declara pulado). As formas de "não rodou" — teto estourado, `error`,
 * `status` nulo/indefinido, `status` não-zero — caem em `ok: false`. Nenhuma vira `ok: true`.
 * O teto vem ANTES de `error`: um `ETIMEDOUT` também é `error`, e "falhou" genérico esconderia a causa.
 */
export function classifyStep(result) {
  if (result === null || result === undefined) {
    return { ok: false, motivo: 'no result; step was not executed' };
  }
  // PULADO nao e verde: o passo declara que NAO rodou e diz por que, e a saida o conta a parte. So um
  // `pulado` explicito (nunca a ausencia de erro) leva a este ramo.
  if (typeof result.skipped === 'string') return { ok: true, motivo: null, skipped: result.skipped };
  if (capOverflowed(result)) return { ok: false, motivo: capReason(result.capMs) };
  if (result.error !== undefined && result.error !== null) {
    return { ok: false, motivo: `execution failed: ${result.error.message ?? String(result.error)}` };
  }
  if (result.status === null || result.status === undefined) {
    return { ok: false, motivo: 'process did not exit (no status; signal received)' };
  }
  if (result.status !== 0) {
    return { ok: false, motivo: `exit status ${result.status}` };
  }
  return { ok: true, motivo: null };
}

/**
 * Varre os resultados de um binding e para no PRIMEIRO passo que falhar (mesmo raciocínio do `&&`
 * dentro de `npm run verify`): passo que depende do anterior rodar sobre um estado que já não é
 * o que o passo espera não mede nada de novo, só duplica o mesmo defeito com outro nome.
 */
export function firstFailed(classifiedResults) {
  return classifiedResults.find((r) => !r.ok) ?? null;
}

// ================================================================================================
// CASCA — toca disco, `child_process` e ambiente. Cada acesso externo isolado num ponto nomeado.
// ================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = join(HERE, '..');
const CREATE_PROJECT = join(TEMPLATE_ROOT, 'tools', 'create-project.mjs');
const CREATE_MODULE = join(TEMPLATE_ROOT, 'tools', 'create-module.mjs');
const CREATE_ADAPTER = join(TEMPLATE_ROOT, 'tools', 'create-adapter.mjs');
const CHECK_MAP = join(HERE, 'verify-map.mjs');
const SHUTDOWN_PROOF = join(HERE, 'shutdown-proof.py');
// A ÚNICA referência deste arquivo a `skills/` (fora do template) — ver o parágrafo "first-commit"
// no cabeçalho, a exceção de fronteira declarada por escrito.
const BASE_ROOT = join(TEMPLATE_ROOT, '..', '..');
const CHECK_COMMIT_PY = join(BASE_ROOT, 'skills', 'git-verificacao-commit', 'scripts', 'verificar_commit.py');
const CONFIG_SECRETS = join(BASE_ROOT, 'skills', 'git-verificacao-commit', 'scripts', 'config.json');
const NODE = process.execPath;

const SUPERVISOR = join(HERE, 'supervise.mjs');

/**
 * ÚNICO ponto que dispara um processo de verdade: o `supervise.mjs` roda o comando sob o teto
 * (`exec.tetoMs`) e encerra a ÁRVORE inteira dele — `spawnSync` com `timeout` mata só o filho direto.
 * O `spawnSync` que cerca o supervisor leva o teto + `supervisorMarginSeconds` e é só rede de segurança.
 * `exec` = `{ cwd, tetoMs, env? }`; `sonda` (opcional) transforma o comando em "servidor até o health".
 * O resultado carrega `tetoMs` para `classifyStep` poder dizer "estourou o teto de N s".
 */
function runSupervised(command, exec, probe = null) {
  const argv = supervisorArguments({ capMs: exec.capMs, command, probe });
  const result = spawnSync(NODE, [SUPERVISOR, ...argv], {
    cwd: exec.cwd,
    encoding: 'utf8',
    shell: false,
    env: exec.env === undefined ? process.env : { ...process.env, ...exec.env },
    timeout: exec.capMs + LIMITS.supervisorMarginSeconds * 1000,
  });
  return { ...result, capMs: exec.capMs };
}

/** ÚNICO ponto que roda um script Node de verdade. Array de argumentos, NUNCA `shell: true`. */
function runNode(args, exec) {
  return runSupervised([NODE, ...args], exec);
}

/**
 * O entrypoint JS do `npm` pelo campo `bin` de `node_modules/npm/package.json`, ao lado do `node`
 * atual — nunca pelo `PATH`. Copiado de `tools/ci-dependencies.mjs:npmEntrypoint`
 * (que por sua vez cita `verify-commit.mjs:npmEntrypoint`) porque este script mora fora de
 * `tools/` e não pode importar de lá — o gate `sql-in-module`/isolamento aplicado ao
 * próprio template.
 */
function packageEntrypoint(nodeRoot, packageDir, binKey = packageDir) {
  const dir = join(nodeRoot, 'node_modules', packageDir);
  try {
    const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const relPath = typeof bin === 'string' ? bin : bin?.[binKey];
    if (!relPath) return null;
    const target = join(dir, relPath);
    return existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

function npmEntrypoint() {
  const nodeRoot = dirname(NODE);
  for (const candidate of [nodeRoot, join(nodeRoot, '..', 'lib')]) {
    const finding = packageEntrypoint(candidate, 'npm');
    if (finding !== null) return finding;
  }
  return null;
}

/** ÚNICO ponto que roda `npm` de verdade — sempre via entrypoint resolvido, nunca `shell: true`. */
function runNpm(args, exec) {
  const entry = npmEntrypoint();
  if (entry === null) return { error: new Error('npm was not found next to the current Node.js executable'), status: null };
  return runSupervised([NODE, entry, ...args], exec);
}

/**
 * `prettier --write` sobre `src/composition.*` — o passo que, em uso real, é o editor (ou o hook de
 * agente `padrao-format` da base Sarak) quem faz, arquivo por arquivo, a cada edição salva. `npm run
 * formato` só ACUSA (`--check`), nunca escreve (comentário no `package.json` do molde: "só o hook
 * escreve") — e `create-adapter.mjs` deliberadamente não formata o que grava, pelo mesmo motivo que
 * não roda o gate por regra isolada. Sem ESTE passo, `verify`/`formato` reprova depois de varrer o
 * vocabulário inteiro: cada `create-adapter` acrescenta um provedor à MESMA linha de uma porta que já
 * tinha um ou dois, e a linha cresce além do `printWidth` (110, `.prettierrc.json`) sem que ninguém a
 * quebre de novo — não é bug do gerador, é o passo do fluxo real que este autoteste não tinha.
 */
function runPrettierWrite(exec) {
  const entry = packageEntrypoint(exec.cwd, 'prettier');
  if (entry === null) return { error: new Error('prettier was not found in the project node_modules'), status: null };
  return runSupervised([NODE, entry, '--write', 'src/composition.*'], exec);
}

/** `SARAK_PYTHON` (caminho do binário) sobrepõe; senão, `python`/`python3` no PATH — mesma técnica
 * de `ci-dependencies.mjs:resolvePython`, copiada pelo mesmo motivo de fronteira: `tools/` é
 * vendorizado e este script mora fora dele. */
function resolvePythonBase() {
  const candidates = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  const cap = LIMITS.capSecondsByClass.light * 1000;
  return candidates.find((c) => spawnSync(c, ['--version'], { shell: false, timeout: cap }).status === 0) ?? null;
}

function venvPythonPath(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
}

function venvRuffPath(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'ruff.exe') : join(venvDir, 'bin', 'ruff');
}

/** `ruff format` sobre `src/composition.py` — equivalente Python de `runPrettierWrite`, mesmo
 * motivo (ver comentário de `formatarAdaptersPy` em `bindingSteps`). */
function runRuffFormat(venvDir, exec) {
  const executable = venvRuffPath(venvDir);
  if (!existsSync(executable)) return { error: new Error('ruff was not found in the project virtual environment'), status: null };
  return runSupervised([executable, 'format', 'src/composition.py'], exec);
}

/** ÚNICO ponto que roda um interpretador Python de verdade — nunca `shell: true`. */
function runPython(executable, args, exec) {
  if (executable === null) return { error: new Error('Python interpreter was not resolved'), status: null };
  return runSupervised([executable, ...args], exec);
}

/** ÚNICO ponto que roda `git` de verdade — resolvido do PATH, nunca `shell: true`. Ausência de git
 * vira `error` no resultado, e `classifyStep` já reprova isso (lei 7 — não pula). */
function runGit(args, exec) {
  return runSupervised(['git', ...args], exec);
}

/** Caminho de `absoluto` relativo a `root`, na forma que `git ls-files` usa (barra, sempre). */
function pathInGitFormat(absolute, root) {
  return relative(root, absolute).split(sep).join('/');
}

/**
 * Apaga, recursivamente, todo ARQUIVO sob `pasta` cujo caminho (relativo a `raizProjeto`, no
 * formato do git) não está em `rastreados` — e, na volta da recursão (pós-ordem), remove a própria
 * pasta se ela ficou vazia.
 *
 * A remoção da pasta vazia NÃO é cosmética: `artifact-declared` (`hasArtifactDir`, para
 * `generated/`) julga a ENTRADA da raiz (`ctx.entradasRaiz`, um `readdirSync` que lista nome de
 * pasta, vazia ou não), não o conteúdo. Deixar a pasta vazia sobrevivendo no disco (contraprova:
 * revertendo o `.gitignore` para o `generated/` antigo) mantém a entrada visível para a regra — a
 * poda comeu o `.gitkeep`, mas `generated` continua aparecendo, e a regra nunca vê a ausência. Git,
 * num clone de verdade, não materializa diretório sem arquivo rastreado dentro — é essa ausência
 * que precisa ser reproduzida, não só a do arquivo.
 */
function pruneUntracked(dir, projectRoot, tracked) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneUntracked(path, projectRoot, tracked);
      continue;
    }
    if (!tracked.has(pathInGitFormat(path, projectRoot))) rmSync(path, { force: true });
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

/** O `src/composition.*` que `create-adapter.mjs` reescreve, por binding — mesma regra de
 * `create-adapter.mjs:compositionPath`. */
function compositionPath(destination, binding) {
  const name = binding === 'python' ? 'composition.py' : `composition.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(destination, 'src', name);
}

/**
 * Roda `create-adapter.mjs` e, só se ele saiu 0, confere que a fábrica apareceu DE VERDADE em
 * `src/composition.*` — exit 0 sozinho não distingue "registrou" de "não fez nada", que é a classe
 * exata dos dois bugs da rodada anterior (a âncora não batia, mas um regex que batesse ERRADO por
 * acidente escreveria algo sem ser o esperado e passaria calada, sem este segundo confronto). Erro
 * de conteúdo vira o MESMO formato `{ error, status }` que `classifyStep` já entende — precedente
 * de `runPython`/`runNpm` quando a resolução falha antes de qualquer processo rodar.
 */
function createAdapterAndCheck({ port, provider }, { destination, binding }, exec) {
  const result = runNode([CREATE_ADAPTER, port, provider, '--binding', binding], exec);
  if (classifyStep(result).ok !== true) return result;

  const path = compositionPath(destination, binding);
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const symbol = symbolName(binding, provider);
  if (!content.includes(symbol)) {
    return {
      error: new Error(`create-adapter exited successfully but "${symbol}" was not found in ${path} (port "${port}", provider "${provider}")`),
      status: null,
    };
  }
  return { error: null, status: 0, stdout: '', stderr: '' };
}

/**
 * `git init` + `git add -A` + `git ls-files`, e então poda `modules/` do que não ficou rastreado —
 * a simulação mínima de "sobreviveu a um clone". Cada comando git que falhar
 * devolve o resultado dele mesmo, sem seguir adiante — é o `classifyStep` de quem chamou que
 * decide se aquilo é falha (e decide que sim: `error`/`status` não-zero nunca vira `ok`).
 */
function simulateClone(destination, exec) {
  const init = runGit(['init', '-q'], exec);
  if (classifyStep(init).ok !== true) return init;

  const add = runGit(['add', '-A'], exec);
  if (classifyStep(add).ok !== true) return add;

  const lsFiles = runGit(['ls-files'], exec);
  if (classifyStep(lsFiles).ok !== true) return lsFiles;

  const tracked = new Set(lsFiles.stdout.split(/\r?\n/).filter((line) => line !== ''));
  pruneUntracked(join(destination, 'modules'), destination, tracked);

  return { error: null, status: 0, stdout: '', stderr: '' };
}

function runFirstCommit(step, ctx, exec) {
  const checkerArguments = [CHECK_COMMIT_PY, '--raiz', ctx.destination, '--config', CONFIG_SECRETS];
  const python = ctx.pythonBase ?? resolvePythonBase();
  const cleanResult = runPython(python, checkerArguments, { ...exec, cwd: BASE_ROOT });
  if (classifyStep(cleanResult).ok !== true) return cleanResult;

  const compose = readProjectText(ctx.destination, 'deploy/compose.modules.yml') ?? '';
  if (!compose.includes('postgres://${') || !compose.includes(':?required}@')) {
    return setupFailure('generated deployment compose does not contain the environment-interpolated database URL');
  }

  const fixturePath = join(ctx.destination, 'secret-literal-proof.txt');
  const relativeFixturePath = pathInGitFormat(fixturePath, ctx.destination);
  const literalPassword = ['literal', 'password'].join('-');
  writeFileSync(fixturePath, `DATABASE_URL=postgres://app:${literalPassword}@db:5432/app\n`, 'utf8');
  try {
    const stagedFixture = runGit(['add', '--', relativeFixturePath], exec);
    if (classifyStep(stagedFixture).ok !== true) return stagedFixture;
    const blockedResult = runPython(python, checkerArguments, { ...exec, cwd: BASE_ROOT });
    if (blockedResult.status === 1) {
      return {
        error: null,
        status: 0,
        stdout: 'Staged interpolated compose passed; a staged literal password was blocked.\n',
        stderr: '',
      };
    }
    return setupFailure('the staged commit checker did not block a literal database password');
  } finally {
    runGit(['rm', '--cached', '--force', '--', relativeFixturePath], exec);
    rmSync(fixturePath, { force: true });
  }
}

/**
 * `create-project`, e depois a PROMESSA dele: o projeto Node nasce COM `package-lock.json`, antes de
 * qualquer modulo (o Dockerfile constroi com `npm ci`). Antes o lock so aparecia como efeito
 * colateral do `npm install` do primeiro `create-module`, e o autoteste nao via a diferenca.
 */
function runGenerateProject(step, ctx, exec) {
  const result = runNode([CREATE_PROJECT, ctx.destination, '--binding', ctx.binding], { ...exec, cwd: TEMPLATE_ROOT });
  if (classifyStep(result).ok !== true) return result;
  if (!existsSync(join(ctx.destination, '.env.example'))) {
    return setupFailure('create-project exited successfully but did not generate the root .env.example');
  }
  if (ctx.binding === 'python') return result;
  if (existsSync(join(ctx.destination, 'package-lock.json'))) return result;
  return setupFailure('create-project exited successfully but did not generate package-lock.json (Node.js binding)');
}

/**
 * `create-module` SEM `--binding`: o binding vem do `project.json` do projeto gerado — e o que prova
 * que o padrao inferido bate com o molde (antes, um projeto JS ganhava o molde TypeScript).
 * `--role` e obrigatoria na CLI (sem default silencioso) e usa o vocabulario do manifesto. Depois do
 * exit 0, o gate TEM de ter dado ZERO aviso: modulo recem-criado nasce limpo, e aviso (config morta,
 * por exemplo) e defeito do molde, nao ruido.
 */
function runCreateModule(step, ctx, exec) {
  const result = runNode([CREATE_MODULE, step.moduleId, '--role', 'domain', ...step.flags], exec);
  if (classifyStep(result).ok !== true) return result;
  const warnings = countGateWarnings(result.stdout);
  if (warnings !== 0) {
    return { ...setupFailure(`newly created module produced ${warnings} gate warning(s); the template must start clean`), stdout: result.stdout };
  }
  // As rotas do front e a URL do banco sao GERADAS dos manifestos: o `create-module` as regenera, e o
  // `--check` prova que ele o fez — sem edicao manual — para ESTE modulo, antes de o proximo chegar.
  return runNode([join(ctx.destination, 'tools', 'sync-deploy.mjs'), '--check'], exec);
}

const ARTIFACT_DIR = '.artifact';

/** Empacota (`tools/package.mjs <destino>`), le o `package.json` resultante e confere `artifactProblems`. */
function packAndCheck(ctx, exec, { name, withPostgres }) {
  const destination = join(ctx.destination, `${ARTIFACT_DIR}-${name}`);
  const result = runNode([join(ctx.destination, 'tools', 'package.mjs'), destination], exec);
  if (classifyStep(result).ok !== true) return { result, destination };
  const pkg = readProjectJson(join(destination, 'package.json'));
  const problems = artifactProblems(pkg, { withPostgres, hasLock: existsSync(join(destination, 'package-lock.json')) });
  if (problems.length === 0) return { result, destination };
  return { result: setupFailure(`artifact "${name}" is invalid: ${problems.join('; ')}`), destination };
}

/** Sobe o artifact ja instalado (`npm ci --omit=dev`) e consulta o health do modulo padrao. */
function startArtifact(ctx, exec, destination) {
  const context = readBootContext(ctx.destination);
  const manifest = chooseBootManifest(context.manifests);
  const port = discoverFreePort();
  if (manifest === null || port === null) return setupFailure('artifact: no module or free port available');
  const entry = ctx.binding === 'typescript' ? join('dist', 'src', 'composition.js') : join('src', 'composition.js');
  const env = bootEnvironment({ rootKeys: context.rootKeys, manifests: context.manifests, port });
  const probe = { url: healthUrl(manifest, port), intervalMs: LIMITS.boot.intervalMs, tailLines: LIMITS.boot.tailLines };
  const capMs = LIMITS.capSecondsByClass.boot * 1000;
  return runSupervised([NODE, entry], { cwd: destination, capMs, env }, probe);
}

/**
 * O ARTEFATO backend (binding Node): empacota, confere o `package.json` (sem react, sem `pg` se nenhum
 * modulo usa postgres, COM lock), instala so a producao com `npm ci --omit=dev` e SOBE o artifact —
 * sem o fonte do projeto. Depois troca um modulo para o provedor `postgres` e empacota de novo: o
 * driver tem de entrar. Python nao tem passo de empacotamento (03-operacao.md §9.1).
 */
function runArtifact(step, ctx, exec) {
  const cache = packAndCheck(ctx, exec, { name: 'memory', withPostgres: false });
  if (classifyStep(cache.result).ok !== true) return cache.result;
  const install = runNpm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { ...exec, cwd: cache.destination });
  if (classifyStep(install).ok !== true) return install;
  const startup = startArtifact(ctx, exec, cache.destination);
  if (classifyStep(startup).ok !== true) return startup;

  const portsPath = join(ctx.destination, 'modules', MODULE_COMBINATIONS[0].id, 'config', 'ports.json');
  const ports = readProjectJson(portsPath);
  writeFileSync(portsPath, `${JSON.stringify({ ...ports, repository: 'postgres' }, null, 2)}\n`, 'utf8');
  return packAndCheck(ctx, exec, { name: 'postgres', withPostgres: true }).result;
}

/** A raiz de composicao do projeto gerado roda o PROPRIO `--selftest` (decisoes puras dela). */
function runCompositionSelfTest(step, ctx, exec) {
  if (ctx.binding === 'python') {
    return runPython(venvPythonPath(ctx.venvDir), ['-m', 'src.composition', '--selftest'], exec);
  }
  if (ctx.binding === 'javascript') return runNode(['src/composition.js', '--selftest'], exec);
  const tsx = packageEntrypoint(ctx.destination, 'tsx');
  if (tsx === null) return setupFailure('tsx was not found in the project node_modules');
  return runNode([tsx, 'src/composition.ts', '--selftest'], exec);
}

/** Instala o modulo lento descartavel no projeto gerado (ver `slowFixture`). */
function installSlowModule(destination, binding) {
  for (const { caminho: path, content } of slowFixture(binding)) {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
}

/** Uma execucao de `shutdown-proof.py` (UM cenario) sob o supervisor. */
function runShutdownProof(scenario, ctx, exec, context) {
  const port = discoverFreePort();
  if (port === null) return setupFailure('shutdown: could not find a free port');
  const venvPython = venvPythonPath(ctx.venvDir);
  const { executable, args } = singleProcessCommand(ctx.binding, { node: NODE, venvPython });
  const environment = bootEnvironment({ rootKeys: context.rootKeys, manifests: context.manifests, port });
  const duration = shutdownDurations(context.drainTimeoutMs)[scenario];
  const path = `${SLOW_PATH}?ms=${duration}`;
  const argv = [
    SHUTDOWN_PROOF, '--cwd', ctx.destination, '--port', String(port),
    '--url', `http://${LIMITS.boot.loopbackHost}:${port}${SLOW_PATH}?ms=0`, '--path', path,
    '--scenario', scenario, '--timeout-ms', String(context.drainTimeoutMs), '--boot-ms', String(LIMITS.shutdown.bootWaitMs),
    '--', executable, ...args,
  ];
  return runPython(ctx.pythonBase ?? resolvePythonBase(), argv, { ...exec, env: environment });
}

/**
 * O shutdown gracioso com PROCESSO REAL, nos tres bindings: sobe o processo composto + o modulo
 * lento, manda o sinal (SIGTERM; CTRL_BREAK no Windows) com uma requisicao em voo e confere os dois
 * desfechos — drenou (sai 0) e estourou o teto (sai != 0), ambos com o log estruturado.
 */
function runShutdown(step, ctx, exec) {
  const context = readBootContext(ctx.destination);
  const runtime = readProjectJson(join(ctx.destination, 'config', 'runtime.json'));
  const drainTimeoutMs = runtime.shutdown?.drainTimeoutMs;
  if (!Number.isInteger(drainTimeoutMs)) return setupFailure('config/runtime.json must define shutdown.drainTimeoutMs');
  installSlowModule(ctx.destination, ctx.binding);
  const full = { ...context, manifests: [...context.manifests, JSON.parse(SLOW_MANIFEST)], drainTimeoutMs };
  let last = null;
  for (const scenario of ['drain', 'overflow']) {
    last = runShutdownProof(scenario, ctx, exec, full);
    if (classifyStep(last).ok !== true) return last;
  }
  return last;
}

/** Le o texto de um arquivo relativo do projeto gerado, ou `null` se nao existe. */
function readProjectText(destination, relPath) {
  const path = join(destination, relPath);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Os `module.json` dos modulos reais criados (os moldes `_*` nao entram). */
function realManifests(destination) {
  const base = join(destination, 'modules');
  return readdirSync(base)
    .filter((name) => !name.startsWith('_') && existsSync(join(base, name, 'module.json')))
    .map((name) => readProjectJson(join(base, name, 'module.json')));
}

/** Algum modulo real publica tela: `webPath` declarado E a pasta `web/` presente. */
function someModuleHasFront(destination) {
  return realManifests(destination).some((m) => (
    typeof m.webPath === 'string' && existsSync(join(destination, 'modules', m.id, 'web'))
  ));
}

/**
 * `container-files`: o projeto nasce dockerizado, SEM precisar de Docker para provar. Confere a
 * presenca dos arquivos, que nenhum marcador sobrou e que as rotas geradas batem com os `webPath`.
 */
function runContainerFiles(step, ctx) {
  const withFront = someModuleHasFront(ctx.destination);
  const known = [...CONTAINER_FILES, ...FRONT_FILES, 'deploy/compose.modules.yml', 'deploy/nginx.modules.conf'];
  const texts = {};
  for (const relPath of known) {
    const text = readProjectText(ctx.destination, relPath);
    if (text !== null) texts[relPath] = text;
  }
  const problems = containerProblems({ present: Object.keys(texts), withFront, texts });
  if (withFront) problems.push(...routeProblems(texts['deploy/nginx.modules.conf'] ?? '', realManifests(ctx.destination)));
  if (problems.length === 0) return { error: null, status: 0, stdout: '', stderr: '' };
  return setupFailure(`container: ${problems.join('; ')}`);
}

/** `docker info` responde: ha um daemon alcancavel. Sem ele o passo `docker` se declara pulado. */
function availableDocker() {
  const response = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', shell: false, timeout: 30000 });
  return response.error === undefined && response.status === 0;
}

/** Portas livres DISTINTAS, escolhidas pelo SO — ou `null` se o SO nao as der. */
function discoverDistinctPorts(amount) {
  const found = new Set();
  for (let attempt = 0; attempt < amount * 5 && found.size < amount; attempt += 1) {
    const port = discoverFreePort();
    if (port !== null) found.add(port);
  }
  return found.size === amount ? [...found] : null;
}

/**
 * Escreve o `.env` da raiz e o `deploy/.env` do projeto gerado. O `.env` leva `ROOT_API_HOST` em LOOPBACK
 * de proposito: e o valor de dev, e o `app` so sobe alcancavel porque o compose o sobrescreve (a prova
 * do host de container). Devolve as portas escolhidas ou a falha de preparo.
 */
function prepareDockerEnvironment(ctx) {
  const ports = discoverDistinctPorts(3);
  if (ports === null) return { failure: setupFailure('docker: could not find free ports') };
  const [apiPort, databasePort, entryPort] = ports;
  // So os modulos REAIS: o molde `_template` carrega marcadores (`<MODULE>_API_PORT`) que nao sao
  // nome de variavel valido — o compose recusaria o `.env`.
  const manifests = realManifests(ctx.destination);
  const { rootKeys } = readBootContext(ctx.destination);
  const environment = bootEnvironment({ rootKeys, manifests, port: apiPort });
  const rootEnv = Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n');
  writeFileSync(join(ctx.destination, '.env'), `${rootEnv}\n`, 'utf8');

  const example = readProjectText(ctx.destination, 'deploy/.env.example') ?? '';
  const filled = fillDeployEnv(exampleEnvKeys(example), {
    ports: [databasePort, entryPort],
    secret: randomBytes(12).toString('hex'),
    harmless: LIMITS.boot.harmlessValue,
  });
  writeFileSync(join(ctx.destination, 'deploy', '.env'), filled, 'utf8');
  return { apiPort, entryPort, manifest: chooseBootManifest(manifests) };
}

/** PURA — o erro e de CONEXAO (nunca chegou ao servidor) e, so por isso, vale uma nova tentativa. */
export function connectionError(result) {
  return /fetch failed|ECONNREFUSED|ECONNRESET/.test(`${result?.stdout ?? ''}${result?.stderr ?? ''}`);
}

/**
 * A sonda de UMA URL, com repeticao SO para erro de conexao (`LIMITES.dockerProbe`): o `--wait` do
 * compose ja provou os healthchecks, mas a porta publicada no host pode demorar a aceitar no Docker
 * Desktop. Status errado e definitivo — repetir o esconderia.
 */
function probeUrl(probe, exec) {
  const { attempts, intervalMs: intervalMs } = LIMITS.dockerProbe;
  let result = probeUrlOnce(probe, exec);
  for (let n = 1; n < attempts && classifyStep(result).ok !== true && connectionError(result); n += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
    result = probeUrlOnce(probe, exec);
  }
  return result;
}

/** Uma tentativa: `node -e fetch(...)`, sob o supervisor. Sai 0 so se o status for o esperado. */
function probeUrlOnce({ url, expected }, exec) {
  const script = 'const [u, e] = process.argv.slice(1);'
    // `exitCode` e nao `process.exit()`: no Windows, sair logo depois do `fetch` derruba o libuv com
    // `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` e o status vira nao-zero mesmo com 200.
    + 'fetch(u, { redirect: "manual" }).then((r) => { console.log(u, r.status);'
    + ' process.exitCode = r.status === Number(e) ? 0 : 1; })'
    + '.catch((x) => { console.error(String(x)); process.exitCode = 1; });';
  return runNode(['-e', script, url, String(expected)], exec);
}

/** O nome do projeto compose (`name: <project>-local`) — de onde saem os nomes das duas imagens. */
function composeProjectName(destination) {
  return (readProjectText(destination, 'compose.yml') ?? '').match(/^name:\s*(\S+)-local\s*$/m)?.[1] ?? null;
}

/** Os argumentos `-f`/`--env-file` do compose do projeto gerado — os mesmos que `docker-up.mjs` passa. */
function composeArguments(destination) {
  return ['compose', '-f', join(destination, 'compose.yml'), '--env-file', join(destination, '.env'),
    '--env-file', join(destination, 'deploy', '.env'), '--profile', 'app'];
}

/** Derruba containers e volumes do projeto e remove as DUAS imagens que o passo construiu. Nunca lanca. */
function killDocker(destination) {
  const options = { encoding: 'utf8', shell: false };
  spawnSync('docker', [...composeArguments(destination), 'down', '--volumes', '--remove-orphans'], options);
  const project = composeProjectName(destination);
  if (project === null) return;
  spawnSync('docker', ['image', 'rm', '--force', `${project}-app:local`, `${project}-front:local`], options);
}

/** Cauda dos logs dos servicos — a causa de uma sonda que falhou costuma estar la, nao no `fetch`. */
function logTail(destination) {
  const logs = spawnSync('docker', [...composeArguments(destination), 'logs', '--tail', '30'], { encoding: 'utf8', shell: false });
  return `${logs.stdout ?? ''}${logs.stderr ?? ''}`;
}

/** Sobe o profile `app` e sonda as URLs; o que ficou de pe e removido pelo chamador (`finally`). */
function startAndProbe(ctx, setup, exec) {
  const startup = runNode([join(ctx.destination, 'tools', 'docker-up.mjs'), 'up'], exec);
  if (classifyStep(startup).ok !== true) return { ...startup, stdout: `${startup.stdout ?? ''}${logTail(ctx.destination)}` };
  const withFront = someModuleHasFront(ctx.destination);
  // Com front a entrada e o front; sem front, a propria API (DEPLOY_APP_PORT) — as duas saem da mesma fila.
  const origin = `http://${LIMITS.boot.loopbackHost}:${setup.entryPort}`;
  for (const probe of dockerProbes({ withFront, origin, manifest: setup.manifest })) {
    const result = probeUrl(probe, exec);
    if (classifyStep(result).ok === true) continue;
    const reason = `docker: ${probe.url} did not respond with ${probe.expected} — ${result.stdout ?? ''}${result.stderr ?? ''}`;
    return { ...setupFailure(reason), stdout: logTail(ctx.destination) };
  }
  return { error: null, status: 0, stdout: '', stderr: '' };
}

/**
 * `docker` (so com `--docker`): builda as duas imagens, sobe o profile `app` e sonda a origem unica. Sem
 * daemon, o passo se DECLARA pulado — a saida o mostra e o veredito o conta a parte.
 */
function runDocker(step, ctx, exec) {
  if (!availableDocker()) return { error: null, status: 0, stdout: '', stderr: '', skipped: 'Docker unavailable' };
  const setup = prepareDockerEnvironment(ctx);
  if (setup.failure !== undefined) return setup.failure;
  try {
    return startAndProbe(ctx, setup, exec);
  } finally {
    killDocker(ctx.destination);
  }
}


const BOM = /^﻿/;

function readProjectJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(BOM, ''));
}

/** O que o boot precisa do projeto gerado: as chaves da raiz e os manifestos dos módulos criados. */
function readBootContext(destination) {
  const project = readProjectJson(join(destination, 'project.json'));
  const base = join(destination, 'modules');
  const manifests = readdirSync(base)
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .map((name) => readProjectJson(join(base, name, 'module.json')));
  return { rootKeys: project.requiredEnv ?? [], manifests };
}

/** Uma porta TCP livre em loopback, escolhida pelo SO (`supervise.mjs --free-port`), ou `null`. */
function discoverFreePort() {
  const result = spawnSync(NODE, [SUPERVISOR, '--free-port'], {
    encoding: 'utf8',
    shell: false,
    timeout: LIMITS.capSecondsByClass.light * 1000,
  });
  const port = Number(String(result.stdout ?? '').trim());
  return Number.isInteger(port) && port > 0 ? port : null;
}

/** Falha de PREPARO do passo, no formato `{ error, status }` que `classifyStep` já entende. */
function setupFailure(message) {
  return { error: new Error(message), status: null };
}

/**
 * O passo `boot`: sobe o processo composto do projeto gerado e prova que ele responde `200` no
 * `health` de um módulo criado. Toda a decisão (ambiente, URL, comando) é do núcleo; aqui só se
 * junta o que o disco e o SO informam e se entrega ao supervisor, que sonda e encerra a árvore.
 */
function runBoot(step, ctx, exec) {
  const context = readBootContext(ctx.destination);
  const manifest = chooseBootManifest(context.manifests);
  if (manifest === null) return setupFailure('boot: no module was created for the health check');
  const port = discoverFreePort();
  if (port === null) return setupFailure('shutdown: could not find a free port');
  const npm = ctx.binding === 'python' ? null : npmEntrypoint();
  if (ctx.binding !== 'python' && npm === null) return setupFailure('boot: npm was not found next to the current Node.js executable');

  const venvPython = venvPythonPath(ctx.venvDir);
  const { executable, args } = bootCommand(ctx.binding, { node: NODE, npm, venvPython });
  const env = bootEnvironment({ rootKeys: context.rootKeys, manifests: context.manifests, port });
  const probe = {
    url: healthUrl(manifest, port),
    intervalMs: LIMITS.boot.intervalMs,
    tailLines: LIMITS.boot.tailLines,
  };
  return runSupervised([executable, ...args], { ...exec, env }, probe);
}

/** Executores dos passos comuns aos três bindings. Cada um: `(passo, ctx, exec) -> resultado bruto`. */
const COMMON_EXECUTORS = {
  'generate-project': runGenerateProject,
  'create-module': runCreateModule,
  'composition-selftest': runCompositionSelfTest,
  artifact: runArtifact,
  shutdown: runShutdown,
  'container-files': runContainerFiles,
  docker: runDocker,
  'create-adapter': (step, ctx, exec) => createAdapterAndCheck(step, ctx, exec),
  'simulated-clone': (step, ctx, exec) => simulateClone(ctx.destination, exec),
  'first-commit': runFirstCommit,
  'verify-installed-map': (step, ctx, exec) => (
    runNode([CHECK_MAP, '--check', join(ctx.destination, 'specs', 'arquitetura')], { ...exec, cwd: TEMPLATE_ROOT })
  ),
  boot: runBoot,
};

/** Executores dos bindings Node (typescript, javascript). */
const NODE_EXECUTORS = {
  'npm-install': (step, _ctx, exec) => runNpm(['install', '--prefer-offline', '--no-audit', '--no-fund'], exec),
  'format-adapters': (step, _ctx, exec) => runPrettierWrite(exec),
  'npm-script': (step, _ctx, exec) => runNpm(['run', step.script], exec),
};

/** Executores do binding Python. */
const PYTHON_EXECUTORS = {
  venv: (step, ctx, exec) => runPython(ctx.pythonBase, ['-m', 'venv', ctx.venvDir], exec),
  // O `pip` que `python -m venv` instala vem do INTERPRETADOR do sistema, nunca do template — e pode
  // estar velho o bastante para ter CVE própria (medido: pip 25.2 tinha 6, corrigidas em 26.1+).
  // `ci:dependencias` reprova nisso mesmo com toda dependência do projeto em dia, porque `pip-audit`
  // audita o AMBIENTE inteiro, pip incluso.
  'pip-upgrade': (step, ctx, exec) => (
    runPython(venvPythonPath(ctx.venvDir), ['-m', 'pip', 'install', '--upgrade', 'pip'], exec)
  ),
  'pip-install': (step, ctx, exec) => (
    runPython(venvPythonPath(ctx.venvDir), ['-m', 'pip', 'install', '-e', '.[dev]'], exec)
  ),
  'format-adapters-python': (step, ctx, exec) => runRuffFormat(ctx.venvDir, exec),
  'verify-python': (step, ctx, exec) => (
    runPython(venvPythonPath(ctx.venvDir), ['verify.py'], { ...exec, env: { SARAK_NODE: NODE } })
  ),
  // `--dependencies` delega para `ci-dependencies.mjs` (Node), que por sua vez resolve UM
  // interpretador Python para `pip_audit` via `SARAK_PYTHON` (ou PATH). Sem `SARAK_PYTHON` apontado
  // para o venv desta rodada, ele cai no `python`/`python3` do PATH — que pode nem ter `pip_audit`
  // instalado. Medido: sem isto, o passo reprova com "ferramenta de auditoria ausente", mesmo com
  // tudo instalado no venv certo.
  'ci-dependencies-python': (step, ctx, exec) => (
    runPython(venvPythonPath(ctx.venvDir), ['verify.py', '--dependencies'], {
      ...exec,
      env: { SARAK_NODE: NODE, SARAK_PYTHON: venvPythonPath(ctx.venvDir) },
    })
  ),
};

const EXECUTORS = { ...COMMON_EXECUTORS, ...NODE_EXECUTORS, ...PYTHON_EXECUTORS };

/** Despacha UM passo para a execução real, sob o teto da CLASSE dele. Único ponto que mapeia `tipo` -> processo. */
function runStep(step, ctx) {
  const executor = EXECUTORS[step.tipo];
  if (executor === undefined) throw new Error(`unknown step: ${step.tipo}`);
  return executor(step, ctx, { cwd: ctx.destination, capMs: stepCap(step) });
}

/** Apaga a pasta temporária; falha de limpeza NUNCA troca o resultado — só avisa em stderr. */
function cleanDestination(destination) {
  try {
    rmSync(destination, { recursive: true, force: true });
  } catch (cause) {
    process.stderr.write(`Warning: could not clean ${destination}: ${cause.message} (the result is unchanged)\n`);
  }
}

/** Executa UM passo e mede o tempo dele — a duração entra no relatório (e calibra `LIMITES`). */
function runMeasured(step, ctx) {
  const start = Date.now();
  const result = runStep(step, ctx);
  return { step, classified: classifyStep(result), saida: result, durationMs: Date.now() - start };
}

/** `venv` sem interpretador resolvido: o passo nem roda, e reprova com a causa. `null` = pode rodar. */
function stepWithoutInterpreter(step, ctx) {
  if (ctx.binding !== 'python' || step.tipo !== 'venv' || ctx.pythonBase !== null) return null;
  const reason = 'no Python interpreter was resolved (SARAK_PYTHON/python/python3)';
  return { step, classified: { ok: false, motivo: reason }, saida: null, durationMs: 0 };
}

/** Roda os passos em ordem e PARA no primeiro que reprova (`firstFailed`). */
function runSteps(steps, ctx) {
  const executedSteps = [];
  for (const step of steps) {
    const executedStep = stepWithoutInterpreter(step, ctx) ?? runMeasured(step, ctx);
    executedSteps.push(executedStep);
    if (!executedStep.classified.ok) break;
  }
  return executedSteps;
}

/**
 * Roda a cadeia inteira de UM binding numa pasta temporária própria. Para no primeiro passo que
 * falhar (`firstFailed`). A pasta é sempre removida no `finally` — a MENOS que `--keep` peça
 * para preservar (uso: depurar um binding específico sem recriar o projeto do zero).
 */
function runBinding(binding, { keep, fast, docker }) {
  const destination = mkdtempSync(join(tmpdir(), `sarak-selftest-template-${binding}-`));
  const ctx = { binding, destination, pythonBase: null, venvDir: join(destination, '.venv') };

  try {
    if (binding === 'python') ctx.pythonBase = resolvePythonBase();
    const executedSteps = runSteps(bindingSteps(binding, { fast, docker }), ctx);
    const ok = firstFailed(executedSteps.map((e) => e.classified)) === null;
    return { binding, ok, executed: executedSteps };
  } finally {
    if (!keep) cleanDestination(destination);
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

/** A causa da falha e a saída do processo (stdout + stderr), uma linha por linha, recuada. */
function printFailure({ classified, saida: output }) {
  process.stdout.write(`       ${classified.motivo}\n`);
  const text = [output?.stdout, output?.stderr].filter(Boolean).join('\n').trim();
  if (text === '') return;
  for (const line of text.split('\n')) process.stdout.write(`       | ${line}\n`);
}

function printStep(executedStep) {
  const { step, classified, durationMs } = executedStep;
  const seconds = ((durationMs ?? 0) / 1000).toFixed(1);
  if (classified.skipped !== undefined) {
    process.stdout.write(`  skip  ${step.name} (${seconds} s) — skipped: ${classified.skipped}\n`);
    return;
  }
  process.stdout.write(`  ${classified.ok ? 'ok   ' : 'FAIL'} ${step.name} (${seconds} s)\n`);
  if (!classified.ok) printFailure(executedStep);
}

function printBinding(result) {
  process.stdout.write(`\nbinding ${result.binding}:\n`);
  for (const executedStep of result.executed) printStep(executedStep);
  const skipped = result.executed.filter((e) => e.classified.skipped !== undefined).length;
  const total = result.executed.length - skipped;
  const okCount = result.executed.filter((e) => e.classified.ok && e.classified.skipped === undefined).length;
  const warning = skipped > 0 ? `, ${skipped} SKIPPED — not checked` : '';
  process.stdout.write(`  binding ${result.binding}: ${result.ok ? 'PASS' : 'FAIL'} (${okCount}/${total} executed steps passed${warning})\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

const BOOLEAN_FLAGS = { '--fast': 'fast', '--keep': 'keep', '--selftest': 'selfTest', '--docker': 'docker' };
const ACCEPTED_ARGUMENTS = ['--binding <name>', ...Object.keys(BOOLEAN_FLAGS)];

/**
 * argv → `{ opcoes }` ou `{ erro }`. Puro. Argumento desconhecido REPROVA em vez de ser ignorado:
 * o `--fastish` que o `package.json` passava depois que a flag virou `--fast` (ADR-020) caía em
 * silêncio e o "rápido" rodava TUDO — verde indistinguível de "não fez o que pedi" (lei 10). O
 * mesmo vale para o VALOR de `--binding`: `--binding --fast` consumiria `--fast` como nome de
 * binding, e o valor tem de pertencer a `BINDINGS`.
 */
function readOptions(argv) {
  const options = { binding: null, keep: false, selfTest: false, fast: false, docker: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (Object.hasOwn(BOOLEAN_FLAGS, arg)) {
      options[BOOLEAN_FLAGS[arg]] = true;
      continue;
    }
    if (arg !== '--binding') return { error: `unknown argument "${arg}" — accepted: ${ACCEPTED_ARGUMENTS.join(', ')}` };
    if (i + 1 >= argv.length) return { error: '--binding requires a value' };
    const value = argv[i + 1];
    if (!BINDINGS.includes(value)) {
      return { error: `--binding "${value}" is invalid — accepted: ${BINDINGS.join(', ')}` };
    }
    options.binding = value;
    i += 1;
  }
  return { options };
}

/**
 * `--fast` faz DUAS coisas, as duas para caber no teto de ~2min de pre-commit: só os bindings
 * Node (typescript, javascript) — o binding python sozinho leva ~2m40s (venv + pip install do
 * zero) —, e só a PRIMEIRA entrada de `create-module` (as cinco custam ~70s/~52s a
 * mais). Uso pretendido: pre-commit da base roda `--fast`; a agenda (workflow) roda sem essa
 * flag, cobrindo os três bindings × as cinco entradas — é o consumidor que paga o custo cheio.
 */
function targetBindings(options) {
  if (options.binding !== null) return [options.binding];
  if (options.fast) return BINDINGS.filter((b) => b !== 'python');
  return BINDINGS;
}

function main() {
  const { options, error } = readOptions(process.argv.slice(2));
  if (error !== undefined) {
    process.stderr.write(`Error: ${error}\n`);
    return 1;
  }
  if (options.selfTest) return runSelfTest();

  const target = targetBindings(options);
  const skipped = BINDINGS.filter((b) => !target.includes(b));
  if (skipped.length > 0) {
    process.stdout.write(`Warning: skipping ${skipped.join(', ')} (${options.binding !== null ? '--binding' : '--fast'}); these bindings were not measured in this run.\n`);
  }

  const results = target.map((binding) => runBinding(binding, {
    keep: options.keep, fast: options.fast, docker: options.docker,
  }));
  for (const result of results) printBinding(result);

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\ntemplate-self-test: ${results.length - failed.length}/${results.length} bindings passed\n`);
  if (failed.length > 0) {
    process.stdout.write(`FAILED: ${failed.map((r) => r.binding).join(', ')}\n`);
  }
  return failed.length > 0 ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra casos em memória. Rápido, sem processo, sem disco.
// ================================================================================================

const CHECK_NAME = { typescript: 'verify', javascript: 'verify', python: 'verify' };
const TEST_PORT = 4321;
const PORT_WITHOUT_KEYS = 5000;
const TEST_CAP_MS = 90000;
const TEST_SUPERVISOR_CAP_MS = 120000;

function bindingNames(binding, options) {
  return bindingSteps(binding, options).map((p) => p.name);
}

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ordem dos passos: o que vem antes/depois de quê, em cada binding. */
function stepsOrderCases() {
  const nodeEnd = (b) => {
    const names = bindingNames(b);
    return names.at(-6) === 'build' && names.at(-5) === 'lint' && names.at(-4) === 'ci-dependencies'
      && names.at(-3) === 'artifact' && names.at(-2) === 'composition-selftest' && names.at(-1) === 'shutdown';
  };
  return [
    { name: 'bindingSteps(typescript): build, lint, and dependency audit are followed by composition self-test and shutdown', fn: () => nodeEnd('typescript') },
    { name: 'bindingSteps(javascript): same ordering as TypeScript', fn: () => nodeEnd('javascript') },
    { name: 'bindingSteps(python): no separate build or lint step (Python modules have no web/); runtime runs last', fn: () => {
      const names = bindingNames('python');
      return !names.includes('build') && !names.includes('lint') && names.at(-6) === 'verify' && names.at(-5) === 'verify-map'
        && names.at(-4) === 'container-files' && names.at(-3) === 'ci-dependencies'
        && names.at(-2) === 'composition-selftest' && names.at(-1) === 'shutdown';
    } },
    { name: 'bindingSteps(python): venv and install run before the first create-module step', fn: () => {
      const steps = bindingSteps('python');
      const firstModuleIndex = steps.findIndex((p) => p.tipo === 'create-module');
      const names = steps.map((p) => p.name);
      return names.indexOf('venv') < firstModuleIndex && names.indexOf('install') < firstModuleIndex;
    } },
    { name: 'bindingSteps: verify-map runs immediately after verify in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const names = bindingNames(binding);
        return names.indexOf('verify-map') === names.indexOf(CHECK_NAME[binding]) + 1;
      })
    ) },
  ];
}

/** Clone simulado, primeiro commit e boot: a cadeia que fecha o setup e antecede o `verify`. */
function setupAndBootCases() {
  return [
    { name: 'bindingSteps: simulated-clone follows the final setup step in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const steps = bindingSteps(binding);
        const lastSetupIndex = steps.findLastIndex((p) => (
          p.tipo === 'create-module' || p.tipo === 'create-adapter'
          || p.tipo === 'format-adapters' || p.tipo === 'format-adapters-python'
        ));
        return lastSetupIndex !== -1 && steps.findIndex((p) => p.tipo === 'simulated-clone') === lastSetupIndex + 1;
      })
    ) },
    { name: 'bindingSteps: first-commit immediately follows simulated-clone in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const names = bindingNames(binding);
        return names.indexOf('first-commit') === names.indexOf('simulated-clone') + 1;
      })
    ) },
    { name: 'bindingSteps: boot follows first-commit and precedes verification in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const names = bindingNames(binding);
        const iBoot = names.indexOf('boot');
        return iBoot !== -1 && iBoot === names.indexOf('first-commit') + 1 && iBoot === names.indexOf(CHECK_NAME[binding]) - 1;
      })
    ) },
    { name: 'bindingSteps: boot follows the final create-module step, including --fast', fn: () => (
      BINDINGS.every((binding) => {
        const steps = bindingSteps(binding, { fast: true });
        return steps.findIndex((p) => p.tipo === 'boot') > steps.findLastIndex((p) => p.tipo === 'create-module');
      })
    ) },
  ];
}

/** As combinações de módulo e o que o `--fast` poda delas. */
function combinationsCases() {
  return [
    { name: 'bindingSteps: all MODULE_COMBINATIONS entries are used in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const moduleSteps = bindingSteps(binding).filter((p) => p.tipo === 'create-module');
        if (moduleSteps.length !== MODULE_COMBINATIONS.length) return false;
        return MODULE_COMBINATIONS.every((c, i) => (
          moduleSteps[i].moduleId === c.id && sameList(moduleSteps[i].flags, c.flags)
        ));
      })
    ) },
    { name: 'MODULE_COMBINATIONS: ids are unique and cannot collide in workspaces or discovery', fn: () => (
      new Set(MODULE_COMBINATIONS.map((c) => c.id)).size === MODULE_COMBINATIONS.length
    ) },
    // INVERTIDA de propósito. Esta catraca já exigiu o CONTRÁRIO ("nenhum id tem hifen"), e era ela
    // que mantinha o defeito vivo: `id` é kebab-case por lei, mas `table-prefix` pedia
    // `nota-fiscal_` enquanto `manifest-schema` proibia o hífen na tabela derivada — nenhum id com
    // hífen tinha manifesto válido. A rede foi ajustada para desviar do defeito, e com ela verde o
    // defeito virou invisível. Agora a rede EXIGE o caso que antes proibia: sem um id hifenizado, a
    // cadeia inteira volta a nunca exercitar `<module_snake>`.
    { name: 'MODULE_COMBINATIONS: at least one id contains a hyphen (regression coverage for module_snake)', fn: () => (
      MODULE_COMBINATIONS.some((c) => c.id.includes('-'))
    ) },
    { name: 'bindingSteps(..., {fast:true}): only the default combination runs in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const moduleSteps = bindingSteps(binding, { fast: true }).filter((p) => p.tipo === 'create-module');
        return moduleSteps.length === 1 && moduleSteps[0].moduleId === MODULE_COMBINATIONS[0].id;
      })
    ) },
  ];
}

/** Provedor, símbolo e posição dos passos `create-adapter`/`format-adapters`. */
function adapterCases() {
  return [
    { name: 'indexProvider: valid kebab-case with a hyphen; uses the repaired path and does not derive from the port name', fn: () => (
      /^[a-z][a-z0-9-]*$/.test(indexProvider(0)) && indexProvider(5).includes('-')
      && indexProvider(5) !== 'verificadordetoken'
    ) },
    { name: 'indexProvider: um indice, um provedor unico', fn: () => {
      const generated = KNOWN_PORTS.map((_, i) => indexProvider(i));
      return new Set(generated).size === KNOWN_PORTS.length;
    } },
    { name: 'symbolName: TypeScript and JavaScript add the create prefix; Python does not', fn: () => (
      symbolName('typescript', 'prov-a') === 'criarProvA'
      && symbolName('javascript', 'prov-a') === 'criarProvA'
      && symbolName('python', 'prov-a') === 'ProvA'
    ) },
    { name: 'adapterSteps: creates one step for every port in the full vocabulary', fn: () => {
      const steps = adapterSteps();
      return steps.length === KNOWN_PORTS.length
        && steps.every((p, i) => p.tipo === 'create-adapter' && p.port === KNOWN_PORTS[i]);
    } },
  ];
}

/** Onde os passos de adapter caem na sequência, e que portas o vocabulário cobre. */
function adapterPositionCases() {
  return [
    { name: 'bindingSteps: create-adapter follows the final create-module in all three bindings', fn: () => (
      BINDINGS.every((binding) => {
        const steps = bindingSteps(binding);
        return steps.findIndex((p) => p.tipo === 'create-adapter') === steps.findLastIndex((p) => p.tipo === 'create-module') + 1;
      })
    ) },
    { name: 'bindingSteps: format-adapters runs after the final create-adapter and before simulated-clone', fn: () => (
      BINDINGS.every((binding) => {
        const steps = bindingSteps(binding);
        const expectedType = binding === 'python' ? 'format-adapters-python' : 'format-adapters';
        const formatIndex = steps.findIndex((p) => p.tipo === expectedType);
        const iClone = steps.findIndex((p) => p.tipo === 'simulated-clone');
        return formatIndex === steps.findLastIndex((p) => p.tipo === 'create-adapter') + 1 && iClone === formatIndex + 1;
      })
    ) },
    { name: 'bindingSteps: includes an existing factory port and the one missing port', fn: () => (
      BINDINGS.every((binding) => {
        const ports = bindingSteps(binding).filter((p) => p.tipo === 'create-adapter').map((p) => p.port);
        return ports.includes('repository') && ports.includes('tokenVerifier');
      })
    ) },
  ];
}

/** `classifyStep`: as formas de "não rodou" e a do teto estourado. */
function classificationCases() {
  return [
    { name: 'classifyStep: status 0 without an error succeeds', fn: () => classifyStep({ error: undefined, status: 0 }).ok === true },
    { name: 'classifyStep: a defined error fails even with status 0', fn: () => classifyStep({ error: new Error('ENOENT'), status: 0 }).ok === false },
    { name: 'classifyStep: null status (killed by signal) fails', fn: () => classifyStep({ error: undefined, status: null }).ok === false },
    { name: 'classifyStep: nonzero status fails', fn: () => classifyStep({ error: undefined, status: 1 }).ok === false },
    { name: 'classifyStep: missing result (not executed) fails; it never succeeds by default', fn: () => classifyStep(undefined).ok === false },
    { name: 'classifyStep: ETIMEDOUT (spawnSync killed it) reports the timeout limit, not a generic failure', fn: () => {
      const error = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
      const result = classifyStep({ error, status: null, signal: 'SIGTERM', capMs: TEST_CAP_MS });
      return result.ok === false && result.motivo === `timeout expired after ${TEST_CAP_MS / 1000} s`;
    } },
    { name: 'classifyStep: supervisor timeout (EXIT_CAP) reports the configured limit', fn: () => {
      const result = classifyStep({ error: undefined, status: EXIT_CAP, capMs: TEST_SUPERVISOR_CAP_MS });
      return result.ok === false && result.motivo === `timeout expired after ${TEST_SUPERVISOR_CAP_MS / 1000} s`;
    } },
    { name: 'classifyStep: timeout without capMs still fails and reports a timeout', fn: () => {
      const result = classifyStep({ error: undefined, status: EXIT_CAP });
      return result.ok === false && result.motivo.includes('timeout expired');
    } },
  ];
}

function bootCases() {
  const manifests = [
    { id: 'sondapad', basePath: '/api/v1/sondapad', requiredEnv: ['SONDAPAD_API_PORT', 'SONDAPAD_DB_URL'] },
    { id: 'sonda-hi', basePath: '/api/v1/sonda-hi', requiredEnv: ['SONDA_HI_API_PORT', 'SONDA_HI_DB_URL'] },
  ];
  return [
    { name: 'bootEnvironment: sets ROOT_API_PORT and every manifest key; *_PORT gets the port and others get a harmless value', fn: () => {
      const a = bootEnvironment({ rootKeys: ['ROOT_API_PORT'], manifests, port: TEST_PORT });
      const port = String(TEST_PORT);
      return a.ROOT_API_PORT === port && a.SONDAPAD_API_PORT === port && a.SONDA_HI_API_PORT === port
        && a.SONDAPAD_DB_URL === LIMITS.boot.harmlessValue && a.SONDA_HI_DB_URL === LIMITS.boot.harmlessValue;
    } },
    { name: 'bootEnvironment: ROOT_API_PORT is always present, even when no keys are declared', fn: () => (
      bootEnvironment({ rootKeys: [], manifests: [], port: PORT_WITHOUT_KEYS }).ROOT_API_PORT === String(PORT_WITHOUT_KEYS)
    ) },
    { name: 'healthUrl: combines loopback, the manifest basePath, and /health', fn: () => (
      healthUrl(manifests[1], TEST_PORT) === `http://127.0.0.1:${TEST_PORT}/api/v1/sonda-hi/health`
    ) },
    { name: 'chooseBootManifest: selects the first created module; returns null when none exists', fn: () => (
      chooseBootManifest(manifests)?.id === MODULE_COMBINATIONS[0].id && chooseBootManifest([]) === null
    ) },
    { name: 'bootCommand: TS/JS use npm run start; Python uses the venv interpreter with src.composition', fn: () => {
      const paths = { node: '/n', npm: '/npm-cli.js', venvPython: '/v/python' };
      const ts = bootCommand('typescript', paths);
      const js = bootCommand('javascript', paths);
      const py = bootCommand('python', paths);
      return ts.executable === '/n' && sameList(ts.args, ['/npm-cli.js', 'run', 'start']) && sameList(js, ts)
        && py.executable === '/v/python' && sameList(py.args, ['-m', 'src.composition']);
    } },
    { name: 'supervisorArguments: includes probe options when probing and only the timeout otherwise', fn: () => {
      const probe = { url: healthUrl(manifests[0], TEST_PORT), intervalMs: LIMITS.boot.intervalMs, tailLines: LIMITS.boot.tailLines };
      const withVariant = supervisorArguments({ capMs: TEST_CAP_MS, command: ['node', 'a.js'], probe });
      const withoutVariant = supervisorArguments({ capMs: TEST_CAP_MS, command: ['node', 'a.js'] });
      const cap = String(TEST_CAP_MS);
      return sameList(withVariant, ['--timeout-ms', cap, '--until-url', probe.url, '--interval-ms', String(probe.intervalMs), '--tail-lines', String(probe.tailLines), '--', 'node', 'a.js'])
        && sameList(withoutVariant, ['--timeout-ms', cap, '--', 'node', 'a.js']);
    } },
  ];
}

/** Os passos de runtime e as decisoes puras que os cercam (gate sem aviso, fixture lenta, comandos). */
function runtimeCases() {
  return [
    { name: 'countGateWarnings: totals warning counts across modules; zero when clean', fn: () => (
      countGateWarnings('(root): 0 error(s), 0 warning(s)\nm2: 0 error(s), 2 warning(s)\nm3: 0 error(s), 1 warning(s)') === 3
      && countGateWarnings('(root): 0 error(s), 0 warning(s)\nm1: 0 error(s), 0 warning(s)') === 0
      && countGateWarnings(undefined) === 0
    ) },
    { name: 'slowFixture: creates a manifest, ports.json, and app for each binding; Python uses core/ports and api/src', fn: () => {
      const paths = (b) => slowFixture(b).map((f) => f.caminho);
      return paths('typescript').includes('modules/zz-slow/api/src/index.ts')
        && paths('javascript').includes('modules/zz-slow/api/src/index.js')
        && paths('python').includes('modules/zz-slow/core/ports/__init__.py')
        && paths('python').includes('modules/zz-slow/api/src/__init__.py')
        && BINDINGS.every((b) => paths(b).includes('modules/zz-slow/module.json'));
    } },
    { name: 'shutdownDurations: drain fits within half the limit; overflow exceeds it', fn: () => {
      const cap = TEST_CAP_MS;
      const d = shutdownDurations(cap);
      return d.drain <= cap / 2 && d.drain > 0 && d.overflow > cap;
    } },
  ];
}

/** `artifactProblems` e a posicao do passo `artifact` (so Node). */
function artifactCases() {
  const good = { dependencies: { express: '4.22.2' }, scripts: { start: 'node x.js' } };
  return [
    { name: 'artifactProblems: the memory artifact has no issues', fn: () => (
      artifactProblems(good, { withPostgres: false, hasLock: true }).length === 0
    ) },
    { name: 'artifactProblems: React, react-dom, pg without Postgres, and a missing lockfile are reported', fn: () => {
      const bad = { ...good, dependencies: { ...good.dependencies, react: '18', 'react-dom': '18', pg: '8' } };
      const p = artifactProblems(bad, { withPostgres: false, hasLock: false }).join('|');
      return p.includes('react') && p.includes('react-dom') && p.includes('"pg"') && p.includes('package-lock');
    } },
    { name: 'artifactProblems: selecting Postgres requires pg', fn: () => (
      artifactProblems(good, { withPostgres: true, hasLock: true }).some((m) => m.includes('pg'))
      && artifactProblems({ ...good, dependencies: { ...good.dependencies, pg: '8' } }, { withPostgres: true, hasLock: true }).length === 0
    ) },
    { name: 'bindingSteps: artifact runs only for Node bindings, after dependency audit and before runtime', fn: () => {
      const node = ['typescript', 'javascript'].every((b) => {
        const names = bindingNames(b);
        return names.indexOf('artifact') === names.indexOf('ci-dependencies') + 1
          && names.indexOf('composition-selftest') === names.indexOf('artifact') + 1;
      });
      return node && !bindingNames('python').includes('artifact');
    } },
  ];
}

/** Comandos de processo unico, host do boot e a posicao dos passos de runtime. */
function runtimeCommandsCases() {
  return [
    { name: 'singleProcessCommand: no npm wrapper so the signal reaches the correct process', fn: () => {
      const c = { node: '/n', venvPython: '/v/python' };
      const ts = singleProcessCommand('typescript', c);
      const js = singleProcessCommand('javascript', c);
      const py = singleProcessCommand('python', c);
      return ts.executable === '/n' && ts.args.join(' ') === '--import tsx src/composition.ts'
        && js.args.join(' ') === 'src/composition.js'
        && py.executable === '/v/python' && py.args.join(' ') === '-m src.composition';
    } },
    { name: 'bootEnvironment: *_HOST gets the loopback address; a harmless value does not listen', fn: () => (
      bootEnvironment({ rootKeys: ['ROOT_API_HOST'], manifests: [], port: TEST_PORT }).ROOT_API_HOST
        === LIMITS.boot.loopbackHost
    ) },
    { name: 'bindingSteps: composition self-test and shutdown follow all verification in every binding', fn: () => (
      BINDINGS.every((binding) => {
        const names = bindingNames(binding);
        const iCi = names.indexOf('ci-dependencies');
        const iRuntime = names.indexOf('composition-selftest');
        return iRuntime > iCi && names.indexOf('shutdown') === iRuntime + 1 && iRuntime === names.length - 2;
      })
    ) },
  ];
}

/** Os tetos: nenhum passo escapa de uma classe, e os números fazem sentido entre si. */
function capsCases() {
  return [
    { name: 'stepCap: every step in every binding, including --fast, has a positive limit', fn: () => (
      BINDINGS.every((binding) => [false, true].every((fast) => (
        bindingSteps(binding, { fast }).every((p) => stepCap(p) > 0)
      )))
    ) },
    { name: 'stepCap: a step without a class throws instead of running without a limit', fn: () => {
      try {
        stepCap({ tipo: 'inventado' });
        return false;
      } catch {
        return true;
      }
    } },
    { name: 'LIMITS: the boot limit allows several probe attempts', fn: () => (
      LIMITS.capSecondsByClass.boot * 1000 >= LIMITS.boot.intervalMs * 10
    ) },
  ];
}

/** A decisão pura da CLI: um caso aceito, um desconhecido (`--fastish`), um misto e o valor de `--binding`. */
function readOptionsCases() {
  return [
    { name: 'readOptions: accepted flags become options and --binding consumes the following value', fn: () => {
      const { options, error } = readOptions(['--binding', 'python', '--keep', '--fast']);
      return error === undefined && options.binding === 'python' && options.keep && options.fast && !options.selfTest;
    } },
    { name: 'readOptions: --fastish (unknown) returns an error naming the argument and listing accepted options', fn: () => {
      const { options, error } = readOptions(['--fastish']);
      return options === undefined && error.includes('"--fastish"') && ACCEPTED_ARGUMENTS.every((a) => error.includes(a));
    } },
    { name: 'readOptions: accepted and unknown flags together return an error, never partial options', fn: () => {
      const { options, error } = readOptions(['--fast', '--fastish', '--keep']);
      return options === undefined && error.includes('"--fastish"');
    } },
    { name: 'readOptions: --binding --fast returns an error naming the value and listing accepted bindings', fn: () => {
      const { options, error } = readOptions(['--binding', '--fast']);
      return options === undefined && error.includes('"--fast"') && BINDINGS.every((b) => error.includes(b));
    } },
    { name: 'readOptions: an unknown --binding value returns an error; every known binding is accepted', fn: () => (
      readOptions(['--binding', 'ruby']).error?.includes('"ruby"') === true
      && BINDINGS.every((b) => readOptions(['--binding', b]).options?.binding === b)
    ) },
    { name: 'readOptions: --binding without a value returns an error', fn: () => readOptions(['--binding']).error !== undefined },
  ];
}

function firstFailedCases() {
  return [
    { name: 'firstFailed: returns null when every result succeeds', fn: () => firstFailed([{ ok: true }, { ok: true }]) === null },
    { name: 'firstFailed: stops at the first failure and ignores later results', fn: () => {
      const r = firstFailed([{ ok: true }, { ok: false, motivo: 'x' }, { ok: false, motivo: 'y' }]);
      return r !== null && r.motivo === 'x';
    } },
  ];
}

/** O que a dockerizacao do template (ADR-022) acrescenta: passos, pureza e a flag `--docker`. */
function containerCases() {
  const docker = { docker: true };
  return [
    { name: 'gitleaks allowlist: permits both environment credentials and rejects either literal credential', fn: () => {
      const sampleLines = [
        'DATABASE_URL="postgres://${DEPLOY_DB_USER:?required}:${DEPLOY_DB_PASSWORD:?required}@db:5432/app"',
        'DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@db:5432/app"',
        'DATABASE_URL="postgres://app:literal-password@db:5432/app"',
        'DATABASE_URL="postgres://app:$DB_PASSWORD@db:5432/app"',
        'DATABASE_URL="postgres://$DB_USER:literal-password@db:5432/app"',
      ];
      return BINDINGS.every((binding) => {
        const config = readFileSync(join(TEMPLATE_ROOT, 'bindings', binding, 'root', '.gitleaks.toml'), 'utf8');
        const pattern = config.match(/'''([^']+)'''/)?.[1];
        if (pattern === undefined) return false;
        const allowlisted = new RegExp(pattern);
        return allowlisted.test(sampleLines[0]) && allowlisted.test(sampleLines[1])
          && sampleLines.slice(2).every((line) => !allowlisted.test(line));
      });
    } },
    { name: 'bindingSteps: container-files follows verify-map in all three bindings, including --fast', fn: () => (
      BINDINGS.every((binding) => [{}, { fast: true }].every((options) => {
        const names = bindingNames(binding, options);
        return names.indexOf('container-files') === names.indexOf('verify-map') + 1;
      }))
    ) },
    { name: 'bindingSteps: the docker step exists only when docker is enabled', fn: () => (
      BINDINGS.every((b) => !bindingNames(b).includes('docker') && bindingNames(b, docker).includes('docker'))
    ) },
    { name: 'bindingSteps: docker precedes artifact and shutdown while the project remains verified', fn: () => (
      BINDINGS.every((binding) => {
        const names = bindingNames(binding, docker);
        const after = binding === 'python' ? 'composition-selftest' : 'artifact';
        return names.indexOf('docker') !== -1 && names.indexOf('docker') === names.indexOf(after) - 1
          && names.indexOf('docker') < names.indexOf('shutdown');
      })
    ) },
    { name: 'readOptions: --docker is accepted and listed among supported arguments', fn: () => {
      const { options, error } = readOptions(['--docker', '--binding', 'typescript']);
      return error === undefined && options.docker === true && ACCEPTED_ARGUMENTS.includes('--docker');
    } },
    { name: 'classifyStep: skipped succeeds while retaining its reason (never silently green)', fn: () => {
      const r = classifyStep({ status: 0, skipped: 'Docker unavailable' });
      return r.ok === true && r.skipped === 'Docker unavailable' && classifyStep({ status: 0 }).skipped === undefined;
    } },
    { name: 'stepCap: container-files and docker have time limits, with docker receiving the largest', fn: () => (
      stepCap({ tipo: 'container-files' }) > 0 && stepCap({ tipo: 'docker' }) > stepCap({ tipo: 'artifact' })
    ) },
    { name: 'containerProblems: a complete set without markers has no issues; missing required frontend files are reported', fn: () => {
      const present = [...CONTAINER_FILES, ...FRONT_FILES];
      const texts = Object.fromEntries(present.map((a) => [a, 'ok']));
      const withoutFront = containerProblems({ present: CONTAINER_FILES, withFront: false, texts });
      const missingFront = containerProblems({ present: CONTAINER_FILES, withFront: true, texts });
      return containerProblems({ present, withFront: true, texts }).length === 0 && withoutFront.length === 0
        && missingFront.length === FRONT_FILES.length;
    } },
    { name: 'leftoverMarkers: reports project and scope markers but ignores prose markers', fn: () => {
      const leftovers = leftoverMarkers({ 'compose.yml': 'name: <project>-local', 'Dockerfile': 'a <basePath>/health e <MODULE>_DB_URL' });
      return leftovers.length === 1 && leftovers[0].marker === '<project>';
    } },
    { name: 'routeProblems: reports webPath without a location and location without webPath; accepts matching routes', fn: () => {
      const nginx = 'location /a/ {}';
      const ok = routeProblems(nginx, [{ id: 'a', webPath: '/a' }, { id: 'b', webPath: null }]);
      const withoutRoute = routeProblems('', [{ id: 'a', webPath: '/a' }]);
      const leftoverRoute = routeProblems(nginx, [{ id: 'a', webPath: null }]);
      return ok.length === 0 && withoutRoute.length === 1 && leftoverRoute.length === 1;
    } },
    { name: 'connectionError: retries fetch failures but never retries a wrong status or empty result', fn: () => (
      connectionError({ stderr: 'TypeError: fetch failed' }) === true
      && connectionError({ stdout: 'http://h/x 404\n' }) === false
      && connectionError(null) === false
    ) },
    { name: 'fillDeployEnv: assigns queued ports, the password secret, and a harmless value to other keys', fn: () => {
      const text = fillDeployEnv(['DEPLOY_DB_NAME', 'DEPLOY_DB_PASSWORD', 'DEPLOY_DB_PORT', 'DEPLOY_FRONT_PORT'],
        { ports: [11, 22], secret: 's', harmless: 'x' });
      return text === 'DEPLOY_DB_NAME=x\nDEPLOY_DB_PASSWORD=s\nDEPLOY_DB_PORT=11\nDEPLOY_FRONT_PORT=22\n';
    } },
    { name: 'exampleEnvKeys: reads only KEY= lines and ignores comments, blanks, and prose containing =', fn: () => (
      sameList(exampleEnvKeys('# a=b\n\nA=\n  B=1\nc = 2\n'), ['A', 'B'])
    ) },
    { name: 'dockerProbes: frontend checks expect healthz 200, / 404, and the module page; without frontend only health is checked', fn: () => {
      const manifest = { basePath: '/api/v1/m', webPath: '/m' };
      const withVariant = dockerProbes({ withFront: true, origin: 'http://h:1', manifest });
      const withoutVariant = dockerProbes({ withFront: false, origin: 'http://h:1', manifest });
      return withVariant.length === 4 && withVariant.some((x) => x.url.endsWith('/') && x.expected === 404)
        && withVariant.some((x) => x.url === 'http://h:1/m/' && x.expected === 200)
        && withoutVariant.length === 1 && withoutVariant[0].url === 'http://h:1/api/v1/m/health';
    } },
  ];
}

function selfTestCases() {
  return [
    ...containerCases(),
    ...stepsOrderCases(),
    ...setupAndBootCases(),
    ...combinationsCases(),
    ...adapterCases(),
    ...adapterPositionCases(),
    ...classificationCases(),
    ...bootCases(),
    ...runtimeCases(),
    ...runtimeCommandsCases(),
    ...artifactCases(),
    ...capsCases(),
    ...readOptionsCases(),
    ...firstFailedCases(),
  ];
}

function runSelfTest() {
  const cases = selfTestCases();
  let failures = 0;
  for (const testCase of cases) {
    let ok;
    try {
      ok = testCase.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${testCase.name}\n`);
    if (!ok) failures += 1;
  }
  process.stdout.write(`\nself-test (pure core): ${cases.length - failures}/${cases.length} passed\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
