#!/usr/bin/env node
/**
 * template-self-test.mjs — prova que o TEMPLATE gera projeto que passa na própria cadeia que ele
 * prescreve.
 *
 *   node template-self-test.mjs [--binding typescript] [--fast] [--keep] [--autoteste]
 *
 * Fora de `tools/` DE PROPÓSITO: este script é consumido por quem MANTÉM o template, nunca por um
 * projeto gerado — `create-project.mjs` copia `tools/` inteiro para o destino, e um script de teste
 * ali viajaria como fixture morta, nascendo vermelha em todo projeto novo. Um projeto gerado não
 * gera projetos; este script ali seria peso sem consumidor.
 *
 * ESCOPO: as CINCO entradas de `COMBINACOES_DE_MODULO` — as quatro combinações de flag de
 * `create-module.mjs` (padrão, `--no-artifact`,
 * `--no-web`, as duas juntas) — ver `COMBINACOES_DE_MODULO` abaixo.
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
 * Varrer o vocabulário INTEIRO, em vez de citar `repository`/`tokenVerifier` a dedo, cobre os
 * dois ramos do gerador que interessam — porta JÁ em `FABRICAS` (a maioria) e porta AUSENTE dela
 * (hoje só `tokenVerifier`) — e cobre a porta nova sozinho no dia em que o vocabulário crescer
 * de novo (`fila` tem retorno prometido no comentário de `ports-vocabulary.mjs`), sem editar este
 * arquivo. Cada passo confere **exit 0 e conteúdo**: só o exit code não distingue "registrou" de
 * "não fez nada" — a classe exata dos dois bugs, em que a âncora não batia e o script abortava, mas
 * uma âncora que batesse errado por acidente escreveria algo sem ser o esperado e passaria calada.
 * Roda depois do ÚLTIMO `criar-modulo`, antes de `clone-simulado`: os `adapters/`/`src/composition.*`
 * que ele escreve entram no commit simulado e são revalidados por `verify`/`verify.py` a seguir,
 * de graça — nenhum passo novo depois disso, só reaproveitamento do que já roda.
 *
 * `boot` — o passo que SOBE o processo composto do projeto gerado e consulta o `health` de um módulo
 * criado. Existe porque nenhum passo anterior subia o processo, e a tabela `FABRICAS` do
 * `composition.*` usou a chave `memoria` enquanto o `ports.json` dizia `memory`: todo projeto TS/JS
 * gerado quebrava no boot e o autoteste seguia verde. Roda DEPOIS de `primeiro-commit` (o boot pode
 * escrever em disco; o commit simulado já foi medido sobre o staged limpo) e ANTES de
 * `verificar`/`verify`: se o processo não sobe, o resto não mede nada que importe. Porta livre
 * escolhida pelo SO, ambiente mínimo passado pelo PROCESSO filho (nenhum `.env` é reescrito), e a
 * árvore de processos sempre encerrada — ver `supervisionar.mjs`. A parte pura (ambiente, URL,
 * comando) é núcleo; subir, sondar e matar é a casca.
 *
 * TETOS DE TEMPO: todo processo que este arquivo dispara roda sob um teto por CLASSE de passo
 * (`LIMITES`, o ÚNICO lugar dos tunables de tempo). Estourar reprova com "estourou o teto de N s",
 * nunca com um "falhou" genérico, e a ÁRVORE de processos do passo é encerrada (o `spawnSync` com
 * `timeout` mata só o filho direto; o `pytest` órfão que pendurou uma rodada por 57 minutos era neto).
 * A casca de processo é `supervisionar.mjs`, ao lado deste arquivo.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORTAS_CONHECIDAS } from '../tools/gate/ports-vocabulary.mjs';
import { SAIDA_TETO } from './supervisionar.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou o relógio.
// ================================================================================================

export const BINDINGS = ['typescript', 'javascript', 'python'];

/**
 * As CINCO entradas: as QUATRO combinações de flag de `create-module.mjs` MAIS o id com hífen
 * (regressão do `<module_snake>`, ver abaixo) — o invariante é que *qualquer* combinação
 * produz módulo que passa em `verificar`, e "qualquer" só vira prova rodando as quatro, não uma. Um
 * id por combinação, para os quatro módulos conviverem no MESMO projeto (um só
 * `npm install`/`pip install`, um só `verificar` cobrindo os quatro via workspace/descoberta) —
 * repetir a cadeia inteira quatro vezes pagaria 4× o custo sem medir nada a mais.
 */
export const COMBINACOES_DE_MODULO = [
  // UM id COM HIFEN é obrigatório aqui, e é regressão, não variedade: `id` é kebab-case por lei
  // (01-modulo.md §3), e até a correção do marcador `<module_snake>` NENHUM id com hífen tinha
  // manifesto válido possível — `tabela-prefixo` exigia `nota-fiscal_` e `schema-manifesto` proibia
  // o hífen na tabela que começa por ele. O defeito sobreviveu justamente porque todo id daqui era
  // de uma palavra só: o teste foi ajustado para desviar dele em vez de acusá-lo. Tirar
  // `sonda-hifen` desta lista devolve o ponto cego inteiro.
  //
  // CURTO de propósito, e é a SEGUNDA medição, não só a primeira: `<module>` entra em comentário de
  // CABEÇALHO em vários arquivos do molde Python (`api/src/errors.py:1`, o mais apertado, tem só 13
  // caracteres de folga antes de estourar os 110 do ruff). Ids mais longos ("sondasemartefato",
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
 * kebab-case com hífen (`validarOpcoes`), e o código que ele gera para hífen já foi o achado ①
 * — chave de objeto TS/JS não citada e import Python com `-` no meio do
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

/** O nome que `create-adapter.mjs` registra em `src/composition.*` para este binding+provedor —
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
 * OS TUNABLES DE TEMPO — vivem em `template-self-test.config.json` (config versionada, o ÚNICO
 * lugar: nenhum teto, intervalo ou margem é literal neste arquivo). Segundos por CLASSE de passo
 * (`CLASSE_DO_TIPO`): instalar dependência é longo, `--version`/`git` é curto, e um teto só serviria
 * mal a todos. É a ÚNICA leitura de disco do núcleo, feita uma vez na carga do módulo — o resto das
 * funções daqui continua sem tocar `fs`.
 */
export const LIMITES = JSON.parse(
  readFileSync(fileURLToPath(new URL('./template-self-test.config.json', import.meta.url)), 'utf8'),
);

/** Classe de tempo de cada `tipo` de passo. Tipo ausente aqui é erro de programação (ver `tetoDoPasso`). */
const CLASSE_DO_TIPO = {
  'gerar-projeto': 'geracao',
  'criar-modulo': 'geracao',
  'criar-adapter': 'geracao',
  'formatar-adapters': 'geracao',
  'formatar-adapters-py': 'geracao',
  'clone-simulado': 'leve',
  'primeiro-commit': 'leve',
  'mapa-instalado': 'leve',
  venv: 'instalacao',
  'pip-upgrade': 'instalacao',
  'pip-install': 'instalacao',
  'npm-install': 'instalacao',
  'verificar-py': 'verificacao',
  'ci-dependencias-py': 'verificacao',
  'npm-script': 'verificacao',
  boot: 'boot',
  'composition-autoteste': 'geracao',
  desligamento: 'desligamento',
  artefato: 'instalacao',
};

/** O teto, em ms, de um passo — pela CLASSE do tipo dele. Tipo desconhecido LANÇA (nunca "sem teto"). */
export function tetoDoPasso(passo) {
  const classe = CLASSE_DO_TIPO[passo.tipo];
  if (classe === undefined) throw new Error(`passo sem classe de tempo: ${passo.tipo}`);
  return LIMITES.tetoPorClasseS[classe] * 1000;
}

/** Os passos de `criar-modulo`, um por combinação (todas, ou só a PADRÃO no `--fast`). */
function passosDeModulo(rapido) {
  const combinacoes = rapido ? COMBINACOES_DE_MODULO.slice(0, 1) : COMBINACOES_DE_MODULO;
  return combinacoes.map((combinacao) => ({
    nome: `criar-modulo:${combinacao.id}`,
    tipo: 'criar-modulo',
    moduloId: combinacao.id,
    flags: combinacao.flags,
  }));
}

/**
 * O que roda DEPOIS do último `criar-modulo` e antes do que lê o resultado, nos três bindings:
 *   - `criar-adapter:<porta>` — reusa o projeto já gerado (ver "criar-adapter:<porta>" no cabeçalho);
 *   - `formatar-adapters` — `rodarPrettierWrite`/`rodarRuffFormat`: MESMO motivo nos dois bindings,
 *     só a ferramenta muda. Até a rodada que fechou o defeito do hífen no provedor (ADR-011), "ruff
 *     format já bate, mesmo varrendo o vocabulário inteiro" era medido e verdadeiro — porque
 *     `provedorDoIndice` só gerava provedor de UMA letra, sem hífen. Trocar para kebab COM hífen (pra
 *     exercitar o próprio achado ①) engordou a linha de `FABRICAS` além dos 110 cols do ruff MESMO
 *     pro provedor mais curto possível — Python precisa do mesmo passo que TS/JS sempre teve;
 *   - `clone-simulado` — só poda o disco; quem lê o resultado é o `verificar` mais adiante;
 *   - `primeiro-commit` — "este repositório nasce commitável?" só faz sentido sobre o STAGED de um
 *     `git init` + `git add -A` reais, que é o que `clone-simulado` acabou de produzir. Alcança a
 *     skill `git-verificacao-commit` (exceção de fronteira declarada no cabeçalho);
 *   - `boot` — sobe o processo composto e consulta o `health` (ver "boot" no cabeçalho).
 */
function passosDeSetup(binding, rapido) {
  const formatar = binding === 'python' ? 'formatar-adapters-py' : 'formatar-adapters';
  return [
    ...passosDeModulo(rapido),
    ...passosDeAdapter(),
    { nome: 'formatar-adapters', tipo: formatar },
    { nome: 'clone-simulado', tipo: 'clone-simulado' },
    { nome: 'primeiro-commit', tipo: 'primeiro-commit' },
    { nome: 'boot', tipo: 'boot' },
  ];
}

/**
 * Python: sem `build`/`lint` separado — o binding não empacota front-end (sem `web/` nos módulos
 * Python — medido, `bindings/python/_template` não tem pasta `web`), e `verify.py` já cobre forma +
 * limiares + tipos + testes num só passo, como o `npm run verify` do lado Node.
 */
function passosDePython(rapido) {
  return [
    { nome: 'gerar-projeto', tipo: 'gerar-projeto' },
    { nome: 'venv', tipo: 'venv' },
    { nome: 'atualizar-pip', tipo: 'pip-upgrade' },
    { nome: 'instalar', tipo: 'pip-install' },
    ...passosDeSetup('python', rapido),
    { nome: 'verificar', tipo: 'verificar-py' },
    // Depois de `verificar`: o mapa instalado é doutrina, não código do módulo. Sem este passo,
    // `verify-map.mjs --check` seria um `--check` que existe e ninguém chama.
    { nome: 'mapa', tipo: 'mapa-instalado' },
    { nome: 'ci-dependencias', tipo: 'ci-dependencias-py' },
    ...passosDeRuntime(),
  ];
}

/**
 * O que roda DEPOIS de toda a cadeia de verificacao, nos tres bindings: o `--autoteste` da PROPRIA
 * raiz de composicao do projeto gerado (as decisoes puras dela — `composition.*` nao e alcancado por
 * nenhum teste da base, so vive no projeto instanciado) e o desligamento gracioso com PROCESSO REAL.
 * `desligamento` e o ultimo de proposito: ele instala um modulo descartavel (`zz-lento`, com uma rota
 * lenta) que o gate reprovaria se `verify` rodasse depois.
 */
function passosDeRuntime() {
  return [
    { nome: 'composition-autoteste', tipo: 'composition-autoteste' },
    { nome: 'desligamento', tipo: 'desligamento' },
  ];
}

function passosDeNode(binding, rapido) {
  return [
    { nome: 'gerar-projeto', tipo: 'gerar-projeto' },
    { nome: 'instalar', tipo: 'npm-install' },
    ...passosDeSetup(binding, rapido),
    { nome: 'verify', tipo: 'npm-script', script: 'verify' },
    { nome: 'mapa', tipo: 'mapa-instalado' },
    { nome: 'build', tipo: 'npm-script', script: 'build' },
    { nome: 'lint', tipo: 'npm-script', script: 'lint' },
    { nome: 'ci-dependencias', tipo: 'npm-script', script: 'ci:dependencies' },
    { nome: 'artefato', tipo: 'artefato' },
    ...passosDeRuntime(),
  ];
}

/**
 * Os passos de UM binding, em ordem — a decisão de "o que rodar" separada de "como rodar".
 *
 * `verificar` ANTES de `build`, `build` ANTES de `lint` NÃO É ARBITRÁRIO: `npm run build` quebra
 * `npm run lint` porque o bundle minificado em `dist/` passa a ser lintado. Trocar a ordem faria
 * este autoteste deixar de medir esse defeito.
 *
 * `rapido`: só a combinação PADRÃO (sem flag) — medido, as quatro juntas custam ~70s (TS) / ~52s
 * (JS), e o `--fast` combinado (TS+JS) foi de ~25s para ~1m58s — bem em cima do teto de ~2min
 * para caber em pre-commit. Mesma solução que o binding Python já usa (`--fast` pula Python
 * inteiro, cobrindo-o só na agenda): a combinatória cara fica para o run COMPLETO (agenda),
 * pre-commit continua rápido.
 *
 * `ci-dependencias` é o ÚLTIMO passo, nos três: incluí-lo cedo faria este autoteste nascer vermelho
 * por CVE de terceiro antes mesmo de o resto ser medido — um portão que nasce vermelho é um portão
 * que se aprende a ignorar.
 */
export function passosDoBinding(binding, { rapido = false } = {}) {
  return binding === 'python' ? passosDePython(rapido) : passosDeNode(binding, rapido);
}

/** O manifesto cujo `health` o passo `boot` consulta: o do PRIMEIRO módulo criado (o padrão). */
export function escolherManifestoDeBoot(manifestos) {
  return manifestos.find((m) => m.id === COMBINACOES_DE_MODULO[0].id) ?? null;
}

/** `*_PORT` = a porta livre; `*_HOST` = loopback (um host inocuo nao escuta); o resto = valor inocuo. */
function valorDaChaveDeBoot(chave, porta) {
  if (chave.endsWith('_PORT')) return String(porta);
  if (chave.endsWith('_HOST')) return LIMITES.boot.hostDeLoopback;
  return LIMITES.boot.valorInocuo;
}

/**
 * O ambiente MÍNIMO do boot, passado pelo processo filho (nunca reescrevendo `.env`): toda chave
 * que a raiz (`project.json:requiredEnv`) ou um manifesto (`module.json:requiredEnv`) exige. Chave
 * `*_PORT` recebe a porta livre escolhida, `*_HOST` o loopback; as demais, o valor inócuo de `LIMITES.boot`. Pura.
 */
export function ambienteDoBoot({ chavesDaRaiz, manifestos, porta }) {
  const chaves = new Set(['ROOT_API_PORT', ...chavesDaRaiz, ...manifestos.flatMap((m) => m.requiredEnv ?? [])]);
  const ambiente = {};
  for (const chave of chaves) {
    ambiente[chave] = valorDaChaveDeBoot(chave, porta);
  }
  return ambiente;
}

/** A URL do `health` de um módulo, em loopback: `basePath` vem do `module.json`. Pura. */
export function urlDoHealth(manifesto, porta) {
  return `http://127.0.0.1:${porta}${manifesto.basePath}/health`;
}

/**
 * O comando que sobe o processo composto, por binding — o `start` do `package.json` (TS e JS, via
 * `npm run start`, o mesmo que o operador usa) ou `python -m src.composition` pelo Python do venv
 * (rodar `src/composition.py` direto poria `src/` no `sys.path` em vez da raiz do projeto, e o
 * `from adapters.memory import ...` não resolveria). Devolve `{ executavel, args }`. Pura.
 */
export function comandoDoBoot(binding, { node, npm, pythonDoVenv }) {
  if (binding === 'python') return { executavel: pythonDoVenv, args: ['-m', 'src.composition'] };
  return { executavel: node, args: [npm, 'run', 'start'] };
}

/** Os argumentos de `supervisionar.mjs` para um comando sob teto, com ou sem sonda de URL. Pura. */
export function argumentosDoSupervisor({ tetoMs, comando, sonda = null }) {
  const sondagem = sonda === null
    ? []
    : ['--ate-url', sonda.url, '--intervalo-ms', String(sonda.intervaloMs), '--linhas-cauda', String(sonda.linhasCauda)];
  return ['--teto-ms', String(tetoMs), ...sondagem, '--', ...comando];
}

/** PURA — soma os `N aviso(s)` que o gate imprime por modulo. Modulo recem-criado tem de dar zero. */
export function contarAvisosDoGate(texto) {
  let total = 0;
  for (const achado of String(texto ?? '').matchAll(/(\d+) aviso\(s\)/g)) total += Number(achado[1]);
  return total;
}

/**
 * PURA — o que o `package.json` do artefato backend NAO pode ter / TEM de ter. `comPostgres` = algum
 * modulo escolheu o provedor `postgres`: so entao o driver `pg` viaja (dependencia de adapter entra
 * junto com o adapter, nunca por padrao). `react`/`react-dom` sao do front (o Vite os empacota no
 * build): nunca no artefato do backend. Devolve a lista de problemas (vazia = ok).
 */
export function problemasDoArtefato(pacote, { comPostgres, temLock }) {
  const dependencias = pacote?.dependencies ?? {};
  const problemas = [];
  for (const dependenciaDeFront of ['react', 'react-dom']) {
    if (dependencias[dependenciaDeFront] !== undefined) problemas.push(`"${dependenciaDeFront}" (front) no artefato do backend`);
  }
  if (dependencias.express === undefined) problemas.push('"express" ausente do artefato (o runtime o exige)');
  if (comPostgres && dependencias.pg === undefined) problemas.push('provedor postgres escolhido mas "pg" ausente');
  if (!comPostgres && dependencias.pg !== undefined) problemas.push('"pg" no artefato sem nenhum modulo usar postgres');
  if (typeof pacote?.scripts?.start !== 'string') problemas.push('sem scripts.start');
  if (!temLock) problemas.push('sem package-lock.json (instalacao nao reprodutivel)');
  return problemas;
}

/** O modulo descartavel que o passo `desligamento` instala: uma rota lenta (`?ms=N`), por binding. */
export const ID_DO_MODULO_LENTO = 'zz-lento';
export const CAMINHO_LENTO = `/api/v1/${ID_DO_MODULO_LENTO}/lento`;

const MANIFESTO_LENTO = JSON.stringify({
  id: ID_DO_MODULO_LENTO,
  name: 'Lento',
  basePath: `/api/v1/${ID_DO_MODULO_LENTO}`,
  role: 'domain',
  ports: [],
});

/** O app lento de Node: responde 200 depois de `?ms=N` (TS e JS: o mesmo texto, sem anotacao de tipo). */
const APP_LENTO_NODE = [
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
const APP_LENTO_PYTHON = [
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

const PORTS_LENTO_PYTHON = ['from dataclasses import dataclass', '', '', '@dataclass', 'class ModuleDependencies:', '    pass', ''].join('\n');

/** PURA — os arquivos do modulo lento, por binding: `[{ caminho, conteudo }]` relativos a raiz do projeto. */
export function fixtureLenta(binding) {
  const base = `modules/${ID_DO_MODULO_LENTO}`;
  const comuns = [
    { caminho: `${base}/module.json`, conteudo: `${MANIFESTO_LENTO}\n` },
    { caminho: `${base}/config/ports.json`, conteudo: '{}\n' },
  ];
  if (binding === 'python') {
    return [
      ...comuns,
      { caminho: `${base}/core/ports/__init__.py`, conteudo: PORTS_LENTO_PYTHON },
      { caminho: `${base}/api/__init__.py`, conteudo: '' },
      { caminho: `${base}/api/src/__init__.py`, conteudo: APP_LENTO_PYTHON },
    ];
  }
  const arquivo = binding === 'typescript' ? 'index.ts' : 'index.js';
  return [...comuns, { caminho: `${base}/api/src/${arquivo}`, conteudo: APP_LENTO_NODE }];
}

/**
 * PURA — as duas duracoes da requisicao lenta, a partir do teto de drenagem do PROJETO
 * (`config/runtime.json`): "drena" cabe no teto (limitada a metade dele), "estoura" o ultrapassa.
 */
export function duracoesDoDesligamento(drainTimeoutMs) {
  const { lentoDrenaMs, fatorDeEstouro } = LIMITES.desligamento;
  return { drena: Math.min(lentoDrenaMs, Math.floor(drainTimeoutMs / 2)), estoura: drainTimeoutMs * fatorDeEstouro };
}

/** PURA — o comando de UM processo (sem `npm`/`sh` no meio) para a prova de sinal: o sinal tem de chegar nele. */
export function comandoDoProcessoUnico(binding, { node, pythonDoVenv }) {
  if (binding === 'python') return { executavel: pythonDoVenv, args: ['-m', 'src.composition'] };
  if (binding === 'typescript') return { executavel: node, args: ['--import', 'tsx', 'src/composition.ts'] };
  return { executavel: node, args: ['src/composition.js'] };
}

/** Estourou o teto: o `spawnSync` de segurança (`ETIMEDOUT`) ou o supervisor (`SAIDA_TETO`). */
function estourouTeto(resultado) {
  return resultado.error?.code === 'ETIMEDOUT' || resultado.status === SAIDA_TETO;
}

function motivoDoTeto(tetoMs) {
  if (typeof tetoMs !== 'number') return 'estourou o teto (valor nao informado)';
  return `estourou o teto de ${tetoMs / 1000} s`;
}

/**
 * Um resultado bruto vira `{ ok, motivo }`. As formas de "não rodou" — teto estourado, `error`,
 * `status` nulo/indefinido, `status` não-zero — caem em `ok: false`. Nenhuma vira `ok: true`.
 * O teto vem ANTES de `error`: um `ETIMEDOUT` também é `error`, e "falhou" genérico esconderia a causa.
 */
export function classificarPasso(resultado) {
  if (resultado === null || resultado === undefined) {
    return { ok: false, motivo: 'nenhum resultado — passo nao foi executado' };
  }
  if (estourouTeto(resultado)) return { ok: false, motivo: motivoDoTeto(resultado.tetoMs) };
  if (resultado.error !== undefined && resultado.error !== null) {
    return { ok: false, motivo: `erro ao executar: ${resultado.error.message ?? String(resultado.error)}` };
  }
  if (resultado.status === null || resultado.status === undefined) {
    return { ok: false, motivo: 'processo nao terminou (sem status — sinal)' };
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
const PROVA_DESLIGAMENTO = join(AQUI, 'prova-desligamento.py');
// A ÚNICA referência deste arquivo a `skills/` (fora do template) — ver o parágrafo "primeiro-commit"
// no cabeçalho, a exceção de fronteira declarada por escrito.
const RAIZ_BASE = join(RAIZ_TEMPLATE, '..', '..');
const VERIFICAR_COMMIT_PY = join(RAIZ_BASE, 'skills', 'git-verificacao-commit', 'scripts', 'verificar_commit.py');
const CONFIG_SEGREDOS = join(RAIZ_BASE, 'skills', 'git-verificacao-commit', 'scripts', 'config.json');
const NODE = process.execPath;

const SUPERVISOR = join(AQUI, 'supervisionar.mjs');

/**
 * ÚNICO ponto que dispara um processo de verdade: o `supervisionar.mjs` roda o comando sob o teto
 * (`exec.tetoMs`) e encerra a ÁRVORE inteira dele — `spawnSync` com `timeout` mata só o filho direto.
 * O `spawnSync` que cerca o supervisor leva o teto + `margemDoSupervisorS` e é só rede de segurança.
 * `exec` = `{ cwd, tetoMs, env? }`; `sonda` (opcional) transforma o comando em "servidor até o health".
 * O resultado carrega `tetoMs` para `classificarPasso` poder dizer "estourou o teto de N s".
 */
function rodarSupervisionado(comando, exec, sonda = null) {
  const argumentos = argumentosDoSupervisor({ tetoMs: exec.tetoMs, comando, sonda });
  const resultado = spawnSync(NODE, [SUPERVISOR, ...argumentos], {
    cwd: exec.cwd,
    encoding: 'utf8',
    shell: false,
    env: exec.env === undefined ? process.env : { ...process.env, ...exec.env },
    timeout: exec.tetoMs + LIMITES.margemDoSupervisorS * 1000,
  });
  return { ...resultado, tetoMs: exec.tetoMs };
}

/** ÚNICO ponto que roda um script Node de verdade. Array de argumentos, NUNCA `shell: true`. */
function rodarNode(args, exec) {
  return rodarSupervisionado([NODE, ...args], exec);
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
function rodarNpm(args, exec) {
  const entrada = entrypointDoNpm();
  if (entrada === null) return { error: new Error('npm nao encontrado ao lado do node atual'), status: null };
  return rodarSupervisionado([NODE, entrada, ...args], exec);
}

/**
 * `prettier --write` sobre `src/composition.*` — o passo que, em uso real, é o editor (ou o hook de
 * agente `padrao-format` da base Sarak) quem faz, arquivo por arquivo, a cada edição salva. `npm run
 * formato` só ACUSA (`--check`), nunca escreve (comentário no `package.json` do molde: "só o hook
 * escreve") — e `create-adapter.mjs` deliberadamente não formata o que grava, pelo mesmo motivo que
 * não roda o gate por regra isolada. Sem ESTE passo, `verify`/`formato` reprova depois de varrer o
 * vocabulário inteiro: cada `criar-adapter` acrescenta um provedor à MESMA linha de uma porta que já
 * tinha um ou dois, e a linha cresce além do `printWidth` (110, `.prettierrc.json`) sem que ninguém a
 * quebre de novo — não é bug do gerador, é o passo do fluxo real que este autoteste não tinha.
 */
function rodarPrettierWrite(exec) {
  const entrada = entrypointDoPacote(exec.cwd, 'prettier');
  if (entrada === null) return { error: new Error('prettier nao encontrado em node_modules do projeto'), status: null };
  return rodarSupervisionado([NODE, entrada, '--write', 'src/composition.*'], exec);
}

/** `SARAK_PYTHON` (caminho do binário) sobrepõe; senão, `python`/`python3` no PATH — mesma técnica
 * de `ci-dependencies.mjs:resolverPython`, copiada pelo mesmo motivo de fronteira: `tools/` é
 * vendorizado e este script mora fora dele. */
function resolverPythonBase() {
  const candidatos = [process.env.SARAK_PYTHON, 'python', 'python3'].filter(Boolean);
  const teto = LIMITES.tetoPorClasseS.leve * 1000;
  return candidatos.find((c) => spawnSync(c, ['--version'], { shell: false, timeout: teto }).status === 0) ?? null;
}

function caminhoPythonDoVenv(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
}

function caminhoRuffDoVenv(venvDir) {
  return platform() === 'win32' ? join(venvDir, 'Scripts', 'ruff.exe') : join(venvDir, 'bin', 'ruff');
}

/** `ruff format` sobre `src/composition.py` — equivalente Python de `rodarPrettierWrite`, mesmo
 * motivo (ver comentário de `formatarAdaptersPy` em `passosDoBinding`). */
function rodarRuffFormat(venvDir, exec) {
  const executavel = caminhoRuffDoVenv(venvDir);
  if (!existsSync(executavel)) return { error: new Error('ruff nao encontrado no venv do projeto'), status: null };
  return rodarSupervisionado([executavel, 'format', 'src/composition.py'], exec);
}

/** ÚNICO ponto que roda um interpretador Python de verdade — nunca `shell: true`. */
function rodarPython(executavel, args, exec) {
  if (executavel === null) return { error: new Error('interpretador python nao resolvido'), status: null };
  return rodarSupervisionado([executavel, ...args], exec);
}

/** ÚNICO ponto que roda `git` de verdade — resolvido do PATH, nunca `shell: true`. Ausência de git
 * vira `error` no resultado, e `classificarPasso` já reprova isso (lei 7 — não pula). */
function rodarGit(args, exec) {
  return rodarSupervisionado(['git', ...args], exec);
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

/** O `src/composition.*` que `create-adapter.mjs` reescreve, por binding — mesma regra de
 * `create-adapter.mjs:caminhoDeComposicao`. */
function caminhoDeComposicao(destino, binding) {
  const nome = binding === 'python' ? 'composition.py' : `composition.${binding === 'typescript' ? 'ts' : 'js'}`;
  return join(destino, 'src', nome);
}

/**
 * Roda `create-adapter.mjs` e, só se ele saiu 0, confere que a fábrica apareceu DE VERDADE em
 * `src/composition.*` — exit 0 sozinho não distingue "registrou" de "não fez nada", que é a classe
 * exata dos dois bugs da rodada anterior (a âncora não batia, mas um regex que batesse ERRADO por
 * acidente escreveria algo sem ser o esperado e passaria calada, sem este segundo confronto). Erro
 * de conteúdo vira o MESMO formato `{ error, status }` que `classificarPasso` já entende — precedente
 * de `rodarPython`/`rodarNpm` quando a resolução falha antes de qualquer processo rodar.
 */
function criarAdapterEVerificar({ porta, provedor }, { destino, binding }, exec) {
  const resultado = rodarNode([CRIAR_ADAPTER, porta, provedor, '--binding', binding], exec);
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
function simularClone(destino, exec) {
  const init = rodarGit(['init', '-q'], exec);
  if (classificarPasso(init).ok !== true) return init;

  const add = rodarGit(['add', '-A'], exec);
  if (classificarPasso(add).ok !== true) return add;

  const lsFiles = rodarGit(['ls-files'], exec);
  if (classificarPasso(lsFiles).ok !== true) return lsFiles;

  const rastreados = new Set(lsFiles.stdout.split(/\r?\n/).filter((linha) => linha !== ''));
  podarNaoRastreado(join(destino, 'modules'), destino, rastreados);

  return { error: null, status: 0, stdout: '', stderr: '' };
}

/**
 * `create-project`, e depois a PROMESSA dele: o projeto Node nasce COM `package-lock.json`, antes de
 * qualquer modulo (o Dockerfile constroi com `npm ci`). Antes o lock so aparecia como efeito
 * colateral do `npm install` do primeiro `create-module`, e o autoteste nao via a diferenca.
 */
function executarGerarProjeto(_passo, ctx, exec) {
  const resultado = rodarNode([CRIAR_PROJETO, ctx.destino, '--binding', ctx.binding], { ...exec, cwd: RAIZ_TEMPLATE });
  if (classificarPasso(resultado).ok !== true || ctx.binding === 'python') return resultado;
  if (existsSync(join(ctx.destino, 'package-lock.json'))) return resultado;
  return falhaDePreparo('create-project saiu 0 mas nao gerou package-lock.json (binding node)');
}

/**
 * `create-module` SEM `--binding`: o binding vem do `project.json` do projeto gerado — e o que prova
 * que o padrao inferido bate com o molde (antes, um projeto JS ganhava o molde TypeScript).
 * `--role` e obrigatoria na CLI (sem default silencioso) e usa o vocabulario do manifesto. Depois do
 * exit 0, o gate TEM de ter dado ZERO aviso: modulo recem-criado nasce limpo, e aviso (config morta,
 * por exemplo) e defeito do molde, nao ruido.
 */
function executarCriarModulo(passo, ctx, exec) {
  const resultado = rodarNode([CRIAR_MODULO, passo.moduloId, '--role', 'domain', ...passo.flags], exec);
  if (classificarPasso(resultado).ok !== true) return resultado;
  const avisos = contarAvisosDoGate(resultado.stdout);
  if (avisos === 0) return resultado;
  return { ...falhaDePreparo(`modulo recem-criado gerou ${avisos} aviso(s) do gate — o molde tem de nascer limpo`), stdout: resultado.stdout };
}

const PASTA_DO_ARTEFATO = '.artefato';

/** Empacota (`tools/package.mjs <destino>`), le o `package.json` resultante e confere `problemasDoArtefato`. */
function empacotarEConferir(ctx, exec, { nome, comPostgres }) {
  const destino = join(ctx.destino, `${PASTA_DO_ARTEFATO}-${nome}`);
  const resultado = rodarNode([join(ctx.destino, 'tools', 'package.mjs'), destino], exec);
  if (classificarPasso(resultado).ok !== true) return { resultado, destino };
  const pacote = lerJsonDoProjeto(join(destino, 'package.json'));
  const problemas = problemasDoArtefato(pacote, { comPostgres, temLock: existsSync(join(destino, 'package-lock.json')) });
  if (problemas.length === 0) return { resultado, destino };
  return { resultado: falhaDePreparo(`artefato "${nome}" invalido: ${problemas.join('; ')}`), destino };
}

/** Sobe o artefato ja instalado (`npm ci --omit=dev`) e consulta o health do modulo padrao. */
function subirArtefato(ctx, exec, destino) {
  const contexto = lerContextoDeBoot(ctx.destino);
  const manifesto = escolherManifestoDeBoot(contexto.manifestos);
  const porta = descobrirPortaLivre();
  if (manifesto === null || porta === null) return falhaDePreparo('artefato: sem modulo ou sem porta livre');
  const entrada = ctx.binding === 'typescript' ? join('dist', 'src', 'composition.js') : join('src', 'composition.js');
  const env = ambienteDoBoot({ chavesDaRaiz: contexto.chavesDaRaiz, manifestos: contexto.manifestos, porta });
  const sonda = { url: urlDoHealth(manifesto, porta), intervaloMs: LIMITES.boot.intervaloMs, linhasCauda: LIMITES.boot.linhasCauda };
  const tetoMs = LIMITES.tetoPorClasseS.boot * 1000;
  return rodarSupervisionado([NODE, entrada], { cwd: destino, tetoMs, env }, sonda);
}

/**
 * O ARTEFATO backend (binding Node): empacota, confere o `package.json` (sem react, sem `pg` se nenhum
 * modulo usa postgres, COM lock), instala so a producao com `npm ci --omit=dev` e SOBE o artefato —
 * sem o fonte do projeto. Depois troca um modulo para o provedor `postgres` e empacota de novo: o
 * driver tem de entrar. Python nao tem passo de empacotamento (03-operacao.md §9.1).
 */
function executarArtefato(_passo, ctx, exec) {
  const memoria = empacotarEConferir(ctx, exec, { nome: 'memory', comPostgres: false });
  if (classificarPasso(memoria.resultado).ok !== true) return memoria.resultado;
  const instalacao = rodarNpm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { ...exec, cwd: memoria.destino });
  if (classificarPasso(instalacao).ok !== true) return instalacao;
  const subida = subirArtefato(ctx, exec, memoria.destino);
  if (classificarPasso(subida).ok !== true) return subida;

  const caminhoPortas = join(ctx.destino, 'modules', COMBINACOES_DE_MODULO[0].id, 'config', 'ports.json');
  const portas = lerJsonDoProjeto(caminhoPortas);
  writeFileSync(caminhoPortas, `${JSON.stringify({ ...portas, repository: 'postgres' }, null, 2)}\n`, 'utf8');
  return empacotarEConferir(ctx, exec, { nome: 'postgres', comPostgres: true }).resultado;
}

/** A raiz de composicao do projeto gerado roda o PROPRIO `--autoteste` (decisoes puras dela). */
function executarCompositionAutoteste(_passo, ctx, exec) {
  if (ctx.binding === 'python') {
    return rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'src.composition', '--autoteste'], exec);
  }
  if (ctx.binding === 'javascript') return rodarNode(['src/composition.js', '--autoteste'], exec);
  const tsx = entrypointDoPacote(ctx.destino, 'tsx');
  if (tsx === null) return falhaDePreparo('tsx nao encontrado em node_modules do projeto');
  return rodarNode([tsx, 'src/composition.ts', '--autoteste'], exec);
}

/** Instala o modulo lento descartavel no projeto gerado (ver `fixtureLenta`). */
function instalarModuloLento(destino, binding) {
  for (const { caminho, conteudo } of fixtureLenta(binding)) {
    const alvo = join(destino, caminho);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo, 'utf8');
  }
}

/** Uma execucao de `prova-desligamento.py` (UM cenario) sob o supervisor. */
function rodarProvaDeDesligamento(cenario, ctx, exec, contexto) {
  const porta = descobrirPortaLivre();
  if (porta === null) return falhaDePreparo('desligamento: nao foi possivel escolher uma porta livre');
  const pythonDoVenv = caminhoPythonDoVenv(ctx.venvDir);
  const { executavel, args } = comandoDoProcessoUnico(ctx.binding, { node: NODE, pythonDoVenv });
  const ambiente = ambienteDoBoot({ chavesDaRaiz: contexto.chavesDaRaiz, manifestos: contexto.manifestos, porta });
  const duracao = duracoesDoDesligamento(contexto.drainTimeoutMs)[cenario];
  const caminho = `${CAMINHO_LENTO}?ms=${duracao}`;
  const argumentos = [
    PROVA_DESLIGAMENTO, '--cwd', ctx.destino, '--porta', String(porta),
    '--url', `http://${LIMITES.boot.hostDeLoopback}:${porta}${CAMINHO_LENTO}?ms=0`, '--caminho', caminho,
    '--cenario', cenario, '--teto-ms', String(contexto.drainTimeoutMs), '--boot-ms', String(LIMITES.desligamento.esperaDoBootMs),
    '--', executavel, ...args,
  ];
  return rodarPython(ctx.pythonBase ?? resolverPythonBase(), argumentos, { ...exec, env: ambiente });
}

/**
 * O desligamento gracioso com PROCESSO REAL, nos tres bindings: sobe o processo composto + o modulo
 * lento, manda o sinal (SIGTERM; CTRL_BREAK no Windows) com uma requisicao em voo e confere os dois
 * desfechos — drenou (sai 0) e estourou o teto (sai != 0), ambos com o log estruturado.
 */
function executarDesligamento(_passo, ctx, exec) {
  const contexto = lerContextoDeBoot(ctx.destino);
  const runtime = lerJsonDoProjeto(join(ctx.destino, 'config', 'runtime.json'));
  const drainTimeoutMs = runtime.shutdown?.drainTimeoutMs;
  if (!Number.isInteger(drainTimeoutMs)) return falhaDePreparo('config/runtime.json sem shutdown.drainTimeoutMs');
  instalarModuloLento(ctx.destino, ctx.binding);
  const completo = { ...contexto, manifestos: [...contexto.manifestos, JSON.parse(MANIFESTO_LENTO)], drainTimeoutMs };
  let ultimo = null;
  for (const cenario of ['drena', 'estoura']) {
    ultimo = rodarProvaDeDesligamento(cenario, ctx, exec, completo);
    if (classificarPasso(ultimo).ok !== true) return ultimo;
  }
  return ultimo;
}

const BOM = /^﻿/;

function lerJsonDoProjeto(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(BOM, ''));
}

/** O que o boot precisa do projeto gerado: as chaves da raiz e os manifestos dos módulos criados. */
function lerContextoDeBoot(destino) {
  const projeto = lerJsonDoProjeto(join(destino, 'project.json'));
  const base = join(destino, 'modules');
  const manifestos = readdirSync(base)
    .filter((nome) => existsSync(join(base, nome, 'module.json')))
    .map((nome) => lerJsonDoProjeto(join(base, nome, 'module.json')));
  return { chavesDaRaiz: projeto.requiredEnv ?? [], manifestos };
}

/** Uma porta TCP livre em loopback, escolhida pelo SO (`supervisionar.mjs --porta-livre`), ou `null`. */
function descobrirPortaLivre() {
  const resultado = spawnSync(NODE, [SUPERVISOR, '--porta-livre'], {
    encoding: 'utf8',
    shell: false,
    timeout: LIMITES.tetoPorClasseS.leve * 1000,
  });
  const porta = Number(String(resultado.stdout ?? '').trim());
  return Number.isInteger(porta) && porta > 0 ? porta : null;
}

/** Falha de PREPARO do passo, no formato `{ error, status }` que `classificarPasso` já entende. */
function falhaDePreparo(mensagem) {
  return { error: new Error(mensagem), status: null };
}

/**
 * O passo `boot`: sobe o processo composto do projeto gerado e prova que ele responde `200` no
 * `health` de um módulo criado. Toda a decisão (ambiente, URL, comando) é do núcleo; aqui só se
 * junta o que o disco e o SO informam e se entrega ao supervisor, que sonda e encerra a árvore.
 */
function executarBoot(_passo, ctx, exec) {
  const contexto = lerContextoDeBoot(ctx.destino);
  const manifesto = escolherManifestoDeBoot(contexto.manifestos);
  if (manifesto === null) return falhaDePreparo('boot: nenhum modulo criado para consultar o health');
  const porta = descobrirPortaLivre();
  if (porta === null) return falhaDePreparo('boot: nao foi possivel escolher uma porta livre');
  const npm = ctx.binding === 'python' ? null : entrypointDoNpm();
  if (ctx.binding !== 'python' && npm === null) return falhaDePreparo('boot: npm nao encontrado ao lado do node atual');

  const pythonDoVenv = caminhoPythonDoVenv(ctx.venvDir);
  const { executavel, args } = comandoDoBoot(ctx.binding, { node: NODE, npm, pythonDoVenv });
  const env = ambienteDoBoot({ chavesDaRaiz: contexto.chavesDaRaiz, manifestos: contexto.manifestos, porta });
  const sonda = {
    url: urlDoHealth(manifesto, porta),
    intervaloMs: LIMITES.boot.intervaloMs,
    linhasCauda: LIMITES.boot.linhasCauda,
  };
  return rodarSupervisionado([executavel, ...args], { ...exec, env }, sonda);
}

/** Executores dos passos comuns aos três bindings. Cada um: `(passo, ctx, exec) -> resultado bruto`. */
const EXECUTORES_COMUNS = {
  'gerar-projeto': executarGerarProjeto,
  'criar-modulo': executarCriarModulo,
  'composition-autoteste': executarCompositionAutoteste,
  artefato: executarArtefato,
  desligamento: executarDesligamento,
  'criar-adapter': (passo, ctx, exec) => criarAdapterEVerificar(passo, ctx, exec),
  'clone-simulado': (_passo, ctx, exec) => simularClone(ctx.destino, exec),
  'primeiro-commit': (_passo, ctx, exec) => (
    rodarPython(
      ctx.pythonBase ?? resolverPythonBase(),
      [VERIFICAR_COMMIT_PY, '--raiz', ctx.destino, '--config', CONFIG_SEGREDOS],
      { ...exec, cwd: RAIZ_BASE },
    )
  ),
  'mapa-instalado': (_passo, ctx, exec) => (
    rodarNode([VERIFICAR_MAPA, '--check', join(ctx.destino, 'specs', 'arquitetura')], { ...exec, cwd: RAIZ_TEMPLATE })
  ),
  boot: executarBoot,
};

/** Executores dos bindings Node (typescript, javascript). */
const EXECUTORES_NODE = {
  'npm-install': (_passo, _ctx, exec) => rodarNpm(['install', '--prefer-offline', '--no-audit', '--no-fund'], exec),
  'formatar-adapters': (_passo, _ctx, exec) => rodarPrettierWrite(exec),
  'npm-script': (passo, _ctx, exec) => rodarNpm(['run', passo.script], exec),
};

/** Executores do binding Python. */
const EXECUTORES_PYTHON = {
  venv: (_passo, ctx, exec) => rodarPython(ctx.pythonBase, ['-m', 'venv', ctx.venvDir], exec),
  // O `pip` que `python -m venv` instala vem do INTERPRETADOR do sistema, nunca do template — e pode
  // estar velho o bastante para ter CVE própria (medido: pip 25.2 tinha 6, corrigidas em 26.1+).
  // `ci:dependencias` reprova nisso mesmo com toda dependência do projeto em dia, porque `pip-audit`
  // audita o AMBIENTE inteiro, pip incluso.
  'pip-upgrade': (_passo, ctx, exec) => (
    rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'pip', 'install', '--upgrade', 'pip'], exec)
  ),
  'pip-install': (_passo, ctx, exec) => (
    rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['-m', 'pip', 'install', '-e', '.[dev]'], exec)
  ),
  'formatar-adapters-py': (_passo, ctx, exec) => rodarRuffFormat(ctx.venvDir, exec),
  'verificar-py': (_passo, ctx, exec) => (
    rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['verify.py'], { ...exec, env: { SARAK_NODE: NODE } })
  ),
  // `--dependencies` delega para `ci-dependencies.mjs` (Node), que por sua vez resolve UM
  // interpretador Python para `pip_audit` via `SARAK_PYTHON` (ou PATH). Sem `SARAK_PYTHON` apontado
  // para o venv desta rodada, ele cai no `python`/`python3` do PATH — que pode nem ter `pip_audit`
  // instalado. Medido: sem isto, o passo reprova com "ferramenta de auditoria ausente", mesmo com
  // tudo instalado no venv certo.
  'ci-dependencias-py': (_passo, ctx, exec) => (
    rodarPython(caminhoPythonDoVenv(ctx.venvDir), ['verify.py', '--dependencies'], {
      ...exec,
      env: { SARAK_NODE: NODE, SARAK_PYTHON: caminhoPythonDoVenv(ctx.venvDir) },
    })
  ),
};

const EXECUTORES = { ...EXECUTORES_COMUNS, ...EXECUTORES_NODE, ...EXECUTORES_PYTHON };

/** Despacha UM passo para a execução real, sob o teto da CLASSE dele. Único ponto que mapeia `tipo` -> processo. */
function executarPasso(passo, ctx) {
  const executor = EXECUTORES[passo.tipo];
  if (executor === undefined) throw new Error(`passo desconhecido: ${passo.tipo}`);
  return executor(passo, ctx, { cwd: ctx.destino, tetoMs: tetoDoPasso(passo) });
}

/** Apaga a pasta temporária; falha de limpeza NUNCA troca o resultado — só avisa em stderr. */
function limparDestino(destino) {
  try {
    rmSync(destino, { recursive: true, force: true });
  } catch (causa) {
    process.stderr.write(`aviso: falha ao limpar ${destino}: ${causa.message} (nao afeta o resultado)\n`);
  }
}

/** Executa UM passo e mede o tempo dele — a duração entra no relatório (e calibra `LIMITES`). */
function executarMedido(passo, ctx) {
  const inicio = Date.now();
  const resultado = executarPasso(passo, ctx);
  return { passo, classificado: classificarPasso(resultado), saida: resultado, duracaoMs: Date.now() - inicio };
}

/** `venv` sem interpretador resolvido: o passo nem roda, e reprova com a causa. `null` = pode rodar. */
function passoSemInterpretador(passo, ctx) {
  if (ctx.binding !== 'python' || passo.tipo !== 'venv' || ctx.pythonBase !== null) return null;
  const motivo = 'nenhum interpretador python resolvido (SARAK_PYTHON/python/python3)';
  return { passo, classificado: { ok: false, motivo }, saida: null, duracaoMs: 0 };
}

/** Roda os passos em ordem e PARA no primeiro que reprova (`primeiroFalho`). */
function executarPassos(passos, ctx) {
  const executados = [];
  for (const passo of passos) {
    const executado = passoSemInterpretador(passo, ctx) ?? executarMedido(passo, ctx);
    executados.push(executado);
    if (!executado.classificado.ok) break;
  }
  return executados;
}

/**
 * Roda a cadeia inteira de UM binding numa pasta temporária própria. Para no primeiro passo que
 * falhar (`primeiroFalho`). A pasta é sempre removida no `finally` — a MENOS que `--keep` peça
 * para preservar (uso: depurar um binding específico sem recriar o projeto do zero).
 */
function executarBinding(binding, { manter, rapido }) {
  const destino = mkdtempSync(join(tmpdir(), `sarak-autoteste-template-${binding}-`));
  const ctx = { binding, destino, pythonBase: null, venvDir: join(destino, '.venv') };

  try {
    if (binding === 'python') ctx.pythonBase = resolverPythonBase();
    const executados = executarPassos(passosDoBinding(binding, { rapido }), ctx);
    const ok = primeiroFalho(executados.map((e) => e.classificado)) === null;
    return { binding, ok, executados };
  } finally {
    if (!manter) limparDestino(destino);
  }
}

// ================================================================================================
// SAÍDA
// ================================================================================================

/** A causa da falha e a saída do processo (stdout + stderr), uma linha por linha, recuada. */
function imprimirFalha({ classificado, saida }) {
  process.stdout.write(`       ${classificado.motivo}\n`);
  const texto = [saida?.stdout, saida?.stderr].filter(Boolean).join('\n').trim();
  if (texto === '') return;
  for (const linha of texto.split('\n')) process.stdout.write(`       | ${linha}\n`);
}

function imprimirPasso(executado) {
  const { passo, classificado, duracaoMs } = executado;
  const segundos = ((duracaoMs ?? 0) / 1000).toFixed(1);
  process.stdout.write(`  ${classificado.ok ? 'ok   ' : 'FALHA'} ${passo.nome} (${segundos} s)\n`);
  if (!classificado.ok) imprimirFalha(executado);
}

function imprimirBinding(resultado) {
  process.stdout.write(`\nbinding ${resultado.binding}:\n`);
  for (const executado of resultado.executados) imprimirPasso(executado);
  const total = resultado.executados.length;
  const okCount = resultado.executados.filter((e) => e.classificado.ok).length;
  process.stdout.write(`  binding ${resultado.binding}: ${resultado.ok ? 'VERDE' : 'VERMELHO'} (${okCount}/${total} passos rodados chegaram a ok)\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

const FLAGS_BOOLEANAS = { '--fast': 'rapido', '--keep': 'manter', '--autoteste': 'autoteste' };
const ARGUMENTOS_ACEITOS = ['--binding <nome>', ...Object.keys(FLAGS_BOOLEANAS)];

/**
 * argv → `{ opcoes }` ou `{ erro }`. Puro. Argumento desconhecido REPROVA em vez de ser ignorado:
 * o `--rapido` que o `package.json` passava depois que a flag virou `--fast` (ADR-020) caía em
 * silêncio e o "rápido" rodava TUDO — verde indistinguível de "não fez o que pedi" (lei 10). O
 * mesmo vale para o VALOR de `--binding`: `--binding --fast` consumiria `--fast` como nome de
 * binding, e o valor tem de pertencer a `BINDINGS`.
 */
function lerOpcoes(argv) {
  const opcoes = { binding: null, manter: false, autoteste: false, rapido: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (Object.hasOwn(FLAGS_BOOLEANAS, arg)) {
      opcoes[FLAGS_BOOLEANAS[arg]] = true;
      continue;
    }
    if (arg !== '--binding') return { erro: `argumento desconhecido "${arg}" — aceitos: ${ARGUMENTOS_ACEITOS.join(', ')}` };
    if (i + 1 >= argv.length) return { erro: '--binding exige um valor' };
    const valor = argv[i + 1];
    if (!BINDINGS.includes(valor)) {
      return { erro: `--binding "${valor}" invalido — aceitos: ${BINDINGS.join(', ')}` };
    }
    opcoes.binding = valor;
    i += 1;
  }
  return { opcoes };
}

/**
 * `--fast` faz DUAS coisas, as duas para caber no teto de ~2min de pre-commit: só os bindings
 * Node (typescript, javascript) — o binding python sozinho leva ~2m40s (venv + pip install do
 * zero) —, e só a PRIMEIRA entrada de `criar-modulo` (as cinco custam ~70s/~52s a
 * mais). Uso pretendido: pre-commit da base roda `--fast`; a agenda (workflow) roda sem essa
 * flag, cobrindo os três bindings × as cinco entradas — é o consumidor que paga o custo cheio.
 */
function bindingsAlvo(opcoes) {
  if (opcoes.binding !== null) return [opcoes.binding];
  if (opcoes.rapido) return BINDINGS.filter((b) => b !== 'python');
  return BINDINGS;
}

function principal() {
  const { opcoes, erro } = lerOpcoes(process.argv.slice(2));
  if (erro !== undefined) {
    process.stderr.write(`erro: ${erro}\n`);
    return 1;
  }
  if (opcoes.autoteste) return rodarAutoteste();

  const alvo = bindingsAlvo(opcoes);
  const pulados = BINDINGS.filter((b) => !alvo.includes(b));
  if (pulados.length > 0) {
    process.stdout.write(`aviso: pulando ${pulados.join(', ')} (${opcoes.binding !== null ? '--binding' : '--fast'}) — NAO foram medidos nesta rodada.\n`);
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

const NOME_DO_VERIFICAR = { typescript: 'verify', javascript: 'verify', python: 'verificar' };
const PORTA_DE_TESTE = 4321;
const PORTA_SEM_CHAVES = 5000;
const TETO_DE_TESTE_MS = 90000;
const TETO_DO_SUPERVISOR_DE_TESTE_MS = 120000;

function nomesDoBinding(binding, opcoes) {
  return passosDoBinding(binding, opcoes).map((p) => p.nome);
}

function mesmaLista(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ordem dos passos: o que vem antes/depois de quê, em cada binding. */
function casosDeOrdemDosPassos() {
  const fimNode = (b) => {
    const nomes = nomesDoBinding(b);
    return nomes.at(-6) === 'build' && nomes.at(-5) === 'lint' && nomes.at(-4) === 'ci-dependencias'
      && nomes.at(-3) === 'artefato' && nomes.at(-2) === 'composition-autoteste' && nomes.at(-1) === 'desligamento';
  };
  return [
    { nome: 'passosDoBinding(typescript): build, lint, ci-dependencias — e SO DEPOIS composition-autoteste e desligamento (por ULTIMO)', fn: () => fimNode('typescript') },
    { nome: 'passosDoBinding(javascript): mesma forma do typescript', fn: () => fimNode('javascript') },
    { nome: 'passosDoBinding(python): sem build/lint separado (sem web/ nos modulos python), runtime por ULTIMO', fn: () => {
      const nomes = nomesDoBinding('python');
      return !nomes.includes('build') && !nomes.includes('lint') && nomes.at(-5) === 'verificar' && nomes.at(-4) === 'mapa'
        && nomes.at(-3) === 'ci-dependencias' && nomes.at(-2) === 'composition-autoteste' && nomes.at(-1) === 'desligamento';
    } },
    { nome: 'passosDoBinding(python): venv e instalar ANTES do PRIMEIRO criar-modulo', fn: () => {
      const passos = passosDoBinding('python');
      const iPrimeiroModulo = passos.findIndex((p) => p.tipo === 'criar-modulo');
      const nomes = passos.map((p) => p.nome);
      return nomes.indexOf('venv') < iPrimeiroModulo && nomes.indexOf('instalar') < iPrimeiroModulo;
    } },
    { nome: 'passosDoBinding: mapa roda logo depois de verificar/verify, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = nomesDoBinding(binding);
        return nomes.indexOf('mapa') === nomes.indexOf(NOME_DO_VERIFICAR[binding]) + 1;
      })
    ) },
  ];
}

/** Clone simulado, primeiro commit e boot: a cadeia que fecha o setup e antecede o `verify`. */
function casosDeSetupEBoot() {
  return [
    { nome: 'passosDoBinding: clone-simulado depois do ULTIMO passo de setup (criar-modulo/criar-adapter/formatar-adapters), nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        const iUltimoSetup = passos.findLastIndex((p) => (
          p.tipo === 'criar-modulo' || p.tipo === 'criar-adapter'
          || p.tipo === 'formatar-adapters' || p.tipo === 'formatar-adapters-py'
        ));
        return iUltimoSetup !== -1 && passos.findIndex((p) => p.tipo === 'clone-simulado') === iUltimoSetup + 1;
      })
    ) },
    { nome: 'passosDoBinding: primeiro-commit logo depois de clone-simulado, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = nomesDoBinding(binding);
        return nomes.indexOf('primeiro-commit') === nomes.indexOf('clone-simulado') + 1;
      })
    ) },
    { nome: 'passosDoBinding: boot logo depois de primeiro-commit e logo antes de verificar/verify, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = nomesDoBinding(binding);
        const iBoot = nomes.indexOf('boot');
        return iBoot !== -1 && iBoot === nomes.indexOf('primeiro-commit') + 1 && iBoot === nomes.indexOf(NOME_DO_VERIFICAR[binding]) - 1;
      })
    ) },
    { nome: 'passosDoBinding: boot DEPOIS do ultimo criar-modulo, tambem no --fast', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding, { rapido: true });
        return passos.findIndex((p) => p.tipo === 'boot') > passos.findLastIndex((p) => p.tipo === 'criar-modulo');
      })
    ) },
  ];
}

/** As combinações de módulo e o que o `--fast` poda delas. */
function casosDeCombinacoes() {
  return [
    { nome: 'passosDoBinding: TODAS as entradas de COMBINACOES_DE_MODULO, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passosDeModulo = passosDoBinding(binding).filter((p) => p.tipo === 'criar-modulo');
        if (passosDeModulo.length !== COMBINACOES_DE_MODULO.length) return false;
        return COMBINACOES_DE_MODULO.every((c, i) => (
          passosDeModulo[i].moduloId === c.id && mesmaLista(passosDeModulo[i].flags, c.flags)
        ));
      })
    ) },
    { nome: 'COMBINACOES_DE_MODULO: ids unicos (workspaces/descoberta nao podem colidir)', fn: () => (
      new Set(COMBINACOES_DE_MODULO.map((c) => c.id)).size === COMBINACOES_DE_MODULO.length
    ) },
    // INVERTIDA de propósito. Esta catraca já exigiu o CONTRÁRIO ("nenhum id tem hifen"), e era ela
    // que mantinha o defeito vivo: `id` é kebab-case por lei, mas `tabela-prefixo` pedia
    // `nota-fiscal_` enquanto `schema-manifesto` proibia o hífen na tabela derivada — nenhum id com
    // hífen tinha manifesto válido. A rede foi ajustada para desviar do defeito, e com ela verde o
    // defeito virou invisível. Agora a rede EXIGE o caso que antes proibia: sem um id hifenizado, a
    // cadeia inteira volta a nunca exercitar `<module_snake>`.
    { nome: 'COMBINACOES_DE_MODULO: PELO MENOS um id com hifen (regressao do <module_snake>)', fn: () => (
      COMBINACOES_DE_MODULO.some((c) => c.id.includes('-'))
    ) },
    { nome: 'passosDoBinding(..., {rapido:true}): so a combinacao PADRAO, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passosDeModulo = passosDoBinding(binding, { rapido: true }).filter((p) => p.tipo === 'criar-modulo');
        return passosDeModulo.length === 1 && passosDeModulo[0].moduloId === COMBINACOES_DE_MODULO[0].id;
      })
    ) },
  ];
}

/** Provedor, símbolo e posição dos passos `criar-adapter`/`formatar-adapters`. */
function casosDeAdapter() {
  return [
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
  ];
}

/** Onde os passos de adapter caem na sequência, e que portas o vocabulário cobre. */
function casosDePosicaoDeAdapter() {
  return [
    { nome: 'passosDoBinding: criar-adapter roda logo depois do ULTIMO criar-modulo, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        return passos.findIndex((p) => p.tipo === 'criar-adapter') === passos.findLastIndex((p) => p.tipo === 'criar-modulo') + 1;
      })
    ) },
    { nome: 'passosDoBinding: formatar-adapters (prettier TS/JS, ruff format Python) logo apos o ULTIMO criar-adapter e logo antes de clone-simulado, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const passos = passosDoBinding(binding);
        const tipoEsperado = binding === 'python' ? 'formatar-adapters-py' : 'formatar-adapters';
        const iFormatar = passos.findIndex((p) => p.tipo === tipoEsperado);
        const iClone = passos.findIndex((p) => p.tipo === 'clone-simulado');
        return iFormatar === passos.findLastIndex((p) => p.tipo === 'criar-adapter') + 1 && iClone === iFormatar + 1;
      })
    ) },
    { nome: 'passosDoBinding: cobre pelo menos uma porta ja em FABRICAS (repository) e a unica ausente (tokenVerifier)', fn: () => (
      BINDINGS.every((binding) => {
        const portas = passosDoBinding(binding).filter((p) => p.tipo === 'criar-adapter').map((p) => p.porta);
        return portas.includes('repository') && portas.includes('tokenVerifier');
      })
    ) },
  ];
}

/** `classificarPasso`: as formas de "não rodou" e a do teto estourado. */
function casosDeClassificacao() {
  return [
    { nome: 'classificarPasso: status 0 e sem error -> ok', fn: () => classificarPasso({ error: undefined, status: 0 }).ok === true },
    { nome: 'classificarPasso: error definido -> nao ok, mesmo com status 0', fn: () => classificarPasso({ error: new Error('ENOENT'), status: 0 }).ok === false },
    { nome: 'classificarPasso: status null (matado por sinal) -> nao ok', fn: () => classificarPasso({ error: undefined, status: null }).ok === false },
    { nome: 'classificarPasso: status !== 0 -> nao ok', fn: () => classificarPasso({ error: undefined, status: 1 }).ok === false },
    { nome: 'classificarPasso: resultado ausente (nao rodou) -> nao ok, nunca ok por omissao', fn: () => classificarPasso(undefined).ok === false },
    { nome: 'classificarPasso: ETIMEDOUT (spawnSync matou) -> "estourou o teto de N s", nao "falhou" generico', fn: () => {
      const erro = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
      const r = classificarPasso({ error: erro, status: null, signal: 'SIGTERM', tetoMs: TETO_DE_TESTE_MS });
      return r.ok === false && r.motivo === `estourou o teto de ${TETO_DE_TESTE_MS / 1000} s`;
    } },
    { nome: 'classificarPasso: saida do supervisor por teto (SAIDA_TETO) -> "estourou o teto de N s"', fn: () => {
      const r = classificarPasso({ error: undefined, status: SAIDA_TETO, tetoMs: TETO_DO_SUPERVISOR_DE_TESTE_MS });
      return r.ok === false && r.motivo === `estourou o teto de ${TETO_DO_SUPERVISOR_DE_TESTE_MS / 1000} s`;
    } },
    { nome: 'classificarPasso: teto estourado sem tetoMs ainda reprova e diz que foi o teto', fn: () => {
      const r = classificarPasso({ error: undefined, status: SAIDA_TETO });
      return r.ok === false && r.motivo.includes('estourou o teto');
    } },
  ];
}

/** O núcleo puro do passo `boot`: ambiente, URL, comando e argumentos do supervisor. */
function casosDeBoot() {
  const manifestos = [
    { id: 'sondapad', basePath: '/api/v1/sondapad', requiredEnv: ['SONDAPAD_API_PORT', 'SONDAPAD_DB_URL'] },
    { id: 'sonda-hi', basePath: '/api/v1/sonda-hi', requiredEnv: ['SONDA_HI_API_PORT', 'SONDA_HI_DB_URL'] },
  ];
  return [
    { nome: 'ambienteDoBoot: ROOT_API_PORT e toda chave exigida pelos manifestos; *_PORT = porta, o resto = valor inocuo', fn: () => {
      const a = ambienteDoBoot({ chavesDaRaiz: ['ROOT_API_PORT'], manifestos, porta: PORTA_DE_TESTE });
      const porta = String(PORTA_DE_TESTE);
      return a.ROOT_API_PORT === porta && a.SONDAPAD_API_PORT === porta && a.SONDA_HI_API_PORT === porta
        && a.SONDAPAD_DB_URL === LIMITES.boot.valorInocuo && a.SONDA_HI_DB_URL === LIMITES.boot.valorInocuo;
    } },
    { nome: 'ambienteDoBoot: ROOT_API_PORT sempre presente, mesmo sem chaves declaradas', fn: () => (
      ambienteDoBoot({ chavesDaRaiz: [], manifestos: [], porta: PORTA_SEM_CHAVES }).ROOT_API_PORT === String(PORTA_SEM_CHAVES)
    ) },
    { nome: 'urlDoHealth: loopback + basePath do manifesto + /health', fn: () => (
      urlDoHealth(manifestos[1], PORTA_DE_TESTE) === `http://127.0.0.1:${PORTA_DE_TESTE}/api/v1/sonda-hi/health`
    ) },
    { nome: 'escolherManifestoDeBoot: o do primeiro modulo criado; ausente -> null', fn: () => (
      escolherManifestoDeBoot(manifestos)?.id === COMBINACOES_DE_MODULO[0].id && escolherManifestoDeBoot([]) === null
    ) },
    { nome: 'comandoDoBoot: TS/JS = npm run start; Python = -m src.composition pelo python do venv', fn: () => {
      const caminhos = { node: '/n', npm: '/npm-cli.js', pythonDoVenv: '/v/python' };
      const ts = comandoDoBoot('typescript', caminhos);
      const js = comandoDoBoot('javascript', caminhos);
      const py = comandoDoBoot('python', caminhos);
      return ts.executavel === '/n' && mesmaLista(ts.args, ['/npm-cli.js', 'run', 'start']) && mesmaLista(js, ts)
        && py.executavel === '/v/python' && mesmaLista(py.args, ['-m', 'src.composition']);
    } },
    { nome: 'argumentosDoSupervisor: com sonda leva --ate-url/--intervalo-ms/--linhas-cauda; sem sonda, so o teto', fn: () => {
      const sonda = { url: urlDoHealth(manifestos[0], PORTA_DE_TESTE), intervaloMs: LIMITES.boot.intervaloMs, linhasCauda: LIMITES.boot.linhasCauda };
      const com = argumentosDoSupervisor({ tetoMs: TETO_DE_TESTE_MS, comando: ['node', 'a.js'], sonda });
      const sem = argumentosDoSupervisor({ tetoMs: TETO_DE_TESTE_MS, comando: ['node', 'a.js'] });
      const teto = String(TETO_DE_TESTE_MS);
      return mesmaLista(com, ['--teto-ms', teto, '--ate-url', sonda.url, '--intervalo-ms', String(sonda.intervaloMs), '--linhas-cauda', String(sonda.linhasCauda), '--', 'node', 'a.js'])
        && mesmaLista(sem, ['--teto-ms', teto, '--', 'node', 'a.js']);
    } },
  ];
}

/** Os passos de runtime e as decisoes puras que os cercam (gate sem aviso, fixture lenta, comandos). */
function casosDeRuntime() {
  return [
    { nome: 'contarAvisosDoGate: soma os "N aviso(s)" de todos os modulos; zero quando limpo', fn: () => (
      contarAvisosDoGate('(root): 0 erro(s), 0 aviso(s)\nm2: 0 erro(s), 2 aviso(s)\nm3: 0 erro(s), 1 aviso(s)') === 3
      && contarAvisosDoGate('(root): 0 erro(s), 0 aviso(s)\nm1: 0 erro(s), 0 aviso(s)') === 0
      && contarAvisosDoGate(undefined) === 0
    ) },
    { nome: 'fixtureLenta: manifesto + ports.json + app, por binding; Python traz core/ports e api/src', fn: () => {
      const caminhos = (b) => fixtureLenta(b).map((f) => f.caminho);
      return caminhos('typescript').includes('modules/zz-lento/api/src/index.ts')
        && caminhos('javascript').includes('modules/zz-lento/api/src/index.js')
        && caminhos('python').includes('modules/zz-lento/core/ports/__init__.py')
        && caminhos('python').includes('modules/zz-lento/api/src/__init__.py')
        && BINDINGS.every((b) => caminhos(b).includes('modules/zz-lento/module.json'));
    } },
    { nome: 'duracoesDoDesligamento: "drena" cabe no teto (<= metade); "estoura" o ultrapassa', fn: () => {
      const teto = TETO_DE_TESTE_MS;
      const d = duracoesDoDesligamento(teto);
      return d.drena <= teto / 2 && d.drena > 0 && d.estoura > teto;
    } },
  ];
}

/** `problemasDoArtefato` e a posicao do passo `artefato` (so Node). */
function casosDeArtefato() {
  const bom = { dependencies: { express: '4.22.2' }, scripts: { start: 'node x.js' } };
  return [
    { nome: 'problemasDoArtefato: artefato correto (memory) nao tem problema', fn: () => (
      problemasDoArtefato(bom, { comPostgres: false, temLock: true }).length === 0
    ) },
    { nome: 'problemasDoArtefato: react/react-dom, pg sem postgres e falta de lock sao acusados', fn: () => {
      const ruim = { ...bom, dependencies: { ...bom.dependencies, react: '18', 'react-dom': '18', pg: '8' } };
      const p = problemasDoArtefato(ruim, { comPostgres: false, temLock: false }).join('|');
      return p.includes('react') && p.includes('react-dom') && p.includes('"pg"') && p.includes('package-lock');
    } },
    { nome: 'problemasDoArtefato: postgres escolhido exige pg', fn: () => (
      problemasDoArtefato(bom, { comPostgres: true, temLock: true }).some((m) => m.includes('pg'))
      && problemasDoArtefato({ ...bom, dependencies: { ...bom.dependencies, pg: '8' } }, { comPostgres: true, temLock: true }).length === 0
    ) },
    { nome: 'passosDoBinding: artefato so nos bindings Node, depois de ci-dependencias e antes do runtime', fn: () => {
      const node = ['typescript', 'javascript'].every((b) => {
        const nomes = nomesDoBinding(b);
        return nomes.indexOf('artefato') === nomes.indexOf('ci-dependencias') + 1
          && nomes.indexOf('composition-autoteste') === nomes.indexOf('artefato') + 1;
      });
      return node && !nomesDoBinding('python').includes('artefato');
    } },
  ];
}

/** Comandos de processo unico, host do boot e a posicao dos passos de runtime. */
function casosDeComandosDeRuntime() {
  return [
    { nome: 'comandoDoProcessoUnico: nenhum npm no meio (o sinal tem de chegar no processo certo)', fn: () => {
      const c = { node: '/n', pythonDoVenv: '/v/python' };
      const ts = comandoDoProcessoUnico('typescript', c);
      const js = comandoDoProcessoUnico('javascript', c);
      const py = comandoDoProcessoUnico('python', c);
      return ts.executavel === '/n' && ts.args.join(' ') === '--import tsx src/composition.ts'
        && js.args.join(' ') === 'src/composition.js'
        && py.executavel === '/v/python' && py.args.join(' ') === '-m src.composition';
    } },
    { nome: 'ambienteDoBoot: *_HOST recebe o loopback (um valor inocuo nao escuta)', fn: () => (
      ambienteDoBoot({ chavesDaRaiz: ['ROOT_API_HOST'], manifestos: [], porta: PORTA_DE_TESTE }).ROOT_API_HOST
        === LIMITES.boot.hostDeLoopback
    ) },
    { nome: 'passosDoBinding: composition-autoteste e desligamento DEPOIS de toda a verificacao, nos tres bindings', fn: () => (
      BINDINGS.every((binding) => {
        const nomes = nomesDoBinding(binding);
        const iCi = nomes.indexOf('ci-dependencias');
        const iRuntime = nomes.indexOf('composition-autoteste');
        return iRuntime > iCi && nomes.indexOf('desligamento') === iRuntime + 1 && iRuntime === nomes.length - 2;
      })
    ) },
  ];
}

/** Os tetos: nenhum passo escapa de uma classe, e os números fazem sentido entre si. */
function casosDeTetos() {
  return [
    { nome: 'tetoDoPasso: TODO passo de TODO binding (inclusive --fast) tem teto positivo', fn: () => (
      BINDINGS.every((binding) => [false, true].every((rapido) => (
        passosDoBinding(binding, { rapido }).every((p) => tetoDoPasso(p) > 0)
      )))
    ) },
    { nome: 'tetoDoPasso: tipo sem classe LANCA (nunca "sem teto" em silencio)', fn: () => {
      try {
        tetoDoPasso({ tipo: 'inventado' });
        return false;
      } catch {
        return true;
      }
    } },
    { nome: 'LIMITES: o teto do boot comporta varias voltas de sondagem', fn: () => (
      LIMITES.tetoPorClasseS.boot * 1000 >= LIMITES.boot.intervaloMs * 10
    ) },
  ];
}

/** A decisão pura da CLI: um caso aceito, um desconhecido (`--rapido`), um misto e o valor de `--binding`. */
function casosDeLerOpcoes() {
  return [
    { nome: 'lerOpcoes: flags aceitas viram opcoes (--binding consome o valor seguinte)', fn: () => {
      const { opcoes, erro } = lerOpcoes(['--binding', 'python', '--keep', '--fast']);
      return erro === undefined && opcoes.binding === 'python' && opcoes.manter && opcoes.rapido && !opcoes.autoteste;
    } },
    { nome: 'lerOpcoes: --rapido (desconhecido) -> erro que nomeia o argumento e lista os aceitos', fn: () => {
      const { opcoes, erro } = lerOpcoes(['--rapido']);
      return opcoes === undefined && erro.includes('"--rapido"') && ARGUMENTOS_ACEITOS.every((a) => erro.includes(a));
    } },
    { nome: 'lerOpcoes: misto (aceito + desconhecido) -> erro, nunca opcoes parciais', fn: () => {
      const { opcoes, erro } = lerOpcoes(['--fast', '--rapido', '--keep']);
      return opcoes === undefined && erro.includes('"--rapido"');
    } },
    { nome: 'lerOpcoes: --binding --fast -> erro que nomeia o valor e lista os bindings aceitos', fn: () => {
      const { opcoes, erro } = lerOpcoes(['--binding', '--fast']);
      return opcoes === undefined && erro.includes('"--fast"') && BINDINGS.every((b) => erro.includes(b));
    } },
    { nome: 'lerOpcoes: --binding com nome inexistente -> erro; cada binding conhecido e aceito', fn: () => (
      lerOpcoes(['--binding', 'ruby']).erro?.includes('"ruby"') === true
      && BINDINGS.every((b) => lerOpcoes(['--binding', b]).opcoes?.binding === b)
    ) },
    { nome: 'lerOpcoes: --binding sem valor -> erro', fn: () => lerOpcoes(['--binding']).erro !== undefined },
  ];
}

function casosDePrimeiroFalho() {
  return [
    { nome: 'primeiroFalho: lista toda ok -> null', fn: () => primeiroFalho([{ ok: true }, { ok: true }]) === null },
    { nome: 'primeiroFalho: para no PRIMEIRO que falha, ignora os depois', fn: () => {
      const r = primeiroFalho([{ ok: true }, { ok: false, motivo: 'x' }, { ok: false, motivo: 'y' }]);
      return r !== null && r.motivo === 'x';
    } },
  ];
}

function casosDeAutoteste() {
  return [
    ...casosDeOrdemDosPassos(),
    ...casosDeSetupEBoot(),
    ...casosDeCombinacoes(),
    ...casosDeAdapter(),
    ...casosDePosicaoDeAdapter(),
    ...casosDeClassificacao(),
    ...casosDeBoot(),
    ...casosDeRuntime(),
    ...casosDeComandosDeRuntime(),
    ...casosDeArtefato(),
    ...casosDeTetos(),
    ...casosDeLerOpcoes(),
    ...casosDePrimeiroFalho(),
  ];
}

function rodarAutoteste() {
  const casos = casosDeAutoteste();
  let falhas = 0;
  for (const caso of casos) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch {
      ok = false;
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  process.stdout.write(`\nautoteste (nucleo puro): ${casos.length - falhas}/${casos.length} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
