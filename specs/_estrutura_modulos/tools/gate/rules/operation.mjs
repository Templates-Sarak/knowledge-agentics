/**
 * rules/operation.mjs — família "Operação" do catálogo (specs/arquitetura/04-regras.md §4.6).
 * ids: log, determinism, gateway-credential, insecure-random, public-route-authenticated,
 *      secure-cookie, token-in-storage, permission-literal, concatenated-sql, sql-in-module,
 *      secret-in-log, container-present, compose-variables-declared, dockerignore-secret
 *
 * `concatenated-sql` e `secret-in-log` são de escopo `root` e olham a fiação. Estão nesta família
 * porque é a de SEGURANÇA operacional — a mesma de `secure-cookie` e `token-in-storage` —, e
 * porque o vocabulário de credencial que `secret-in-log` precisa já mora aqui. `sql-in-module` é a
 * gêmea de escopo `module` da primeira, e as duas dividem o discriminador (`isInjectedSql`).
 *
 * Todas leem `arquivo.linhasCodigo`, nunca o conteúdo bruto: comentário e docstring não são
 * código, e a lei escrita num comentário não pode virar violação dela mesma. No molde isso não é
 * detalhe — o literal `"GET /health"` aparece três vezes em docstring explicando a cadeia de auth,
 * e sobre o conteúdo bruto ele viraria violação da própria regra que a docstring descreve.
 */
import { CONTAINER_FILES, FRONT_FILES } from '../context.mjs';
import { failedReads, normalize, specOperations, specOf } from '../spec.mjs';
import { codeText } from '../text.mjs';

/** `${VAR` do compose. O lookbehind descarta `$${VAR}`, o escape que entrega `${VAR}` ao container. */
const COMPOSE_INTERPOLATION = /(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Sufixo que denuncia CREDENCIAL numa chave de env. Vocabulário fechado, e o ÚNICO — exportado
 * porque `secret-in-public` (§4.4) faz a mesma pergunta sobre a mesma chave, por outro ângulo.
 * Uma segunda lista divergiria da primeira na primeira vez que alguém acrescentasse um sufixo.
 */
export const CREDENTIAL_PATTERN = /_(API_KEY|SECRET|TOKEN|PASSWORD|SENHA|CLIENT_SECRET|PRIVATE_KEY)$/;

/**
 * "Esta linha é uma instrução SQL." Vocabulário fechado, exportado como FONTE de regex porque duas
 * regras compõem a mesma lista com perguntas diferentes: `concatenated-sql` pergunta só isto, e o
 * `gateway-http` (§4.2) a compõe com o vocabulário de CONEXÃO (`createClient`, `new Pool`,
 * `.query(`) para perguntar "este gateway fala com banco?". Uma lista só — duas divergiriam no
 * primeiro verbo que alguém acrescentasse de um lado.
 */
export const SQL_SOURCE = 'select\\s+.*\\bfrom\\b|insert\\s+into|update\\s+\\w+\\s+set|delete\\s+from';

const SQL_PATTERN = new RegExp(`\\b(?:${SQL_SOURCE})`, 'i');

/**
 * O que transforma uma string SQL em INJEÇÃO: o valor entra na própria string, em vez de ir como
 * parâmetro. É o discriminador inteiro da regra — placeholder (`$1`, `?`, `:name`, `%s`) NÃO casa
 * nenhum destes padrões, e é por isso que a forma correta passa.
 *
 * Cada um foi estreitado contra um falso positivo concreto:
 *   - concatenação exige que o outro lado NÃO seja literal: `'select a' + ' from b'` é feio e não é
 *     injeção, e acusá-lo mandaria consertar o que está seguro;
 *   - a f-string exige a chave `{`, senão `f"select 1"` (sem interpolação nenhuma) cairia;
 *   - o operador `%` exige ESPAÇO depois, senão `where name like '%joao%'` — um padrão LIKE
 *     perfeitamente correto — seria acusado pelo `%` literal dele.
 *
 * A primeira alternativa exige um caractere que NÃO seja aspa nem branco, e essa forma positiva é
 * deliberada: escrita como lookahead negativo (`\s*(?!['"`])`), ela acusaria `'select x' + ' where y'`,
 * porque o `\s*` RETROCEDE para zero e o lookahead passa a olhar o espaço em vez da aspa seguinte.
 * Exigir o caractere de verdade fecha a porta ao retrocesso — é por isso que a forma correta não é
 * acusada.
 */
const INTERPOLATION_IN_SQL = [
  /\$\{/,
  /['"`]\s*\+\s*[^'"`\s]/,
  /\w\s*\+\s*['"`]/,
  /\bf['"][^'"]*\{/,
  /\.format\s*\(/,
  /['"]\s*%\s+/,
];

/**
 * Onde um valor sai do processo e vai para o log. Duas peças, uma fonte cada, compostas de dois
 * jeitos diferentes por escopo:
 *
 *   - o LOGGER estruturado (`LOG_CALL_VERBOS_FONTE`), que é o certo em toda linguagem — os
 *     SETE verbos (`logger|log|logging` × `debug|info|warn|warning|error|critical|exception`) são
 *     a lista ÚNICA, exportada, e tanto a raiz quanto o módulo a usam sem cópia própria;
 *   - a SAÍDA DIRETA (`console.*`, `print(`), compartilhada com a regra `log` — que a proíbe no
 *     módulo, enquanto aqui (raiz) ela é apenas uma das formas de a credencial vazar.
 *
 * A RAIZ (`secret-in-log`) compõe as duas: não há regra de módulo `log` cobrindo a raiz, então
 * `console`/`print` ali só seria pego aqui. O MÓDULO (`sensitive-in-output`) usa só os verbos — a
 * saída direta já tem dono (`log`), e compor as duas duplicaria a mensagem para o mesmo `console.log`.
 * A diferença agora é um FILTRO NOMEADO sobre a lista única, nunca uma segunda lista mantida à mão.
 */
const LOG_CALL_VERBS_SOURCE = '\\b(?:logger|log|logging)\\.(?:debug|info|warn|warning|error|critical|exception)\\(';
export const LOG_CALL_VERBS = new RegExp(LOG_CALL_VERBS_SOURCE);
const SOURCE_DIRECT_OUTPUT = '\\bconsole\\.\\w+\\(|(?:^|[^.\\w])print\\(';
const DIRECT_OUTPUT = new RegExp(SOURCE_DIRECT_OUTPUT);
const LOG_CALL = new RegExp(`${LOG_CALL_VERBS_SOURCE}|${SOURCE_DIRECT_OUTPUT}`);

/**
 * Geradores NÃO-criptográficos. `Math.random` e o módulo `random` do Python são previsíveis por
 * construção: dada a semente, a sequência inteira sai. Para token, segredo ou id de sessão, isso é
 * o defeito — o certo é CSPRNG (`crypto.randomUUID`, `crypto.getRandomValues`, `secrets`).
 */
const WEAK_RNG = /Math\.random\(|\brandom\.(?:random|randint|randrange|choice|choices|shuffle|sample|uniform)\(/;

/**
 * O que torna o RNG fraco um problema de SEGURANÇA, e não só de estilo: o valor gerado é usado
 * como credencial. Vocabulário fechado e deliberadamente estreito — exige o contexto na MESMA
 * linha, então `const cor = Math.random()` passa e `const token = Math.random()` cai.
 *
 * `hash` fica de FORA de propósito: aqui ele é o identificador público e universal do registro
 * (02-contrato-e-dados §4), não um segredo. Incluí-lo acusaria o gerador de id de todo adapter.
 */
const SECRET_WORDS = new Set([
  'token', 'secret', 'segredo', 'senha', 'password', 'passwd', 'apikey',
  'nonce', 'salt', 'session', 'sessao', 'otp', 'csrf', 'jwt', 'credencial',
]);

/**
 * As palavras de uma linha, com camelCase e snake_case desmontados: `novoToken` vira
 * `['novo', 'token']`.
 *
 * Por palavra INTEIRA, e não por substring, nas duas direções: `\btoken\b` não casaria dentro de
 * `novoToken` (não há fronteira entre `o` e `T`), e a substring solta faria `assalto` casar `salt`.
 * Desmontar o identificador resolve os dois de uma vez.
 */
function wordsOf(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part.toLowerCase());
}

/** Bigrama junto cobre `api_key` e `apiKey`, que desmontam em duas palavras genéricas. */
function hasSecretContext(text) {
  const words = wordsOf(text);
  return words.some((word, index) => (
    SECRET_WORDS.has(word) || SECRET_WORDS.has(word + (words[index + 1] ?? ''))
  ));
}

/**
 * Onde procurar o contexto secreto. A linha do RNG, e — só quando ela é um `return` — também a
 * linha de código anterior.
 *
 * A janela existe pela forma canônica, que tem o nome na assinatura e o gerador no corpo:
 *
 *     function novoToken() {
 *       return String(Math.random());
 *     }
 *
 * Exigir tudo na mesma linha deixaria escapar justamente essa, que é a mais comum. Uma linha, e só
 * em `return`, é o quanto dá para ampliar sem falso positivo: `const jitter = Math.random()` logo
 * abaixo de uma linha que fala de token continua passando, porque não é `return`.
 */
/**
 * O formato de `publicRoutes` (`"MÉTODO /caminho"`, 01-modulo.md §3.1) escrito como LITERAL no
 * código. É a forma exata da lista de isenção hardcoded — a que desmente "a lista vem do manifesto".
 */
const LITERAL_ROUTE = /['"`](GET|POST|PUT|PATCH|DELETE)\s+\/[^'"`]*['"`]/;

/**
 * Permissão escrita como LITERAL no argumento de `requirePermission`. É a forma exata da autorização
 * que desmente o manifesto: `module.json:permissions` declara uma coisa, a rota exige outra, e nada
 * muda quando o manifesto muda.
 *
 * `[^)]*` cobre as duas assinaturas dos moldes — `requirePermission(ler)` em TS/JS e
 * `require_permission(request, permissao)` em Python, onde o literal seria o SEGUNDO argumento.
 */
const LITERAL_PERMISSION = /require_?[Pp]ermission\s*\([^)]*['"`]/;

/** Onde um cookie é definido, em Express/Fastify e em Python. */
const DEFINE_COOKIE = /\bres(?:ponse)?\.cookie\(|set_cookie\(|['"`]Set-Cookie['"`]/i;

/**
 * Cookie que carrega SESSÃO. Vocabulário próprio e estreito, e não o `SECRET_WORDS` do
 * `insecure-random`: aquele inclui `csrf`, e o cookie de CSRF no padrão double-submit **precisa**
 * ser legível por JavaScript — exigir `HttpOnly` dele seria falso positivo sobre código correto.
 */
const SESSION_COOKIE = /\b(session|sessao|sess|sid|token|auth|jwt|refresh)\b/i;

const COOKIE_FLAGS = [
  { name: 'HttpOnly', pattern: /httponly/i },
  { name: 'Secure', pattern: /\bsecure\b/i },
  { name: 'SameSite', pattern: /samesite|same_site/i },
];

const BROWSER_STORAGE = /\b(localStorage|sessionStorage)\b/;

function nearSecretContext(text, previous) {
  if (hasSecretContext(text)) return true;
  return /^\s*return\b/.test(text) && previous !== undefined && hasSecretContext(previous);
}

/**
 * A lista de isenção vem do MANIFESTO, e não de literal no código — as duas metades do mesmo fato.
 *
 * É a cláusula que o molde já demonstra em `permissoesDe` ("As permissoes vem do manifesto, nunca
 * de literal no codigo"): a `api/` lê `publicRoutes` do manifesto, e nenhum lugar dela escreve a
 * lista à mão. Uma lista hardcoded desmente o manifesto sem que o manifesto mude.
 */
function checkListOrigin(apiFiles) {
  const findings = [];
  // `codeText`, e nao `conteudo`: a clausula afirma que a `api/` LE o manifesto, e prosa nao le
  // nada. Sobre o texto cru, a docstring que EXPLICA `publicRoutes` — o molde tem tres — satisfaria
  // a checagem, e um modulo que tivesse apagado a leitura de verdade passaria calado por causa do
  // comentario que a descreve. Falso negativo, e do tipo que aprova em silencio, que e o que o §7
  // inteiro existe para evitar. Nos tres moldes a leitura real esta em codigo (`manifesto.publicRoutes`,
  // `manifesto["publicRoutes"]`), entao fechar o buraco nao acusa nenhum deles.
  if (!apiFiles.some((a) => codeText(a).includes('publicRoutes'))) {
    findings.push('api/ never reads module.json:publicRoutes — the authentication exemption cannot come'
      + ' from another source, or the manifest declares one thing while the request chain applies another');
  }
  for (const file of apiFiles) {
    for (const { number, text } of file.codeLines) {
      if (LITERAL_ROUTE.test(text)) {
        findings.push(`${file.rel}:${number}: a route in the form "METHOD /path" is hardcoded in the code`
          + ' — public routes must come from module.json:publicRoutes');
      }
    }
  }
  return findings;
}

/**
 * Toda entrada de `publicRoutes` aponta para uma rota que EXISTE no contrato do módulo.
 *
 * Entrada com typo (`GET /helth`) não isenta nada e ninguém percebe: o autor acredita que abriu a
 * rota, a cadeia continua exigindo token, e o defeito só aparece em produção. O método entra na
 * comparação porque a lei diz que ele faz parte da declaração — abrir a leitura nunca pode abrir a
 * escrita do mesmo caminho por descuido (03-operacao.md §2.1).
 */
function checkRealPublicRoutes(ctx) {
  const declared = ctx.manifest?.publicRoutes ?? [];
  if (declared.length === 0) return [];
  const spec = specOf(ctx);
  // Spec ausente ou com `paths:` ilegivel e do `contract` — acusar aqui viraria "nao consegui ler"
  // em "a rota nao existe", que e afirmar falsidade e mandar apagar o que esta certo.
  if (spec === null || failedReads(spec.content).includes('paths')) return [];

  const operations = specOperations(spec.content);
  const findings = [];
  for (const entry of declared) {
    const [method, path] = entry.split(/\s+/);
    // Forma garantida pelo JSON Schema (`^(GET|POST|PATCH|PUT|DELETE) /`); manifesto torto e do
    // `manifest-schema`, nao desta regra.
    if (path === undefined) continue;
    const route = [...operations.keys()].find((r) => normalize(r) === normalize(path));
    if (route === undefined) {
      findings.push(`publicRoutes declares "${entry}", but the contract has no path "${path}"`
        + ' — this entry grants no exemption, so the intended public route still requires a token');
      continue;
    }
    if (!operations.get(route).has(method)) {
      findings.push(`publicRoutes declares "${entry}", but the contract does not declare ${method} for "${route}"`
        + ` (declared methods: ${[...operations.get(route)].join(', ') || 'none'})`);
    }
  }
  return findings;
}

/**
 * O discriminador de INJEÇÃO, e o único — `concatenated-sql` (raiz) e `sql-in-module` (módulo) fazem
 * a mesma pergunta em coleções diferentes, e uma segunda cópia divergiria da primeira no primeiro
 * padrão que alguém acrescentasse de um lado.
 *
 * Duas condições na MESMA linha: parece SQL, e o valor entra na string. É o recorte que deixa a
 * forma correta passar — `db.query('… where hash = $1', [hash])` não interpola nada.
 */
function isInjectedSql(text) {
  if (!SQL_PATTERN.test(text)) return false;
  return INTERPOLATION_IN_SQL.some((pattern) => pattern.test(text));
}

/**
 * Percorre as linhas de código de cada arquivo do módulo que casa o filtro.
 *
 * `padrao` aceita regex OU predicado: regra cuja decisão é de UMA forma passa o regex, e regra que
 * cruza duas condições na mesma linha passa a função. Sem isso, a segunda precisaria do próprio laço
 * — e um laço duplicado é onde `isTest` deixa de ser pulado no dia em que alguém mexer só num deles.
 */
function scan(ctx, filter, pattern, message) {
  const matches = typeof pattern === 'function' ? pattern : (text) => pattern.test(text);
  const findings = [];
  for (const file of ctx.code) {
    if (file.isTest || !filter(file)) continue;
    for (const { number, text } of file.codeLines) {
      if (matches(text)) findings.push(`${file.rel}:${number}: ${message}`);
    }
  }
  return findings;
}

/**
 * O gêmeo de `varrer` do lado da RAIZ: percorre as linhas de código da fiação (`ctx.projeto.codigo`)
 * e deixa o chamador decidir a mensagem — as regras de raiz precisam dizer QUAL chave ou QUAL forma
 * caiu, e uma mensagem fixa não daria conta.
 *
 * `linhasCodigo`, e nunca `conteudo`, pelo mesmo motivo de toda esta família: a fiação do molde é
 * densa em comentário explicando a própria lei, e sobre o texto bruto a explicação viraria violação
 * do que ela descreve. Exportado porque `configuration.mjs` tem duas regras de raiz e usa o mesmo
 * percurso — duas cópias de um laço divergiriam no primeiro filtro novo.
 */
export function scanRoot(project, apply) {
  const findings = [];
  for (const file of project.code) {
    if (file.isTest) continue;
    for (const { number, text } of file.codeLines) {
      const message = apply(text);
      if (message !== null) findings.push(`${file.rel}:${number}: ${message}`);
    }
  }
  return findings;
}

export default [
  {
    id: 'log',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      return scan(ctx, () => true, DIRECT_OUTPUT, 'direct output — use the structured logger');
    },
  },
  {
    id: 'determinism',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      return scan(
        ctx,
        (file) => file.rel.startsWith('core/'),
        /Math\.random\(|new Date\(\s*\)|Date\.now\(|datetime\.now\(|\brandom\.\w+\(/,
        'non-deterministic behavior in core/ — use the clock and idGenerator ports',
      );
    },
  },
  {
    id: 'insecure-random',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        // FRONTEIRA com `determinism`, e ela e explicita: dentro de `core/` quem cobra RNG fraco e
        // o `determinism`, por reprodutibilidade, e o conserto dele (receber a porta `idGenerator`)
        // ja resolve o lado da seguranca. Acusar aqui tambem daria duas mensagens para um conserto
        // so. Fora de `core/` o `determinism` cala, e e exatamente ali que esta regra vive.
        if (file.isTest || file.rel.startsWith('core/')) continue;
        file.codeLines.forEach(({ number, text }, index) => {
          if (WEAK_RNG.test(text) && nearSecretContext(text, file.codeLines[index - 1]?.text)) {
      findings.push(`${file.rel}:${number}: token or secret is generated with a non-cryptographic RNG`
        + ' — use a CSPRNG (crypto.randomUUID, crypto.getRandomValues, secrets)');
          }
        });
      }
      return findings;
    },
  },
  {
    id: 'public-route-authenticated',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const apiFiles = ctx.code.filter((a) => !a.isTest && a.rel.startsWith('api/'));
      // Sem `api/` nao ha cadeia de middleware para julgar — `structure` ja cobra a ausencia dela.
      if (apiFiles.length === 0) return [];
      return [...checkListOrigin(apiFiles), ...checkRealPublicRoutes(ctx)];
    },
  },
  {
    /**
     * A permissão em vigor é a DECLARADA — e é o análogo exato da cláusula (b) do
     * `public-route-authenticated`, com o molde já demonstrando o padrão: *"As permissoes vem do
     * manifesto, nunca de literal no codigo"*.
     *
     * Cobra UMA coisa, e o nome diz qual. A outra metade — "toda permissão declarada é exigida em
     * alguma rota", o análogo do `dead-config` — foi DESCARTADA, e não por preguiça: ela é
     * incompatível com esta. O molde consome as permissões por POSIÇÃO
     * (`const [ler, escrever] = config.manifesto.permissions`), então a string `<module>:read` nunca
     * aparece no código — e não pode aparecer, porque é exatamente o que esta regra proíbe.
     * Procurá-la seria cobrar o oposto do que se cobra na linha de cima. Registrado no §7.1.
     */
    id: 'permission-literal',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      return scan(
        ctx,
        (file) => file.rel.startsWith('api/'),
        LITERAL_PERMISSION,
        'permission is hardcoded in requirePermission — the active permission comes from'
        + ' module.json:permissions, not the code; a literal here makes the manifest and route disagree',
      );
    },
  },
  {
    id: 'secure-cookie',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          // CONDICIONAL: so cobra onde o cookie de sessao EXISTE. Modulo sem cookie — o caso do
          // molde, cuja auth e `Authorization: Bearer` — nao tem o que declarar, e a regra cala.
          if (!DEFINE_COOKIE.test(text) || !SESSION_COOKIE.test(text)) continue;
          const missing = COOKIE_FLAGS.filter(({ pattern }) => !pattern.test(text));
          if (missing.length === 0) continue;
          findings.push(`${file.rel}:${number}: session cookie is missing ${missing.map((f) => f.name).join(', ')}`
            + ' — without HttpOnly, XSS can read it; without Secure, it travels in clear text; without'
            + ' SameSite, it accompanies requests from other sites');
        }
      }
      return findings;
    },
  },
  {
    id: 'token-in-storage',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          if (!BROWSER_STORAGE.test(text)) continue;
          // O proprio `sessionStorage` carrega a palavra "session": sem tira-lo do texto antes de
          // procurar o contexto, guardar o TEMA em sessionStorage seria acusado como token.
          const withoutIdentifier = text.replace(BROWSER_STORAGE, ' ');
          if (!hasSecretContext(withoutIdentifier)) continue;
          findings.push(`${file.rel}:${number}: authentication token is stored in localStorage/sessionStorage`
            + ' — page XSS can read it. Use an HttpOnly cookie or keep the token in memory');
        }
      }
      return findings;
    },
  },
  {
    /**
     * SQL parametrizado, nunca concatenado — na FIAÇÃO, que é onde a query nasce: o módulo não pode
     * ter driver (`vendor-sdk`) nem importar adapter (`import-adapter`), então quem monta a query
     * é `adapters/`.
     *
     * A gêmea de escopo `module` é `sql-in-module`, e as duas nunca acusam o mesmo arquivo: esta lê
     * `projeto.codigo` (`adapters/`, `src/`, `packages/`), aquela lê `ctx.codigo` (a pasta do módulo),
     * e `context.mjs` mantém as duas coleções disjuntas por construção.
     */
    id: 'concatenated-sql',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      return scanRoot(project, (text) => (isInjectedSql(text)
        ? 'SQL is built with concatenation or interpolation — an external value becomes part of the'
          + ' COMMAND. Use a placeholder ($1, ?, :name, %s) and pass the value as a parameter: the driver'
          + ' escapes the value, never the SQL string'
        : null));
    },
  },
  {
    /**
     * O vetor que sobrava, e ele estava medido: SQL montado DENTRO do módulo.
     *
     * O `concatenated-sql` foi para a raiz porque quem fala com banco é o adapter, e isso continua
     * certo. Só que "o módulo não fala com banco" é doutrina sem verificador na única forma que
     * importa: a superfície canônica de `packages/ports/` é tipada por OPERAÇÃO — `listar`,
     * `buscarPorHash`, `inserir`, `contar`, e nenhuma porta aceita comando —, mas o `core/ports/` do
     * MÓDULO é escrito pelo autor do módulo e nada compara a forma dele com a canônica. Acrescentar
     * `executarConsulta(sql: string)` ali é legal aos olhos do gate, e a partir daí a concatenação
     * mora no módulo e a execução na raiz: `concatenated-sql` vê o `.query(sql)` do adapter e NÃO vê
     * como a string nasceu. Medido — a mesma linha, acusada em `adapters/` e calada em `modules/`.
     *
     * MESMO discriminador da gêmea, uma implementação só (`isInjectedSql`): parece SQL, e o valor
     * entra na string. Divergir aqui faria uma das duas acusar o que a outra deixa passar.
     */
    id: 'sql-in-module',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      return scan(
        ctx,
        () => true,
        isInjectedSql,
        'SQL is built inside the module — modules do not access databases; queries belong in adapters behind an operation-based'
          + ' port (findByHash(hash)), never a command-based port (execute(sql)). The root `concatenated-sql` rule cannot see this boundary:'
          + ' the adapter receives the completed string and cannot tell how it was built',
      );
    },
  },
  {
    /**
     * Segredo não vai para log — e o sinal vem de onde já existe declaração, não de um campo novo.
     *
     * O módulo cruza `sensitiveFields` com a projeção e o log (`sensitive-in-output`), e a raiz não
     * tem esse campo: `project.json` declara `requiredEnv` e nada mais, com
     * `additionalProperties: false` fechando a porta de propósito. O sinal aqui é melhor, porque já
     * está declarado: as chaves `ROOT_*` do manifesto filtradas pelo MESMO vocabulário fechado de
     * sufixo de credencial que `gateway-credential` e `secret-in-public` usam. `ROOT_JWT_SECRET` é
     * segredo; `ROOT_API_BASE_URL` não é, e não é acusada.
     */
    id: 'secret-in-log',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      const credentials = (project.manifest.value?.requiredEnv ?? [])
        .filter((key) => CREDENTIAL_PATTERN.test(key));
      if (credentials.length === 0) return [];

      return scanRoot(project, (text) => {
        if (!LOG_CALL.test(text)) return null;
        const cited = credentials.find((key) => new RegExp(`\\b${key}\\b`).test(text));
        if (cited === undefined) return null;
        return `credential "${cited}" is referenced in a log call — its value will reach log files,`
          + ' aggregators, and anyone with access to them, beyond the reach of secret rotation.'
          + ' Log the fact ("secret missing"), never the secret';
      });
    },
  },
  {
    id: 'gateway-credential',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      if (ctx.manifest?.role === 'gateway') return [];
      return (ctx.manifest?.requiredEnv ?? [])
        .filter((key) => CREDENTIAL_PATTERN.test(key))
        .map((key) => `env "${key}" is an external-service credential — only a module with the "gateway" role may declare it`);
    },
  },
  {
    /**
     * O projeto nasce dockerizado (ADR-022) e os arquivos de container existem na raiz.
     *
     * Presença, e só presença: o CONTEÚDO do Dockerfile (não-root, sem `:latest`, healthcheck) é da
     * skill `deploy-docker-monolito`/`validar_monolito.py`, que é por-provedor e por-decisão — a lei
     * do template afirma que os arquivos existem, não que sejam bons. A imagem de front só é exigida
     * quando algum módulo publica uma tela: o binding Python nasce sem `web/` e sem front.
     */
    id: 'container-present',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      // Módulo solto (extraído e ainda não religado a um projeto) não tem raiz a cobrar.
      if (!project.isProject) return [];
      const { present, hasFront } = project.container;
      const required = hasFront ? [...CONTAINER_FILES, ...FRONT_FILES] : CONTAINER_FILES;
      return required
        .filter((file) => !present.includes(file))
        .map((file) => `${file} is missing from the project root — projects include Docker support (03-operacao.md §9.5):`
          + ' copy the ready-made file from bindings/<binding>/root/ and adjust it'
          + (FRONT_FILES.includes(file) ? ' (required because a module publishes a screen: webPath + web/)' : ''));
    },
  },
  {
    /**
     * O `.env` não entra na imagem — a mesma invariante de `gitignore-secret`, na outra fronteira.
     *
     * `gitignore-secret` protege o REPOSITÓRIO; esta protege o CONTEXTO DE BUILD. Os dois arquivos de
     * ignore têm semânticas diferentes e por isso a regra não é uma cópia: no `.dockerignore` um padrão
     * sem o prefixo de globstar casa só na raiz do contexto — `.env` não alcança `modules/<id>/.env` nem
     * `deploy/.env`, e é a forma com globstar (`**` + `/.env`) quem os pega. Um `COPY . .` num estágio de build com o `.env` no contexto grava o
     * segredo numa camada (e no cache de build) — e é o primeiro "NUNCA" da skill de deploy.
     *
     * É a ÚNICA checagem fina do `validar_monolito.py` promovida a lei do template, e a razão é a
     * mesma que torna `gitignore-secret` lei: vale para todo projeto, sem depender de provedor. As
     * outras (loopback, digest, rótulo, não-root) são decisão por provedor e ficam na skill (§7.2).
     * `.dockerignore` ausente é do `container-present` — um defeito, uma mensagem.
     */
    id: 'dockerignore-secret',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      const text = project.container.dockerignore;
      if (text === null) return [];
      const patterns = text.split('\n').map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'));
      const covers = (targets) => patterns.some((pattern) => targets.includes(pattern));
      const findings = [];
      if (!covers(['.env', '.env*', '**/.env', '**/.env*'])) {
        findings.push('.dockerignore does not exclude the root .env — `COPY . .` would write it to an image layer'
          + ' and the build cache. Add `.env` and `.env.*`, with `!.env.example` to keep the example');
      }
      if (!covers(['**/.env', '**/.env*'])) {
        findings.push('.dockerignore does not exclude `**/.env` — `.env` alone matches only the context root, so'
          + ' `modules/<id>/.env` and `deploy/.env` would enter the image. Add `**/.env`');
      }
      return findings;
    },
  },
  {
    /**
     * Toda variável que o `compose.yml` interpola está declarada — ou o compose sobe com um valor vazio.
     *
     * "Declarada" tem duas casas, e a fronteira entre elas é o ADR-022: as chaves que o PROCESSO lê
     * (`ROOT_*`, `<MODULE>_*`) saem dos manifestos (`project.json` e `module.json:requiredEnv`, de onde o
     * `sync-env` gera o `.env.example` da raiz); as que SÓ o compose lê (`DEPLOY_*`) moram em
     * `deploy/.env.example`. Variável fora das duas é a que ninguém documenta e ninguém preenche.
     *
     * Lê os manifestos, não o `.env.example` gerado: ele é derivado deles e `sync-env --check` já
     * cobra a igualdade — e o fixture do gate (sem `.env.example` na raiz) mediria a ausência do
     * arquivo, não a da declaração. `$$VAR` (escape do compose) e comentário não contam.
     */
    id: 'compose-variables-declared',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      // Manifesto da raiz ausente ou quebrado e do `root-manifest`: sem ele toda `ROOT_*` pareceria
      // nao declarada, e um defeito viraria uma mensagem por chave — a mesma guarda de `root-env-declared`.
      if (project.manifest.value === null) return [];
      const { compose, composeModules, declaredKeys } = project.container;
      const findings = [];
      for (const [file, text] of [['compose.yml', compose], ['deploy/compose.modules.yml', composeModules]]) {
        if (text === null) continue;
        const withoutComment = text.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
        const used = new Set([...withoutComment.matchAll(COMPOSE_INTERPOLATION)].map((m) => m[1]));
        for (const variable of used) {
          if (declaredKeys.includes(variable)) continue;
          findings.push(`${file}: interpolated variable "${variable}" is not declared — if the process reads it, declare it in`
            + ' project.json/module.json:requiredEnv (sync-env adds it to .env.example); if only Compose reads it,'
            + ' declare it in deploy/.env.example (ADR-022)');
        }
      }
      return findings;
    },
  },
];
