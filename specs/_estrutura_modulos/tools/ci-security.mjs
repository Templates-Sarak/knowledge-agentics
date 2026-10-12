#!/usr/bin/env node
/**
 * ci-security.mjs — estágio 0, FAIL-CLOSED. Duas perguntas, nenhuma delas o gate pode responder:
 *
 *   (a) o `.env` real está VERSIONADO?      — exige `git ls-files`
 *   (b) o que mudou introduziu um SEGREDO?  — exige ler o delta contra um baseline git
 *
 * `04-regras.md` §7.2, linha de `gitignore-secret`: *"Não afirma que o .env está versionado — isso
 * exigiria git ls-files, e o gate não roda git de propósito... O .env que já foi commitado é do passo
 * de CI, fail-closed, e do hook cyber-git-seguro na fronteira do git."* Este arquivo é esse passo.
 *
 *   node tools/ci-security.mjs [--since <ref>] [--json]
 *   node tools/ci-security.mjs --selftest
 *
 * NÃO é regra de gate: compara ESTADO DO GIT (rastreados, delta), o gate não roda git de propósito.
 * Não tem id, não conta para o catálogo — ferramenta, como `contract-compatible.mjs`.
 *
 * ============================================================================================
 * NÚCLEO × CASCA, o mesmo precedente de `affected.mjs`/`contract-compatible.mjs`: núcleo recebe DADO
 * (lista de caminhos rastreados, pares {caminho, conteúdo} do delta), nunca toca `fs`/`child_process`.
 * A casca (`git`, `trackedFiles`, `changedFiles`, `readCurrentContent`) isola TODO acesso a
 * disco/git em pontos nomeados — `execFileSync` sempre com ARRAY de argumentos, nunca `shell: true`
 * (nome de pasta virando comando é o mesmo risco que `verify-commit.mjs` documenta).
 *
 * O DELTA REUSADO, NÃO INVENTADO: mesma forma de `contract-compatible.mjs` — `git diff --name-only
 * <ref>` —, que por sua vez já é a mesma pergunta de `affected.mjs:changedPathsSince` (privada,
 * não exportada; `contract-compatible.mjs` resolve isso escrevendo a MESMA chamada em vez
 * de reimplementar o grafo — o precedente é literal, não análogo). Não é staged: este passo é CI, e
 * staged é conceito de working tree local (é o que `verify-commit.mjs:pre-commit` usa, porque ali
 * SIM há um índice local). Default `HEAD~1`, a mesma escolha e o mesmo argumento de
 * `contract-compatible.mjs`: CI é frequentemente HEAD destacado sem upstream configurado.
 *
 * DOIS VOCABULÁRIOS, NENHUM POR ENTROPIA — a lei 1 não aceita a direção de falso positivo que
 * entropia carrega (hash de teste, UUID de fixture, base64 de imagem inline). Vocabulário fechado
 * pega MENOS; o que ele não pega está declarado em `04-regras.md` §7.2, não escondido.
 *
 *   (1) NOME de chave — `CREDENTIAL_PATTERN`, importado de `rules/operation.mjs` (já exportado, já
 *       fechado, já base de `gateway-credential`/`secret-in-public`). Uma lista, não duas: aqui ele
 *       vira "identificador com esse sufixo, ATRIBUÍDO a um literal" — o mesmo vocabulário, uma
 *       pergunta a mais (atribuição, não só nome).
 *   (2) VALOR de token — vocabulário NOVO, cópia (não import: skills não viajam para o projeto
 *       gerado) do catálogo canônico em `skills/cyber-segredos/scripts/config.json`. Só as formas
 *       com PREFIXO INEQUÍVOCO de fornecedor e o cabeçalho de chave privada — nenhuma delas requer
 *       entropia. Deliberadamente FORA: "Bearer Token" (`bearer\s+...`, genérico, sem prefixo de
 *       fornecedor) e "Segredo atribuído" (`key\s*[:=]\s*'...'`, já coberto pelo vocabulário (1)).
 *       "String de conexão" também é conferida, mas só é ignorada quando usuário E senha são
 *       interpolação de ambiente — assim URLs configuráveis passam sem liberar credenciais literais.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CREDENTIAL_PATTERN } from './gate/rules/operation.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou `process.env`.
// ================================================================================================

/** `.env` da raiz OU `modules/<qualquer>/.env` — a mesma pergunta que `gitignore-secret` faz sobre o
 * arquivo de ignore, aqui sobre o que JÁ está no índice. */
export function isEnvReal(trackedPath) {
  return trackedPath === '.env' || /^modules\/[^/]+\/\.env$/.test(trackedPath);
}

export function versionedEnv(tracked) {
  return tracked.filter(isEnvReal);
}

/** O sufixo de `CREDENTIAL_PATTERN` sem a âncora `$` — reusado, nunca reescrito. */
const CREDENTIAL_SUFFIX = CREDENTIAL_PATTERN.source.slice(0, -1);

/** Identificador terminado no sufixo fechado, ATRIBUÍDO a um literal — nunca uma leitura (`process.env.X`,
 * `os.environ["X"]`), porque essas não têm `[:=]` seguido de aspas logo depois do nome. */
export const ASSIGNED_CREDENTIAL_KEY = new RegExp(
  `[A-Za-z_][A-Za-z0-9_]*${CREDENTIAL_SUFFIX}\\s*[:=]\\s*['"\`][^'"\`\\s]{4,}['"\`]`,
);

/**
 * Valor de token com prefixo de fornecedor inequívoco, ou cabeçalho de chave privada. Cópia do
 * catálogo canônico `skills/cyber-segredos/scripts/config.json` — só as nove formas sem entropia e
 * com prefixo fechado; a origem e o corte estão no cabeçalho do arquivo.
 */
/** @type {[string, RegExp][]} */
export const VALUE_VOCABULARY = [
  ['AWS Access Key', /AKIA[0-9A-Z]{16}/],
  ['GitHub Token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['GitHub PAT fine-grained', /github_pat_[A-Za-z0-9_]{60,}/],
  ['Google API Key', /AIza[0-9A-Za-z_-]{35}/],
  ['Slack Token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe Secret', /(?:sk|rk)_live_[0-9a-zA-Z]{20,}/],
  ['npm Token', /npm_[A-Za-z0-9]{36}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/],
  ['Private Key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Connection string', /(postgres|postgresql|mysql|mongodb)(\+srv)?:\/\/(?!(?:\$\{[A-Za-z_][A-Za-z0-9_]*(?::\?[^}]*)?\}|\$[A-Za-z_][A-Za-z0-9_]*):(?:\$\{[A-Za-z_][A-Za-z0-9_]*(?::\?[^}]*)?\}|\$[A-Za-z_][A-Za-z0-9_]*)@)[^\s'"]+:[^\s'"]+@/i],
];

/** `****` para trecho curto; senão os 4 primeiros + `...` + os 2 últimos — nunca o segredo inteiro. */
export function mask(snippet) {
  const clean = snippet.trim();
  return clean.length <= 8 ? '****' : `${clean.slice(0, 4)}...${clean.slice(-2)}`;
}

/**
 * Varre pares `{caminho, conteudo}` já lidos (a casca lê; o núcleo só olha texto) contra os DOIS
 * vocabulários. Um achado por LINHA (a primeira forma que casar) — várias mensagens para a mesma
 * linha não acrescentam conserto, só ruído (lei 2).
 */
export function scanSecrets(files) {
  const findings = [];
  for (const { path, content } of files) {
    content.split(/\r?\n/).forEach((line, index) => {
      const number = index + 1;
      const byValue = VALUE_VOCABULARY.find(([, pattern]) => pattern.test(line));
      if (byValue !== undefined) {
        findings.push({ path, line: number, kind: byValue[0], snippet: mask(line.match(byValue[1])[0]) });
        return;
      }
      const matchedByKey = line.match(ASSIGNED_CREDENTIAL_KEY);
      if (matchedByKey !== null) {
        findings.push({ path, line: number, kind: 'assigned credential key', snippet: mask(matchedByKey[0]) });
      }
    });
  }
  return findings;
}

// ================================================================================================
// CASCA — toca disco e git. `git()` é o ÚNICO ponto que roda `git` de verdade.
// ================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));

/** Mesmo raciocínio de `gate/context.mjs:findRootProjeto` — cópia, não import: fora de escopo. */
function findRoot(start) {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = join(current, '..');
    if (relative(parent, current) === '') break;
    current = parent;
  }
  return start;
}

const ROOT = findRoot(HERE);
const MAX_SIZE_BYTES = 2_000_000;

/** ÚNICO ponto que roda `git` de verdade. Array de argumentos — nunca `shell: true`. */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** `null` quando o git não responde (fora de repositório, índice corrompido) — a casca decide reprovar. */
function trackedFiles() {
  try {
    return git(['ls-files']).split(/\r?\n/).filter((l) => l.trim() !== '');
  } catch {
    return null;
  }
}

/**
 * O hash da ÁRVORE VAZIA — constante do Git, igual em todo repositório que existe (não precisa ser
 * alcançável por nenhum commit para funcionar como base de `git diff`). Comparar contra ela faz TODO
 * arquivo rastreado contar como delta — é "tudo", não "nada": mais verificação nunca fere o
 * fail-closed, menos verificação sim.
 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** A árvore vazia não é um commit — `^{commit}` reprovaria uma constante que é sempre válida por
 * definição, então ela nunca passa pela verificação normal. */
function validRef(ref) {
  if (ref === EMPTY_TREE) return true;
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Repositório com um commit só não tem `HEAD~1` — sem isto, o PRIMEIRO pipeline de todo repositório
 * Sarak nasce vermelho aqui (medido no teste real). `--since` explícito
 * NUNCA é substituído em silêncio: só o DEFAULT cai para a árvore vazia quando não resolve — uma ref
 * que o usuário escolheu errada continua reprovando, para não esconder o erro dele.
 */
function effectiveRef(since) {
  if (since !== null) return since;
  return validRef(DEFAULT_REF) ? DEFAULT_REF : EMPTY_TREE;
}

/** `null` quando a ref não resolve. Mesma forma de `contract-compatible.mjs` — não um terceiro mecanismo. */
function changedFiles(ref) {
  try {
    return git(['diff', '--name-only', '--no-renames', ref]).split(/\r?\n/).filter((l) => l.trim() !== '');
  } catch {
    return null;
  }
}

/** Conteúdo ATUAL do caminho (a árvore de trabalho, não o blob do delta) — `null` se sumiu, é
 * binário demais para valer a pena, ou maior que o teto. Erro de leitura nunca vira exceção aqui. */
function readCurrentContent(relativePath) {
  const target = join(ROOT, relativePath);
  try {
    if (!existsSync(target) || statSync(target).size > MAX_SIZE_BYTES) return null;
    return readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

function availableGitleaks() {
  try {
    execFileSync('gitleaks', ['version'], { cwd: ROOT, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

/** Segunda opinião, nunca a primeira: mesmo comando de `hooks/cyber-git-seguro.js` para o push
 * (`detect --log-opts <ref>..HEAD`) — precedente já testado nesta base, não uma invenção nova. */
function runGitleaks(ref) {
  try {
    execFileSync('gitleaks', ['detect', '--log-opts', `${ref}..HEAD`, '--redact', '--no-banner'], {
      cwd: ROOT, encoding: 'utf8',
    });
    return { ran: true, findings: false, output: '' };
  } catch (error) {
    // gitleaks sai != 0 tanto por ACHADO quanto por erro de uso — a saída é quem distingue.
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return { ran: true, findings: true, output: output.slice(0, 1500) };
  }
}

function collectDelta(ref) {
  const paths = changedFiles(ref);
  if (paths === null) return null;
  return paths
    .map((path) => ({ path, content: readCurrentContent(path) }))
    .filter((a) => a.content !== null);
}

// ================================================================================================
// SAÍDA — as três situações do fail-closed nunca podem ser a mesma linha (lei 10).
// ================================================================================================

function analyze(ref) {
  const tracked = trackedFiles();
  if (tracked === null) {
    return { status: 'git-unavailable', ref, compatible: false, envs: [], secrets: [], gitleaks: null };
  }
  if (!validRef(ref)) {
    return { status: 'invalid-ref', ref, compatible: false, envs: [], secrets: [], gitleaks: null };
  }

  const envs = versionedEnv(tracked);
  const delta = collectDelta(ref);
  const emptyDelta = delta !== null && delta.length === 0;
  const secrets = delta === null ? [] : scanSecrets(delta);
  const gitleaks = availableGitleaks() ? runGitleaks(ref) : { ran: false };

  return {
    status: emptyDelta ? 'empty-delta' : 'compared',
    ref,
    compatible: envs.length === 0 && secrets.length === 0 && !(gitleaks.ran && gitleaks.findings),
    envs,
    secrets,
    gitleaks,
  };
}

function printHuman(r) {
  if (r.status === 'git-unavailable') {
    process.stdout.write('  x Git did not respond (outside a repository or index is corrupted) — FAIL-CLOSED: secret absence cannot be proven\n');
    return;
  }
  if (r.status === 'invalid-ref') {
    process.stdout.write(`  x invalid or missing ref: "${r.ref}" — FAIL-CLOSED: there is no baseline to compare\n`);
    return;
  }
  const refLabel = r.ref === EMPTY_TREE ? `${r.ref} (empty tree — no HEAD~1, new repository)` : r.ref;
  process.stdout.write(`ci-security: comparing with --since ${refLabel}\n`);
  if (r.status === 'empty-delta') {
    process.stdout.write('  empty delta — nothing changed in this run (Git responded; this differs from "not checked")\n');
  }
  if (r.envs.length > 0) {
    for (const e of r.envs) process.stdout.write(`  x tracked .env: ${e} — a real secret is tracked by Git\n`);
  } else {
    process.stdout.write('  ok   no tracked .env files\n');
  }
  if (r.secrets.length > 0) {
    for (const s of r.secrets) process.stdout.write(`  x ${s.path}:${s.line}: ${s.kind} — ${s.snippet}\n`);
  } else {
    process.stdout.write('  ok   no recognized secrets in the delta\n');
  }
  if (!r.gitleaks.ran) {
    process.stdout.write('  !    gitleaks not found — optional second opinion skipped (absence does not fail)\n');
  } else if (r.gitleaks.findings) {
    process.stdout.write(`  x gitleaks (second opinion) found a secret:\n${r.gitleaks.output}\n`);
  } else {
    process.stdout.write('  ok   gitleaks (second opinion): no findings\n');
  }
}

function printJson(r) {
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

const DEFAULT_REF = 'HEAD~1';

function readOptions(argv) {
  const options = { since: null, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--selftest') { options.selfTest = true; continue; }
    if (argv[i] === '--json') { options.json = true; continue; }
    if (argv[i] === '--since') { options.since = argv[i + 1] ?? null; i += 1; continue; }
  }
  return options;
}

function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();

  const result = analyze(effectiveRef(options.since));
  if (options.json) printJson(result);
  else {
    printHuman(result);
    process.stdout.write(`\nci-security: ${result.compatible ? 'OK' : 'FAILED'}\n`);
  }
  return result.compatible ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra fixtures em memória, mais entrada adversarial (lei 8).
// ================================================================================================

function selfTestCases() {
  return [
    { name: 'tracked root .env is reported', tracked: ['.env', 'src/x.ts'], expected: ['.env'] },
    { name: 'tracked module .env is reported', tracked: ['modules/orders/.env'], expected: ['modules/orders/.env'] },
    { name: '.env.example is not a real .env file', tracked: ['.env.example', 'modules/x/.env.example'], expected: [] },
    { name: 'no sensitive files are tracked returns an empty list', tracked: ['src/x.ts', 'README.md'], expected: [] },
  ];
}

/**
 * Estas duas fixtures precisam PARECER segredo de verdade para o vocabulário reconhecer — mas
 * `tools/` entra na própria varredura (`create-project.mjs` copia a pasta inteira para o
 * projeto gerado); medido: escritas literais, `ci-seguranca` acusa A SI MESMO, apontando estas
 * duas linhas. Por isso são MONTADAS em tempo de execução — o texto-FONTE deste arquivo nunca
 * contém o padrão contíguo, só o valor já concatenado em memória o contém. Nenhuma ofuscação:
 * mesmo motivo de um scanner de vírus não guardar a própria assinatura em texto puro dentro do
 * binário. O valor RESULTANTE, que os testes exercitam, é sempre o literal esperado.
 */
function build(...parts) {
  return parts.join('');
}

const TEST_AWS_KEY = build('AKIA', 'IOSFODNN7', 'EXAMPLE');
const TEST_KEY = build('STRIPE_API', '_KEY');

function databaseUrlCases({ databaseUrl, interpolatedUsername, environmentCredential, literalCredential }) {
  return [
    {
      name: 'connection URL: both credentials use environment interpolation -> ignored',
      files: [{ path: 'compose.yml', content: databaseUrl(interpolatedUsername, environmentCredential) }],
      expectedType: null,
    },
    {
      name: 'connection URL: shell environment credentials -> ignored',
      files: [{ path: 'compose.yml', content: databaseUrl('$DB_USER', '$DB_PASSWORD') }],
      expectedType: null,
    },
    {
      name: 'connection URL: literal password -> detected',
      files: [{ path: 'compose.yml', content: databaseUrl('app', literalCredential) }],
      expectedType: 'Connection string',
    },
    {
      name: 'connection URL: environment username and literal password -> detected',
      files: [{ path: 'compose.yml', content: databaseUrl(interpolatedUsername, literalCredential) }],
      expectedType: 'Connection string',
    },
    {
      name: 'connection URL: literal username and environment password -> detected',
      files: [{ path: 'compose.yml', content: databaseUrl('app', environmentCredential) }],
      expectedType: 'Connection string',
    },
  ];
}

function adversarialInputCases() {
  return [
    { name: 'semicolon injection input is treated as text, never executed', files: [{ path: 'a.ts', content: 'const cmd = "; echo INJECTED";' }], expectedType: null },
    { name: 'command substitution input is treated as text, never executed', files: [{ path: 'a.ts', content: 'const cmd = "$(echo INJECTED)";' }], expectedType: null },
    { name: 'shell operator input is treated as text, never executed', files: [{ path: 'a.ts', content: 'const cmd = "& echo INJECTED";' }], expectedType: null },
  ];
}

function scanCases() {
  const databaseUrl = (username, password) => `DATABASE_URL="postgres://${username}:${password}@db:5432/app"`;
  const interpolatedUsername = '${DEPLOY_DB_USER:?required}';
  const environmentCredential = '${DEPLOY_DB_PASSWORD:?required}';
  const literalCredential = ['literal', 'password'].join('-');
  return [
    {
      name: 'AWS Access Key: finding',
      files: [{ path: 'a.ts', content: `const k = "${TEST_AWS_KEY}";` }],
      expectedType: 'AWS Access Key',
    },
    {
      name: 'assigned credential key is reported through CREDENTIAL_PATTERN',
      files: [{ path: 'a.ts', content: `const ${TEST_KEY} = "real-value-here";` }],
      expectedType: 'assigned credential key',
    },
    {
      name: 'reading an environment variable without assigning it is not reported',
      files: [{ path: 'a.ts', content: 'const x = process.env.MODULE_API_KEY;' }],
      expectedType: null,
    },
    {
      name: '.env.example with an empty key is not reported',
      files: [{ path: '.env.example', content: 'MODULE_API_KEY=\n' }],
      expectedType: null,
    },
    ...databaseUrlCases({ databaseUrl, interpolatedUsername, environmentCredential, literalCredential }),
    ...adversarialInputCases(),
  ];
}

function runSelfTest() {
  let failures = 0;
  const register = (name, ok, detail) => {
    process.stdout.write(`  ${ok ? 'ok   ' : 'FAIL'} ${name}\n`);
    if (!ok) {
      failures += 1;
      if (detail !== undefined) process.stdout.write(`       ${detail}\n`);
    }
  };

  for (const testCase of selfTestCases()) {
    const obtained = versionedEnv(testCase.tracked);
    const ok = JSON.stringify(obtained) === JSON.stringify(testCase.expected);
    register(testCase.name, ok, `expected: ${JSON.stringify(testCase.expected)}; received: ${JSON.stringify(obtained)}`);
  }

  for (const testCase of scanCases()) {
    const findings = scanSecrets(testCase.files);
    const ok = testCase.expectedType === null ? findings.length === 0 : findings.some((a) => a.kind === testCase.expectedType);
    register(testCase.name, ok, `findings: ${JSON.stringify(findings)}`);
  }

  // Nenhum achado, em nenhum vocabulário, pode expor o segredo INTEIRO — só o mascarado. Verificado
  // por PROPRIEDADE (mais curto, tem "...", nunca contém o segredo inteiro), não comparando com um
  // segundo literal igual ao de `TEST_AWS_KEY` — reintroduziria o mesmo problema que este
  // conserto existe para resolver.
  const trulyMasked = mask(TEST_AWS_KEY);
  const okMasking = trulyMasked.includes('...')
    && trulyMasked.length < TEST_AWS_KEY.length
    && !trulyMasked.includes(TEST_AWS_KEY)
    && mask('short') === '****';
  register('mask() never exposes the full secret', okMasking);

  const total = selfTestCases().length + scanCases().length + 1;
  process.stdout.write(`\nself-test: ${total - failures}/${total} passed\n`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
