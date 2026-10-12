/**
 * rules/structure.mjs — família "Estrutura" do catálogo (specs/arquitetura/04-regras.md §4.1).
 * ids: manifest, manifest-schema, structure, strict-structure, web-declared, artifact-declared,
 *      navigation-declared, tests, web-tests, gateway-tests, root-manifest
 *
 * `root-manifest` é de escopo `root` e mora aqui porque a FAMÍLIA é a mesma — o manifesto é o
 * item estrutural que declara a unidade. Escopo e família são eixos independentes.
 */
import { loadSchema, validate } from '../schema.mjs';

const REQUIRED_FIELDS = [
  'id', 'name', 'version', 'description', 'role', 'binding', 'basePath', 'webPath',
  'data', 'requiredEnv', 'ports', 'consumes', 'ui', 'permissions',
  'publicRoutes', 'sensitiveFields', 'navigation', 'exportsSummary', 'generatesArtifact',
];

const BINDINGS = ['typescript', 'javascript', 'python'];

const ALLOWED_ENTRIES = new Set([
  'module.json', 'package.json', 'pyproject.toml', 'requirements.txt', 'README.md',
  '.env', '.env.example', '.gitignore', 'package-lock.json', 'node_modules',
  'tsconfig.json', 'tsconfig.build.json', 'jsconfig.json', 'vitest.config.ts', 'vitest.config.js',
  'eslint.config.mjs', 'eslint.config.js',
  // `reports/` e onde `npm run coverage`/`pytest --cov` escrevem lcov+junit — ela so existe
  // depois de rodada, nunca escrita a mao, e e SEMPRE `reports/`, nos tres bindings (a config
  // dita isso, nao o nome do pacote — diferente do `.egg-info`, que carrega o nome do pacote e por
  // isso e tolerado por FORMA, nao por lista). `.gitignore` a cobre; aqui e so a arvore fechada.
  // `.coverage` e o banco SQLite que o `coverage.py` (por baixo do pytest-cov) escreve na RAIZ do
  // modulo, fora de `reports/` — nao e escolha nossa, e onde a ferramenta grava por padrao.
  // As DUAS travadas por maquina: `gate/tests/cases.mjs`, caso "manifest-schema — CHAMARIZ" —
  // regride a tolerancia de qualquer uma e `strict-structure` acusa um id nao declarado ali.
  'reports', '.coverage',
  // `dist/` NAO esta aqui, de proposito — medido (nao presumido) que a entrada seria
  // INALCANCAVEL: `gate/context.mjs:SKIP_WALK` (FORA de escopo) ja contem `'dist'`, e
  // `entradasRaiz` filtra tudo que esta em `SKIP_WALK` ANTES desta lista ser consultada
  // (unica excecao e `'generated'`, via `IGNORED_CONTENT_BUT_ENTRY`) — `dist` nunca chega a
  // `ctx.entradasRaiz`, entao uma entrada aqui nunca teria efeito nenhum. Lista normativa com
  // item inalcancavel e declaracao sem efeito (o mesmo defeito que `'generated'` teve nesta MESMA
  // lista, antes de `IGNORED_CONTENT_BUT_ENTRY` existir — lá a saída foi TORNAR alcançável
  // porque uma regra precisava; aqui nada precisa, entao a saída é não declarar).
  'contract', 'config', 'core', 'api', 'web', 'database', 'tests', 'generated',
]);

const CONFIGS = ['api', 'domain', 'security', 'ports', 'texts'];

/**
 * As três pastas que `generatesArtifact` declara (01-modulo.md §2, "só se generatesArtifact").
 *
 * `database/` fica DE FORA de propósito, embora o `create-module.mjs --no-artifact` também a
 * descarte: quem declara banco é `data.tables`, não `generatesArtifact`. Módulo sem artefato COM
 * tabela própria é o caso ordinário de domínio — cobrar `database/` aqui seria falso positivo
 * garantido nele.
 */
const ARTIFACT_DIRS = ['core/engine/', 'core/templates/', 'generated/'];

/**
 * O conjunto obrigatório do molde — sem esta lista, a árvore fica fechada por CIMA
 * (`strict-structure` reprova entrada não prevista) e aberta por BAIXO: um módulo pode perder o
 * domínio inteiro, as portas, o banco e a config de tipos, e o gate diz "conforme".
 *
 * A fronteira com quem já cobra, para não haver duas mensagens para um defeito: `contract/` é do
 * `contract`; `web/` é do `web-declared`; `core/engine`, `core/templates` e `generated/` são do
 * `artifact-declared`; `database/` é do `migrations`; `module.json` é do `manifest`
 * (`ctx.manifestoErro`). Nada disso se repete aqui. `core/gateways/` também fica de fora, de
 * propósito: módulo sem `consumes` legitimamente não tem gateway nenhum, e cobrá-lo seria falso
 * positivo garantido.
 */
const REQUIRED_DIRS = ['core/domain/', 'core/ports/'];

/**
 * O arquivo de manifesto/tipos que só o binding declarado exige (a tabela abaixo).
 * `requirements.txt` fica de fora: `pyproject.toml` já é o manifesto de dependência do binding
 * Python, e exigir os dois seria redundância sem verificador que a justifique.
 */
const REQUIRED_FILES_BY_BINDING = {
  typescript: ['tsconfig.json', 'package.json'],
  javascript: ['package.json'],
  python: ['pyproject.toml'],
};

/** Existe ao menos um arquivo sob o prefixo informado? */
export function hasFileIn(ctx, prefix) {
  return ctx.files.some((a) => a.rel.startsWith(prefix));
}

/**
 * Barril da pasta — `index` em TS/JS, `__init__` em Python. Ele DOCUMENTA o slot e não é um gateway:
 * no molde ele exporta só `GatewayError` e traz o gateway de verdade como exemplo comentado.
 */
const DIR_BARRELS = ['index', '__init__'];

/**
 * Os gateways REAIS do módulo, pelo nome do arquivo e sem os barris.
 *
 * UMA implementação, e as duas regras que a usam são as duas pontas do mesmo triângulo:
 * `gateway-declared` casa este nome com `module.json:consumes`, e `gateway-tests` o casa com o
 * teste que o espelha. Duas listas divergiriam no primeiro barril novo que alguém acrescentasse de
 * um lado só — e a exclusão de barril é justamente a parte fácil de esquecer.
 */
export function gatewaysOf(ctx) {
  return ctx.code
    .filter((a) => a.rel.startsWith('core/gateways/'))
    .map((a) => a.rel.split('/').pop().replace(/\.[^.]+$/, ''))
    .filter((name) => !DIR_BARRELS.includes(name));
}

/**
 * Existe teste que ESPELHA este alvo? A convenção é a da tabela canônica (§3.1, "Teste | espelha o
 * alvo + `.test`"), e a leitura é liberal de propósito nas quatro formas que as três linguagens
 * usam: a pergunta é se o teste EXISTE, não se o nome dele está canônico — nomenclatura de teste é
 * assunto do §3.1 e não tem verificador. Ser liberal aqui só reduz falso positivo.
 */
function hasTestOf(ctx, name) {
  const shapes = [`${name}.test`, `${name}.spec`, `test_${name}`, `${name}_test`];
  return ctx.files.some((a) => {
    if (!a.isTest) return false;
    return shapes.includes(a.rel.split('/').pop().replace(/\.[^.]+$/, ''));
  });
}

/**
 * A pasta de artefato está presente?
 *
 * `generated/` se detecta pela ENTRADA da raiz, não por arquivo: o conteúdo dela é saída de máquina e
 * fica fora de `ctx.arquivos` de propósito (varrê-lo faria as regras de código julgar HTML gerado).
 * As outras duas são fonte escrita à mão, e ali o arquivo é a prova — pasta vazia não é `core/engine`.
 */
function hasArtifactDir(ctx, dir) {
  if (dir !== 'generated/') return hasFileIn(ctx, dir);
  return ctx.rootEntries.includes('generated');
}

function checkIdentity(manifest, ctx) {
  const findings = [];
  if (manifest.id !== ctx.dirId) {
    findings.push(`id "${manifest.id}" does not match folder name "${ctx.dirId}"`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id ?? '')) {
    findings.push(`id "${manifest.id}" must use lowercase kebab-case`);
  }
  const expectedRoute = `/api/v1/${manifest.id}`;
  if (manifest.basePath !== expectedRoute) {
    findings.push(`basePath "${manifest.basePath}" should be "${expectedRoute}"`);
  }
  return findings;
}

/**
 * `role` NAO entra aqui — `role` e enum, e enum e o que o JSON Schema expressa: quem acusa e
 * `manifest-schema`, e `manifest` cala. O precedente e o proprio `root-manifest`, que ja e um id
 * so com a mesma justificativa ("tudo que o `project.json` afirma e FORMA"). `binding` fica de fora
 * desta decisao — nenhum caso o cobre — e continua checado aqui.
 */
function checkVocabulary(manifest) {
  const findings = [];
  if (!BINDINGS.includes(manifest.binding)) {
    findings.push(`binding "${manifest.binding}" is not supported (choose from ${BINDINGS.join(', ')})`);
  }
  return findings;
}

export default [
  {
    id: 'manifest',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      if (ctx.errorManifest !== null) return [ctx.errorManifest];
      const manifest = ctx.manifest;
      const missing = REQUIRED_FIELDS.filter((field) => manifest[field] === undefined);
      if (missing.length > 0) return [`missing manifest fields: ${missing.join(', ')}`];
      return [...checkIdentity(manifest, ctx), ...checkVocabulary(manifest)];
    },
  },
  {
    id: 'manifest-schema',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      // Sem manifesto legivel, a regra `manifest` ja reprovou — nao empilhamos ruido em cima.
      if (ctx.manifest === null) return [];
      return validate(ctx.manifest, loadSchema('module'), 'module.json');
    },
  },
  {
    /**
     * O manifesto da RAIZ — existência, JSON válido e forma, sob UM id só.
     *
     * O módulo tem dois ids para isto (`manifest` e `manifest-schema`), e a fronteira entre eles
     * não tem par a resolver: `manifest-schema` é dono da
     * FORMA — inclusive `role`, que é enum — e `manifest` cala nela (`checkVocabulary` acima).
     * O `manifest` do módulo só existe além do schema por causa das cláusulas RELACIONAIS
     * (`id` = nome da pasta, `basePath` derivada do `id`), e a raiz não tem nenhuma: ela não tem
     * nome de pasta a casar nem rota a derivar — por isso ela sempre foi um id só, e é o precedente
     * que fechou o do módulo.
     */
    id: 'root-manifest',
    severity: 'error',
    scope: 'root',
    check(project) {
      // Modulo solto (extraido e ainda nao religado) nao e projeto e nao tem raiz a declarar — a
      // mesma guarda de `verification-declared` e `derived-lint`.
      if (!project.isProject) return [];
      const { present, value, error } = project.manifest;
      if (!present) {
        return ['project.json is missing from the project root — it declares root environment requirements'
          + ' (schema: tools/gate/schemas/project.schema.json). Without it, wiring secrets such as JWT, database, and provider credentials'
          + ' are omitted from .env.example and never validated'];
      }
      if (value === null) return [`project.json is not valid JSON — ${error}`];
      return validate(value, loadSchema('project'), 'project.json');
    },
  },
  {
    id: 'structure',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      // `contract/openapi.yaml` NAO entra aqui: a regra `contract` e a dona do arquivo de ponta a
      // ponta (ausente, ilegivel, sem rota obrigatoria) e emite a mesma frase. Duas regras dizendo
      // "contract/openapi.yaml ausente" e um defeito com duas mensagens — e a segunda nao acrescenta
      // conserto nenhum. Um defeito, uma mensagem, um conserto.
      if (!hasFileIn(ctx, 'api/')) findings.push('api/ is missing');
      if (!hasFileIn(ctx, 'tests/')) findings.push('tests/ is missing');
      for (const topic of CONFIGS) {
        if (!ctx.configs[topic].present) findings.push(`config/${topic}.json is missing`);
      }
      for (const dir of REQUIRED_DIRS) {
        if (!hasFileIn(ctx, dir)) findings.push(`${dir} is empty or missing`);
      }
      if (!ctx.rootEntries.includes('README.md')) findings.push('README.md is missing');
      // Manifesto ilegivel e do `manifest` (`ctx.manifestoErro`) — sem binding para consultar, o
      // conjunto por binding fica de fora, nao acusado duas vezes pelo mesmo defeito.
      const binding = ctx.manifest?.binding;
      for (const name of REQUIRED_FILES_BY_BINDING[binding] ?? []) {
        if (!ctx.rootEntries.includes(name)) {
          findings.push(`${name} is missing — required file for binding "${binding}"`);
        }
      }
      return findings;
    },
  },
  {
    /**
     * `*.egg-info/` é o análogo Python de `node_modules` — artefato de INSTALAÇÃO, não entrada
     * escrita à mão —, e pelo mesmo motivo tolerado por forma em vez de nome fixo: o nome carrega
     * o `name` do `pyproject.toml` (`acme-registros` → `acme_registros.egg-info`), então não cabe
     * num `Set` de literais como `node_modules` cabe. `setuptools` grava esta pasta na ÁRVORE FONTE
     * — editável ou não — sempre que o pacote é instalado a partir do próprio diretório; é
     * comportamento do backend de build, não escolha deste template. É também o caso ORDINÁRIO do
     * módulo extraído (§1.1): sem projeto ao redor para instalar as dependências pela raiz, instalar
     * a partir da própria pasta do módulo é a única forma, e gera o mesmo artefato.
     */
    id: 'strict-structure',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      return ctx.rootEntries
        .filter((name) => !ALLOWED_ENTRIES.has(name) && !name.endsWith('.egg-info'))
        .map((name) => `unexpected entry at module root: "${name}" — the tree is closed`);
    },
  },
  {
    id: 'web-declared',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      if (ctx.manifest?.webPath == null) return [];
      const pages = ctx.files.filter((a) => a.rel.startsWith('web/src/pages/') && !a.isTest);
      if (pages.length === 0) return ['webPath is declared, but web/src/pages has no actual page'];
      return [];
    },
  },
  {
    /**
     * `navigation` não-nulo significa que o conector monta uma entrada de menu para este módulo
     * (01-modulo.md §3.2, "o conector monta o menu a partir de `navigation`"). Menu leva a uma tela,
     * e quem declara a tela é `webPath`: `navigation` com `webPath: null` é entrada apontando para o
     * nada.
     *
     * UMA direção só, e a inversa é legítima de propósito: `webPath` sem `navigation` é a página
     * alcançável por URL direta e fora do menu. A doutrina em lugar nenhum exige que toda tela
     * esteja no menu — cobrar isso proibiria a tela de detalhe, que é o caso ordinário.
     *
     * `icon` não é verificável e não é tentado: não existe conjunto de ícones conhecido pelo
     * template (§7.2).
     */
    id: 'navigation-declared',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const navigation = ctx.manifest?.navigation;
      // Forma do objeto e do `manifest-schema`; aqui so importa a declaracao existir.
      if (navigation == null) return [];
      if (ctx.manifest?.webPath != null) return [];
      return ['navigation is declared but webPath is null — the connector builds its menu from navigation, so this entry points nowhere. '
        + 'Declare webPath or clear navigation'];
    },
  },
  {
    id: 'artifact-declared',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      // BIDIRECIONAL: `true` exige as tres, `false` proibe as tres. A doutrina autoriza os DOIS
      // consertos ("Descartar e permitido; renomear, nao"), entao a mensagem nomeia os dois — dizer
      // so um manda o autor criar pasta que ele decidiu, com razao, nao ter.
      //
      // Guarda de aplicabilidade primeiro: manifesto ausente ou ilegivel e do `manifest`, e campo
      // ausente ou de tipo errado e do `manifest-schema`. So declaracao booleana de verdade entra.
      if (typeof ctx.manifest?.generatesArtifact !== 'boolean') return [];

      const divergent = ARTIFACT_DIRS
        .filter((dir) => hasArtifactDir(ctx, dir) !== ctx.manifest.generatesArtifact);
      if (divergent.length === 0) return [];

      const all = ARTIFACT_DIRS.join(', ');
      if (ctx.manifest.generatesArtifact) {
        return [`generatesArtifact: true but ${divergent.join(', ')} is missing from the module — create the missing files, `
          + `or set generatesArtifact to false and remove all three (${all}). Removing them is allowed; renaming them is not`];
      }
      return [`generatesArtifact: false but ${divergent.join(', ')} is present in the module — remove the extra files, `
        + `or set generatesArtifact to true and include all three (${all}). Removing them is allowed; renaming them is not`];
    },
  },
  {
    id: 'tests',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      if (!hasFileIn(ctx, 'tests/domain/')) findings.push('tests/domain/ is empty or missing');
      if (!hasFileIn(ctx, 'tests/contract/')) findings.push('tests/contract/ is empty or missing');
      return findings;
    },
  },
  {
    /**
     * A terceira camada de teste do §5, com a MESMA guarda de `web-declared`: quem declara a tela
     * é `webPath`, e módulo sem tela não tem o que testar. `create-module.mjs --no-web` remove
     * `tests/web` E zera `webPath`, então a condicional casa sozinha — a regra não cobra nada de
     * quem decidiu, com razão, não ter tela.
     *
     * Verifica PRESENÇA, nunca conteúdo: o §5 pede os três estados (`loading`, `empty`, `error`) e
     * isso não é decidível por máquina. A mensagem os cita para o conserto ser o certo, e a regra
     * afirma só o que checa.
     */
    id: 'web-tests',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      if (ctx.manifest?.webPath == null) return [];
      if (hasFileIn(ctx, 'tests/web/')) return [];
      return ['webPath is declared but tests/web/ is empty or missing — the declared page needs a test'
        + ' (§5 requires loading, empty, and error states). Add the test or remove the screen by clearing webPath'];
    },
  },
  {
    /**
     * O terceiro lado do triângulo `gateway ⟷ consumes ⟷ teste`. Os outros dois já existem:
     * `gateway-declared` liga o arquivo ao `consumes`, e `consumes-contract` liga o `consumes` ao
     * contrato do dono. Falta o teste — e sem ele uma dependência entre módulos pode existir,
     * declarada e conforme, sem uma linha que a exercite.
     *
     * NÃO é "tem arquivo na pasta" com outro nome: `tests` cobra a PASTA (`tests/domain/`,
     * `tests/contract/` não-vazias), e esta cobra UM teste POR gateway. Um módulo com três gateways
     * e um teste passa naquela e cai nesta.
     *
     * A pasta do teste não é imposta: o §5 não tem camada `tests/gateways/`, então o teste vive onde
     * couber (`tests/contract/`, `tests/domain/`) e o que se cobra é o NOME que espelha o gateway.
     */
    id: 'gateway-tests',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      return gatewaysOf(ctx)
        .filter((name) => !hasTestOf(ctx, name))
        .map((name) => `core/gateways/${name}: gateway has no test — it is another module's dependency, and module dependencies must be exercised. `
          + `Add a test whose name matches the gateway (${name}.test.* or test_${name}.*)`);
    },
  },
];
