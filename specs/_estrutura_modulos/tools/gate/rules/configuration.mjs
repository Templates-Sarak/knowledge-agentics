/**
 * rules/configuration.mjs — família "Configuração e ambiente" (specs/arquitetura/04-regras.md §4.4).
 * ids: valid-config, config-schema, dead-config, port-declared, hardcode-url, hardcode-number,
 *      silent-fallback, open-cors, env-declared, env-example, env-module,
 *      env-outside-loader, gitignore-secret, secret-in-public,
 *      verification-declared, derived-lint, root-env-declared,
 *      root-hardcode-url, root-fallback, pre-commit-installed
 *
 * As SETE últimas são sobre o PROJETO, não sobre o módulo, e por isso têm `escopo: 'root'`:
 * recebem `ctx.projeto` em vez de um contexto de módulo e rodam UMA vez por invocação. Com
 * `escopo: 'module'` e uma guarda, o resultado seria certo mas a saída não: um defeito de projeto
 * emitiria uma mensagem por módulo — dez módulos, dez mensagens idênticas para um conserto só.
 * Global nunca serviu: `analisar` descarta achado global cujo módulo não esteja entre os
 * selecionados, e a raiz não é módulo nenhum.
 */
import { loadSchema, validate } from '../schema.mjs';
// Vocabulário de credencial: UMA lista, a do `gateway-credential`. As duas regras fazem a mesma
// pergunta sobre a mesma chave por ângulos diferentes — duas listas divergiriam no primeiro sufixo
// novo que alguém acrescentasse de um lado só.
// `scanRoot` vem do mesmo lugar, e pelo mesmo argumento: e o percurso das linhas de codigo da
// FIACAO, usado por quatro regras de raiz espalhadas por duas familias. Duas copias de um laco
// divergiriam no primeiro filtro novo (`isTest` foi exatamente esse filtro).
import { CREDENTIAL_PATTERN, scanRoot } from './operation.mjs';
// `codeText` remove comentario e docstring. Regra que julga CODIGO nao pode ler o texto cru:
// a chave citada num comentario ("nunca leia MODULO_SEGREDO aqui") vira uso de verdade.
import { codeText } from '../text.mjs';
// A MESMA função que o `--check` do gerador usa. Importar (e não reimplementar) é o que impede
// a regra e o gerador de divergirem — o defeito que o gerador existe para eliminar, um nível acima.
import { BINDINGS, outputOf } from '../../generate-lint-config.mjs';

const CONFIGS = ['api', 'domain', 'security', 'ports', 'texts'];

/**
 * Chave de ambiente da RAIZ. `ROOT_` é prefixo RESERVADO, e é o que a distingue da chave de módulo
 * (`<MODULE>_*`, cobrada por `env-module`): sem convenção não há como uma regra dizer de quem é a
 * chave. O vocabulário já chamava a raiz assim — o `.env` do módulo aponta para ela por `ENV_ROOT`.
 */
const ROOT_KEY = /\bROOT_[A-Z0-9_]+\b/g;

/**
 * URL literal. UMA implementação, e as duas regras que a usam são o mesmo defeito em dois
 * territórios: `hardcode-url` no módulo e `root-hardcode-url` na fiação. Endereço de infraestrutura
 * vem do ambiente nos dois lados — o que muda é só de onde ele é declarado.
 */
const URL_LITERAL = /["'`]https?:\/\/[^"'`]+["'`]/;

/**
 * Default silencioso de env, nas quatro formas em que ele aparece. UMA lista, compartilhada por
 * `silent-fallback` (módulo) e `root-fallback` (fiação): o defeito é literalmente o mesmo — a
 * ausência de configuração deixa de derrubar o boot e passa a virar um valor embutido.
 */
const FALLBACK_PATTERNS = [
  /process\.env\[[^\]]+\]\s*(\?\?|\|\|)\s*['"`]/,
  /process\.env\.\w+\s*(\?\?|\|\|)\s*['"`]/,
  /getenv\([^)]*,\s*['"]/,
  /environ\.get\([^)]*,\s*['"]/,
];
const LOADER_FILES = ['api/src/config.ts', 'api/src/config.js', 'api/src/config.py'];

/** Os dois caminhos que o `.gitignore` do projeto TEM de cobrir. `modules/*` vale por qualquer id. */
const SECRETS_TO_IGNORE = ['.env', 'modules/any-module/.env'];

/**
 * Prefixos que o bundler EXPÕE no bundle do front. Vocabulário fechado — quem decide o que é
 * público é o build tool, não o projeto.
 *
 * A formulação intuitiva é invertida e vale registrar: chave SEM prefixo usada no front não vaza —
 * o bundler simplesmente não a injeta, e ela chega `undefined`. O defeito é o contrário, e é este:
 * valor secreto numa variável de prefixo público, que por isso vira público de verdade.
 */
const PUBLIC_PREFIXES = [
  'VITE_', 'NEXT_PUBLIC_', 'PUBLIC_', 'REACT_APP_', 'NUXT_PUBLIC_', 'EXPO_PUBLIC_', 'GATSBY_',
];

const PUBLIC_KEY = new RegExp(`\\b(?:${PUBLIC_PREFIXES.join('|')})[A-Z0-9_]+\\b`, 'g');

function isPublicWithCredential(key) {
  return PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)) && CREDENTIAL_PATTERN.test(key);
}

/** Linhas efetivas de um `.gitignore`: sem comentário e sem branco, na ordem original. */
function ignorePatterns(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * O padrão casa o caminho? Subconjunto honesto do gitignore, e é o bastante para a pergunta desta
 * regra: padrão SEM barra casa o nome do arquivo em qualquer profundidade; com barra, casa o
 * caminho a partir da raiz. `*` não atravessa `/`, `**` atravessa.
 *
 * O casamento é EXATO, e é o que mantém `.env.example` versionável: `.env` não casa `.env.example`.
 */
function matchesIgnore(pattern, path) {
  const clean = pattern.replace(/\/$/, '');
  const withoutAnchor = clean.startsWith('/') ? clean.slice(1) : clean;
  const target = clean.includes('/') ? path : path.split('/').pop();
  // `**/` inicial vale ZERO ou mais diretorios, inclusive nenhum: `**/.env` cobre tanto o `.env` da
  // raiz quanto o de `modules/x/`. Traduzi-lo como `.*/` exigiria ao menos uma barra e faria a
  // regra acusar um `.gitignore` correto — falso positivo, a direcao que ela nao pode ter.
  const expression = withoutAnchor.startsWith('**/')
    ? `(?:.*/)?${asRegex(withoutAnchor.slice(3))}`
    : asRegex(withoutAnchor);
  return new RegExp(`^${expression}$`).test(target);
}

/**
 * Traduz o glob do gitignore para regex, caractere a caractere.
 *
 * Percorrer, e não encadear `replace`, é deliberado: a versão encadeada precisava de um caractere
 * neutro para segurar o `**` entre uma troca e outra, e esse marcador invisível acabou GRAVADO no
 * arquivo — que virou binário aos olhos do `grep`. Tradução sem estado escondido não tem como
 * deixar rastro.
 */
function asRegex(glob) {
  let output = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      output += '.*';
      i += 1;
    } else if (glob[i] === '*') {
      output += '[^/]*';
    } else if (glob[i] === '?') {
      output += '[^/]';
    } else {
      output += glob[i].replace(/[.+^${}()|[\]\\]/, '\\$&');
    }
  }
  return output;
}

/** O `.gitignore` ignora este caminho? Vence o ÚLTIMO padrão que casa, como no git. */
function isIgnored(patterns, path) {
  let ignored = false;
  for (const pattern of patterns) {
    const denied = pattern.startsWith('!');
    if (matchesIgnore(denied ? pattern.slice(1) : pattern, path)) ignored = !denied;
  }
  return ignored;
}

/** Linhas de um `.env`, ignorando comentário e branco. Devolve [chave, valor]. */
function readEnvPairs(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const equal = line.indexOf('=');
      return equal === -1 ? [line, ''] : [line.slice(0, equal).trim(), line.slice(equal + 1).trim()];
    });
}

function fileByName(ctx, rel) {
  return ctx.files.find((a) => a.rel === rel) ?? null;
}

function isLoader(rel) {
  return LOADER_FILES.includes(rel) || /vite\.config|next\.config/.test(rel);
}

/** O laco de `chave` isolado do de `secret-in-public.verificar` — mesma tecnica das outras
 * regras desta familia, para o aninhamento caber no limiar (04-regras.md §4.7). */
function publicKeyFindingsInLine(file, number, text) {
  const findings = [];
  for (const key of text.match(PUBLIC_KEY) ?? []) {
    if (!isPublicWithCredential(key)) continue;
    findings.push(`${file.rel}:${number}: "${key}" has a PUBLIC prefix and a credential`
      + ' name — this value is included in the frontend bundle');
  }
  return findings;
}

/**
 * Uma mensagem por exceção cujo `rule` não é id do catálogo. Id antigo (na tabela do ADR-024) ganha a
 * dica exata do que trocar; id que nunca existiu é acusado sem dica — inventar uma seria pior que calar.
 */
function exceptionsWithUnknownId(value, renamed, catalogIds) {
  if (!Array.isArray(value?.exceptions) || catalogIds === undefined) return [];
  return value.exceptions.flatMap((exception, index) => {
    const id = exception?.rule;
    if (typeof id !== 'string' || catalogIds.has(id)) return [];
    const where = `config/compliance.json: exceptions[${index}].rule "${id}"`;
    const fresh = renamed?.[id];
    if (fresh === undefined) {
      return [`${where} is not a catalog rule id — this exception does not waive any finding (ids in specs/arquitetura/04-regras.md §4)`];
    }
    return [`${where} — rule \`${id}\` was renamed to \`${fresh}\` (ADR-024): update \`config/compliance.json\``];
  });
}

export default [
  {
    id: 'valid-config',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      return CONFIGS
        .filter((topic) => ctx.configs[topic].present && ctx.configs[topic].value === null)
        .map((topic) => `config/${topic}.json is not valid JSON`);
    },
  },
  {
    id: 'config-schema',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const topic of CONFIGS) {
        const { present, value } = ctx.configs[topic];
        // Ausente ou JSON quebrado ja foi reportado por `structure`/`valid-config`.
        if (!present || value === null) continue;
        findings.push(...validate(value, loadSchema(`config-${topic}`), `config/${topic}.json`));
      }
      return findings;
    },
  },
  {
    /**
     * As duas metades de UMA declaração: `module.json:ports` diz o que o módulo EXIGE,
     * `config/ports.json` diz QUEM preenche cada exigência. Coincidem nos dois sentidos, como
     * `env-example` faz entre `requiredEnv` e `.env.example`.
     *
     * O schema não pode cobrar isto — schema nenhum enxerga o `module.json`. Com
     * `additionalProperties: false` e sem `required`, as DUAS brechas passam: configurar `storage`
     * sem declará-lo (está no vocabulário) e declarar `storage` sem configurá-lo (não há campo
     * obrigatório).
     *
     * As duas pontas têm consequências diferentes, e a mensagem diz qual: declarada e não
     * configurada DERRUBA O BOOT — `resolverDependencias` não acha o provedor e lança; configurada
     * e não declarada é config morta, um provedor escolhido para uma porta que ninguém exige.
     */
    id: 'port-declared',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const declared = ctx.manifest?.ports;
      const { present, value } = ctx.configs.ports;
      // Manifesto torto e do `manifest-schema`; arquivo ausente ou ilegivel e da `structure` e do
      // `valid-config`. Aqui so entra declaracao legivel dos dois lados.
      if (!Array.isArray(declared) || !present || value === null) return [];

      // Chave iniciada por `_` e comentario, pela mesma convencao do validador de schema.
      const configured = Object.keys(value).filter((key) => !key.startsWith('_'));
      const findings = [];
      for (const port of declared) {
        if (configured.includes(port)) continue;
        findings.push(`port "${port}" is declared in module.json:ports but is missing from`
          + ' config/ports.json — composition cannot find the provider and the application fails to start');
      }
      for (const port of configured) {
        if (declared.includes(port)) continue;
        findings.push(`config/ports.json selects a provider for "${port}", but the port is missing from`
          + ' module.json:ports — this provider serves an unused port and is dead configuration');
      }
      return findings;
    },
  },
  {
    id: 'open-cors',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const cors = ctx.configs.security.value?.cors;
      if (cors === undefined) return [];
      // `*` devolve o recurso para QUALQUER origem. Origem se declara, uma a uma.
      if ((cors.allowedOrigins ?? []).includes('*')) {
        return ['config/security.json: cors.allowedOrigins contains "*" — origins must be EXPLICITLY listed, never open'];
      }
      return [];
    },
  },
  {
    id: 'dead-config',
    severity: 'warning',
    scope: 'module',
    check(ctx) {
      const code = ctx.code.filter((a) => !a.isTest).map((a) => a.content).join('\n');
      const findings = [];
      for (const topic of CONFIGS) {
        const value = ctx.configs[topic].value;
        if (value === null || typeof value !== 'object') continue;
        for (const key of Object.keys(value)) {
          if (key.startsWith('_')) continue;
          if (!code.includes(key)) findings.push(`config/${topic}.json: key "${key}" is declared but never read`);
        }
      }
      return findings;
    },
  },
  {
    id: 'hardcode-url',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          const matched = text.match(URL_LITERAL);
          if (matched !== null) {
            findings.push(`${file.rel}:${number}: literal URL ${matched[0]} — move it to .env or config/`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'hardcode-number',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      // Nome que denuncia valor de INFRAESTRUTURA. Numero de negocio (aliquota, prazo) tem nome
      // de negocio e mora em config/domain.json — nao entra neste padrao.
      // Fronteira SO no inicio da palavra: `timeoutMs` e `maxTentativas` casam, `importante` nao
      // (nao ha fronteira antes de "port" em "im|port"). Exigir `\b` no fim perdia todo nome
      // composto — que e justamente como esses valores costumam se chamar.
      const names = /\b(porta|port|timeout|tempoLimite|limite|limit|max|minimo|intervalo|ttl|janela|retentativas|tentativas)/i;
      const findings = [];

      for (const file of ctx.code) {
        if (file.isTest || file.rel.startsWith('config/')) continue;
        for (const { number, text } of file.codeLines) {
          // Atribuicao de literal numerico (>1) a identificador de infraestrutura.
          const matched = text.match(/([A-Za-z_]\w*)\s*[:=]\s*(\d{2,})\b/);
          if (matched === null || !names.test(matched[1])) continue;
          // SCREAMING_SNAKE e constante de vocabulario fechado (codigo HTTP, enum), nao tunable —
          // chave de config e camelCase por nomenclatura (§3.1). `LIMITE_EXCEDIDO: 429` fica fora.
          if (matched[1] === matched[1].toUpperCase()) continue;
          findings.push(`${file.rel}:${number}: literal ${matched[2]} in "${matched[1]}" — move it to config/ or .env`);
        }
      }
      return findings;
    },
  },
  {
    id: 'silent-fallback',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          if (FALLBACK_PATTERNS.some((pattern) => pattern.test(text))) {
            findings.push(`${file.rel}:${number}: environment fallback — missing configuration must stop startup`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'env-declared',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const id = ctx.manifest?.id;
      if (id === undefined) return [];
      const prefix = id.toUpperCase().replace(/-/g, '_');
      const declared = new Set(ctx.manifest.requiredEnv ?? []);
      const used = new Set();
      const pattern = new RegExp(`\\b(?:VITE_)?(${prefix}_[A-Z0-9_]+)\\b`, 'g');

      for (const file of ctx.code) {
        for (const finding of codeText(file).matchAll(pattern)) used.add(finding[1]);
      }
      return [...used]
        .filter((key) => !declared.has(key))
        .map((key) => `environment variable "${key}" is used in code but missing from module.json:requiredEnv`);
    },
  },
  {
    id: 'env-example',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const file = fileByName(ctx, '.env.example');
      if (file === null) return ['.env.example is missing — generate it with tools/sync-env.mjs'];
      const declared = ctx.manifest?.requiredEnv ?? [];
      const documented = readEnvPairs(file.content).map(([key]) => key);
      const findings = [];
      for (const key of declared) {
        if (!documented.includes(key)) findings.push(`.env.example does not document "${key}"`);
      }
      for (const key of documented) {
        if (!declared.includes(key)) findings.push(`.env.example documents "${key}", which is missing from the manifest`);
      }
      return findings;
    },
  },
  {
    id: 'env-module',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const file = fileByName(ctx, '.env');
      if (file === null) return [];
      const prefix = (ctx.manifest?.id ?? '').toUpperCase().replace(/-/g, '_');
      return readEnvPairs(file.content)
        .map(([key]) => key)
        .filter((key) => key !== 'ENV_ROOT' && !key.startsWith(prefix) && !key.startsWith(`VITE_${prefix}`))
        .map((key) => `.env in the module contains "${key}" — only ENV_ROOT and ${prefix}_* keys are allowed`);
    },
  },
  {
    id: 'gitignore-secret',
    severity: 'error',
    scope: 'root',
    check(project) {
      // Mesma guarda das outras duas regras de projeto: modulo solto nao tem `.gitignore` de
      // projeto, e cobrar um dele seria falso positivo garantido.
      if (!project.isProject) return [];
      if (project.gitignore === null) {
        return ['.gitignore is missing from the project root — the real .env could be committed'];
      }
      const patterns = ignorePatterns(project.gitignore);
      const discovered = SECRETS_TO_IGNORE.filter((path) => !isIgnored(patterns, path));
      if (discovered.length === 0) return [];
      // NAO afirma que o arquivo esta versionado — isso exigiria `git ls-files`, e o gate nao roda
      // git de proposito. Aqui e so o arquivo de ignore; o que ja foi commitado e do passo de CI.
      return [`.gitignore does not ignore ${discovered.join(' or ')} — a real secret could be committed.`
        + ' Add ".env" and "modules/*/.env" (keep .env.example versioned)'];
    },
  },
  {
    id: 'secret-in-public',
    severity: 'error',
    scope: 'module',
    check(ctx) {
      const findings = [];
      // No MANIFESTO: e a declaracao, e onde o defeito nasce. Sem excecao por `role` — o
      // `gateway-credential` isenta o gateway porque credencial e o oficio dele, mas nem o gateway
      // pode publicar a credencial no bundle.
      for (const key of ctx.manifest?.requiredEnv ?? []) {
        if (isPublicWithCredential(key)) {
          findings.push(`environment variable "${key}" has a PUBLIC prefix and a credential name — the bundler includes`
            + ' this value in the frontend bundle, where any visitor can read it. Secrets belong on the'
            + ' server, without a public prefix');
        }
      }
      // No CODIGO: pega a chave usada e nao declarada, que o manifesto por definicao nao mostra.
      // `env-outside-loader` nao cobre isto — ele procura `process.env`, e o front le
      // `import.meta.env`, que nao casa o padrao dele.
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          findings.push(...publicKeyFindingsInLine(file, number, text));
        }
      }
      return findings;
    },
  },
  {
    id: 'verification-declared',
    severity: 'error',
    scope: 'root',
    check(project) {
      // Modulo solto (extraido e ainda nao religado a um esqueleto) ou fixture nao e projeto —
      // cobrar politica de projeto de quem nao tem `modules/` seria falso positivo garantido.
      if (!project.isProject) return [];
      const { present, value } = project.check;
      // REPROVA quando ausente, e nao silencia: o arquivo nasce com todo projeto gerado, entao a
      // ausencia dele so acontece por apagamento ou por repositorio anterior ao template. Calar
      // tornaria "nenhuma politica declarada" indistinguivel de "politica conforme" — a confusao
      // que este gate inteiro existe para impedir.
      if (!present) {
        return ['config/verification.json is missing from the project root — declare dependency coverage, severity'
          + ' and tool by language (schema in tools/gate/schemas/)'];
      }
      if (value === null) return ['config/verification.json is not valid JSON'];
      return validate(value, loadSchema('verification'), 'config/verification.json');
    },
  },
  {
    id: 'compliance-declared',
    severity: 'error',
    scope: 'root',
    // Ate esta regra, `config/compliance.json` era o unico config sem schema e sem dono: JSON
    // malformado caia num catch silencioso de `loadExceptions` (exit 0, exececoes todas
    // descartadas caladas) e chave em ingles (`module`/`rule`) so falhava calada tambem — a
    // excecao nao pegava, e nada dizia por que. `decisao` resolver a um ADR de verdade continua
    // sendo trabalho da regra §6 (`04-regras.md`, fora deste arquivo — e o fail-open medido em
    // 2026-08-15); esta regra so cobra a FORMA, o mesmo par (existe + schema) de `verification-declared`.
    // O 2º argumento (`catalogo.ids`) fecha o buraco que o ADR-024 abriria: o gate compara `rule` por
    // igualdade, então exceção com id que não existe (renomeado ou nunca existiu) deixava de perdoar
    // EM SILÊNCIO e o achado voltava como erro sem dizer por quê. Aqui ela é acusada pelo nome.
    check(project, catalog) {
      if (!project.isProject) return [];
      const { present, value } = project.compliance;
      if (!present) {
        return ['config/compliance.json is missing from the project root — the exception list starts'
          + ' empty, which is correct, but the file must exist (schema in tools/gate/schemas/)'];
      }
      if (value === null) return ['config/compliance.json is not valid JSON'];
      return [
        ...validate(value, loadSchema('compliance'), 'config/compliance.json'),
        ...exceptionsWithUnknownId(value, project.renamedRules, catalog?.ids),
      ];
    },
  },
  {
    id: 'derived-lint',
    severity: 'error',
    scope: 'root',
    check(project) {
      if (!project.isProject) return [];

      // A pergunta e "o que esta na raiz e ALGUMA saida do gerador?", e NAO "bate com o binding
      // deste modulo". A config de lint e do PROJETO, e o binding do modulo e outro fato: um modulo
      // escafoldado com o binding errado faria esta regra pedir `eslint.config.js` num projeto
      // Python — mandando consertar a config quando o defeito e o manifesto do modulo. Mensagem que
      // aponta o conserto errado e pior que mensagem nenhuma.
      const derived = BINDINGS.map((binding) => outputOf(binding));
      const rootLintConfigs = Object.entries(project.lintConfigs).filter(([, text]) => text !== null);
      if (rootLintConfigs.length === 0) {
        const names = [...new Set(derived.map((d) => d.name))].join(' or ');
        return [`no linter configuration in the project root (${names}) — without it, the 40/3/4 thresholds`
          + ' are enforced only by the gate. Generate it with: node tools/generate-lint-config.mjs'];
      }

      const findings = [];
      for (const [name, text] of rootLintConfigs) {
        const expected = derived.filter((d) => d.name === name).map((d) => d.content);
        if (expected.includes(text)) continue;
        findings.push(`${name} differs from tools/gate/thresholds.mjs — the linter and gate would enforce`
          + ' different thresholds, and §7.2 gives the linter precedence, making this'
          + ' difference invisible. Regenerate with: node tools/generate-lint-config.mjs');
      }
      return findings;
    },
  },
  {
    /**
     * O análogo de `env-declared` para a FIAÇÃO, e nos DOIS sentidos.
     *
     * O sentido "usada e não declarada" é o buraco que motiva o manifesto de raiz: sem esta regra,
     * o `.env.example` da raiz é montado só com `module.json:requiredEnv`, então o `JWT_SECRET` do
     * `resolverAuth()` e o `DATABASE_URL` do adapter real nascem ÓRFÃOS — o segredo mais sensível
     * do sistema fica o único que ninguém declara.
     *
     * O sentido inverso entra porque a declaração tem consequência: chave declarada vai para o
     * `.env.example` e vira valor exigido do operador. Declarada e sem leitor, ela pede um segredo
     * que nada consome — e é exatamente o vício que esta base já pagou caro com `ui`,
     * `exportsSummary` e `generatesArtifact`.
     *
     * O `.env.example` em si NÃO é cobrado aqui: `sync-env.mjs --check` já o compara com
     * os manifestos, e roda no `verificar` dos três bindings. Duplicar isso em regra daria duas
     * mensagens para um conserto só.
     */
    id: 'root-env-declared',
    severity: 'error',
    scope: 'root',
    check(project) {
      if (!project.isProject) return [];
      const declared = project.manifest.value?.requiredEnv;
      // Manifesto ausente, quebrado ou com `requiredEnv` de outro tipo ja e do `root-manifest` —
      // empilhar aqui daria duas mensagens para um conserto so.
      if (!Array.isArray(declared)) return [];

      const used = new Set();
      for (const file of project.code) {
        for (const finding of codeText(file).matchAll(ROOT_KEY)) used.add(finding[0]);
      }

      const findings = [...used]
        .filter((key) => !declared.includes(key))
        .map((key) => `environment variable "${key}" is used in root code but missing from project.json:requiredEnv`);
      for (const key of declared) {
        if (used.has(key)) continue;
        findings.push(`environment variable "${key}" is declared in project.json but never used in adapters/, src/, or`
          + ' packages/ — it appears in .env.example and requires a value that nothing reads');
      }
      return findings;
    },
  },
  {
    /**
     * O gêmeo de `hardcode-url` na fiação — a MESMA `URL_LITERAL`, outro território.
     *
     * O adapter é onde o endereço do fornecedor de verdade aparece (`https://x.supabase.co`).
     * A única diferença em relação ao módulo é para onde a
     * mensagem aponta: no módulo, `.env` ou `config/`; aqui, `project.json:requiredEnv`, que é
     * onde a raiz declara o que exige do ambiente.
     */
    id: 'root-hardcode-url',
    severity: 'error',
    scope: 'root',
    check(project) {
      if (!project.isProject) return [];
      return scanRoot(project, (text) => {
        const matched = text.match(URL_LITERAL);
        if (matched === null) return null;
        return `literal URL ${matched[0]} in root composition — infrastructure addresses come from the environment:`
          + ' declare the key in project.json:requiredEnv and read it here';
      });
    },
  },
  {
    /**
     * O gêmeo de `silent-fallback` na fiação — a MESMA `FALLBACK_PATTERNS`.
     *
     * O defeito é idêntico e a consequência é pior: o que a raiz lê do ambiente é o segredo do
     * sistema, e um default embutido não "ajuda no desenvolvimento" — ele VIRA o valor de produção
     * no dia em que a chave falta, calado, com o boot subindo normalmente.
     *
     * Não briga com `root-env-declared`: aquela cobra a chave USADA e não declarada, e não
     * proíbe a leitura. Ler `process.env` é o ofício de `src/composicao` — é o inverso do que
     * `env-outside-loader` cobra no módulo. O que esta regra proíbe é o DEFAULT, nunca a leitura.
     */
    id: 'root-fallback',
    severity: 'error',
    scope: 'root',
    check(project) {
      if (!project.isProject) return [];
      return scanRoot(project, (text) => {
        if (!FALLBACK_PATTERNS.some((pattern) => pattern.test(text))) return null;
        return "environment fallback in root composition — missing configuration must stop startup. Root code reads"
          + " the system's secrets from the environment; an embedded default becomes a production value on the"
          + " day the key is missing, without anyone noticing";
      });
    },
  },
  {
    /**
     * O artefato do hook de git existe e invoca a cadeia — regra 74 do catálogo.
     *
     * 03-operacao.md §7 prescreve três camadas de custo (milissegundos, segundos, dezenas de
     * segundos) e o template as fia em `.githooks/pre-commit`/`pre-push`. Até esta regra, nada
     * cobrava que o arquivo existisse: dois lugares documentavam um pre-commit
     * (`tools/gate/README.md`, o passo 6 de `meta-iniciar-repositorio`) e nenhum o entregava.
     *
     * O QUE ELA NÃO AFIRMA, e o limite tem precedente literal em `gitignore-secret`: `core.hooksPath`
     * é config LOCAL do git, não arquivo — provar que ele aponta para `.githooks` exigiria rodar
     * `git config`, e o gate não roda git de propósito. Esta regra prova que o projeto não desmontou
     * a rede; não prova que a rede está LIGADA (§7.2). Também não exige `pre-push`: as três camadas
     * são desenho, e um projeto pode legitimamente só ter a primeira.
     */
    id: 'pre-commit-installed',
    severity: 'error',
    scope: 'root',
    check(project) {
      // Mesma guarda de `verification-declared`/`derived-lint`: módulo solto (extraído e ainda não
      // religado a um esqueleto de projeto) não tem raiz de projeto a cobrar, e exigir o hook dele
      // seria falso positivo garantido.
      if (!project.isProject) return [];
      if (project.githooksPreCommit === null) {
        return ['.githooks/pre-commit is missing from the project root — without it, the gate only runs when'
          + ' someone remembers to run it manually (03-operacao.md §7). The template installs the hook at'
          + ' bindings/<binding>/root/.githooks/pre-commit; ative com'
          + ' activate it with "git config core.hooksPath .githooks"'];
      }
      // "Invoca a cadeia" é TEXTUAL, não comportamental: a regra procura a referência ao gate ou ao
      // script comum dos hooks, nunca executa o arquivo. Duas formas aceitas — chamada direta ao
      // gate (o exemplo histórico do README) e a delegação ao script comum que o template instala.
      const invokesChain = /tools[\\/](gate[\\/]validate\.mjs|verify-commit\.mjs)/
        .test(project.githooksPreCommit);
      if (!invokesChain) {
        return ['.githooks/pre-commit exists but references neither tools/gate/validate.mjs nor'
          + ' tools/verify-commit.mjs — a hook that does not run the checks is worse than no'
          + ' hook: it gives the impression of protection without providing it'];
      }
      return [];
    },
  },
  {
    id: 'env-outside-loader',
    severity: 'warning',
    scope: 'module',
    check(ctx) {
      return ctx.code
        .filter((a) => !a.isTest && !isLoader(a.rel))
        .filter((a) => /process\.env|os\.environ|os\.getenv/.test(codeText(a)))
        .map((a) => `${a.rel}: reads environment variables outside the loader — only api/src/config.* may access them`);
    },
  },
];
