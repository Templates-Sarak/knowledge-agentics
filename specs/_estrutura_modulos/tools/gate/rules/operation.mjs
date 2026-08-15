/**
 * rules/operation.mjs — família "Operação" do catálogo (specs/arquitetura/04-regras.md §4.6).
 * ids: log, determinismo, gateway-credencial, random-inseguro, rota-publica-autenticada,
 *      cookie-seguro, token-em-armazenamento, permissao-literal, sql-concatenado, sql-no-modulo,
 *      segredo-em-log
 *
 * `sql-concatenado` e `segredo-em-log` são de escopo `root` e olham a fiação. Estão nesta família
 * porque é a de SEGURANÇA operacional — a mesma de `cookie-seguro` e `token-em-armazenamento` —, e
 * porque o vocabulário de credencial que `segredo-em-log` precisa já mora aqui. `sql-no-modulo` é a
 * gêmea de escopo `module` da primeira, e as duas dividem o discriminador (`ehSqlInjetado`).
 *
 * Todas leem `arquivo.linhasCodigo`, nunca o conteúdo bruto: comentário e docstring não são
 * código, e a lei escrita num comentário não pode virar violação dela mesma. No molde isso não é
 * detalhe — o literal `"GET /health"` aparece três vezes em docstring explicando a cadeia de auth,
 * e sobre o conteúdo bruto ele viraria violação da própria regra que a docstring descreve.
 */
import { leiturasFalhas, normalizar, operacoesDaSpec, specDe } from '../spec.mjs';
import { textoDeCodigo } from '../text.mjs';

/**
 * Sufixo que denuncia CREDENCIAL numa chave de env. Vocabulário fechado, e o ÚNICO — exportado
 * porque `segredo-em-publico` (§4.4) faz a mesma pergunta sobre a mesma chave, por outro ângulo.
 * Uma segunda lista divergiria da primeira na primeira vez que alguém acrescentasse um sufixo.
 */
export const PADRAO_CREDENCIAL = /_(API_KEY|SECRET|TOKEN|PASSWORD|SENHA|CLIENT_SECRET|PRIVATE_KEY)$/;

/**
 * "Esta linha é uma instrução SQL." Vocabulário fechado, exportado como FONTE de regex porque duas
 * regras compõem a mesma lista com perguntas diferentes: `sql-concatenado` pergunta só isto, e o
 * `gateway-http` (§4.2) a compõe com o vocabulário de CONEXÃO (`createClient`, `new Pool`,
 * `.query(`) para perguntar "este gateway fala com banco?". Uma lista só — duas divergiriam no
 * primeiro verbo que alguém acrescentasse de um lado.
 */
export const SQL_FONTE = 'select\\s+.*\\bfrom\\b|insert\\s+into|update\\s+\\w+\\s+set|delete\\s+from';

const PADRAO_SQL = new RegExp(`\\b(?:${SQL_FONTE})`, 'i');

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
const INTERPOLACAO_EM_SQL = [
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
 *   - o LOGGER estruturado (`CHAMADA_DE_LOG_VERBOS_FONTE`), que é o certo em toda linguagem — os
 *     SETE verbos (`logger|log|logging` × `debug|info|warn|warning|error|critical|exception`) são
 *     a lista ÚNICA, exportada, e tanto a raiz quanto o módulo a usam sem cópia própria;
 *   - a SAÍDA DIRETA (`console.*`, `print(`), compartilhada com a regra `log` — que a proíbe no
 *     módulo, enquanto aqui (raiz) ela é apenas uma das formas de a credencial vazar.
 *
 * A RAIZ (`segredo-em-log`) compõe as duas: não há regra de módulo `log` cobrindo a raiz, então
 * `console`/`print` ali só seria pego aqui. O MÓDULO (`sensivel-em-saida`) usa só os verbos — a
 * saída direta já tem dono (`log`), e compor as duas duplicaria a mensagem para o mesmo `console.log`.
 * A diferença agora é um FILTRO NOMEADO sobre a lista única, nunca uma segunda lista mantida à mão.
 */
const CHAMADA_DE_LOG_VERBOS_FONTE = '\\b(?:logger|log|logging)\\.(?:debug|info|warn|warning|error|critical|exception)\\(';
export const CHAMADA_DE_LOG_VERBOS = new RegExp(CHAMADA_DE_LOG_VERBOS_FONTE);
const SAIDA_DIRETA_FONTE = '\\bconsole\\.\\w+\\(|(?:^|[^.\\w])print\\(';
const SAIDA_DIRETA = new RegExp(SAIDA_DIRETA_FONTE);
const CHAMADA_DE_LOG = new RegExp(`${CHAMADA_DE_LOG_VERBOS_FONTE}|${SAIDA_DIRETA_FONTE}`);

/**
 * Geradores NÃO-criptográficos. `Math.random` e o módulo `random` do Python são previsíveis por
 * construção: dada a semente, a sequência inteira sai. Para token, segredo ou id de sessão, isso é
 * o defeito — o certo é CSPRNG (`crypto.randomUUID`, `crypto.getRandomValues`, `secrets`).
 */
const RNG_FRACO = /Math\.random\(|\brandom\.(?:random|randint|randrange|choice|choices|shuffle|sample|uniform)\(/;

/**
 * O que torna o RNG fraco um problema de SEGURANÇA, e não só de estilo: o valor gerado é usado
 * como credencial. Vocabulário fechado e deliberadamente estreito — exige o contexto na MESMA
 * linha, então `const cor = Math.random()` passa e `const token = Math.random()` cai.
 *
 * `hash` fica de FORA de propósito: aqui ele é o identificador público e universal do registro
 * (02-contrato-e-dados §4), não um segredo. Incluí-lo acusaria o gerador de id de todo adapter.
 */
const PALAVRAS_SECRETAS = new Set([
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
function palavrasDe(texto) {
  return texto
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((parte) => parte !== '')
    .map((parte) => parte.toLowerCase());
}

/** Bigrama junto cobre `api_key` e `apiKey`, que desmontam em duas palavras genéricas. */
function temContextoSecreto(texto) {
  const palavras = palavrasDe(texto);
  return palavras.some((palavra, indice) => (
    PALAVRAS_SECRETAS.has(palavra) || PALAVRAS_SECRETAS.has(palavra + (palavras[indice + 1] ?? ''))
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
const ROTA_LITERAL = /['"`](GET|POST|PUT|PATCH|DELETE)\s+\/[^'"`]*['"`]/;

/**
 * Permissão escrita como LITERAL no argumento de `requirePermission`. É a forma exata da autorização
 * que desmente o manifesto: `module.json:permissions` declara uma coisa, a rota exige outra, e nada
 * muda quando o manifesto muda.
 *
 * `[^)]*` cobre as duas assinaturas dos moldes — `requirePermission(ler)` em TS/JS e
 * `require_permission(request, permissao)` em Python, onde o literal seria o SEGUNDO argumento.
 */
const PERMISSAO_LITERAL = /require_?[Pp]ermission\s*\([^)]*['"`]/;

/** Onde um cookie é definido, em Express/Fastify e em Python. */
const DEFINE_COOKIE = /\bres(?:ponse)?\.cookie\(|set_cookie\(|['"`]Set-Cookie['"`]/i;

/**
 * Cookie que carrega SESSÃO. Vocabulário próprio e estreito, e não o `PALAVRAS_SECRETAS` do
 * `random-inseguro`: aquele inclui `csrf`, e o cookie de CSRF no padrão double-submit **precisa**
 * ser legível por JavaScript — exigir `HttpOnly` dele seria falso positivo sobre código correto.
 */
const COOKIE_DE_SESSAO = /\b(session|sessao|sess|sid|token|auth|jwt|refresh)\b/i;

const FLAGS_DE_COOKIE = [
  { nome: 'HttpOnly', padrao: /httponly/i },
  { nome: 'Secure', padrao: /\bsecure\b/i },
  { nome: 'SameSite', padrao: /samesite|same_site/i },
];

const ARMAZENAMENTO_DO_NAVEGADOR = /\b(localStorage|sessionStorage)\b/;

function contextoSecretoPerto(texto, anterior) {
  if (temContextoSecreto(texto)) return true;
  return /^\s*return\b/.test(texto) && anterior !== undefined && temContextoSecreto(anterior);
}

/**
 * A lista de isenção vem do MANIFESTO, e não de literal no código — as duas metades do mesmo fato.
 *
 * É a cláusula que o molde já demonstra em `permissoesDe` ("As permissoes vem do manifesto, nunca
 * de literal no codigo"): a `api/` lê `publicRoutes` do manifesto, e nenhum lugar dela escreve a
 * lista à mão. Uma lista hardcoded desmente o manifesto sem que o manifesto mude.
 */
function conferirOrigemDaLista(daApi) {
  const achados = [];
  // `textoDeCodigo`, e nao `conteudo`: a clausula afirma que a `api/` LE o manifesto, e prosa nao le
  // nada. Sobre o texto cru, a docstring que EXPLICA `publicRoutes` — o molde tem tres — satisfaria
  // a checagem, e um modulo que tivesse apagado a leitura de verdade passaria calado por causa do
  // comentario que a descreve. Falso negativo, e do tipo que aprova em silencio, que e o que o §7
  // inteiro existe para evitar. Nos tres moldes a leitura real esta em codigo (`manifesto.publicRoutes`,
  // `manifesto["publicRoutes"]`), entao fechar o buraco nao acusa nenhum deles.
  if (!daApi.some((a) => textoDeCodigo(a).includes('publicRoutes'))) {
    achados.push('api/ nunca le module.json:publicRoutes — a isencao de autenticacao nao pode vir'
      + ' de outro lugar, senao o manifesto declara uma coisa e a cadeia aplica outra');
  }
  for (const arquivo of daApi) {
    for (const { numero, texto } of arquivo.linhasCodigo) {
      if (ROTA_LITERAL.test(texto)) {
        achados.push(`${arquivo.rel}:${numero}: rota no formato "METODO /caminho" literal no codigo`
          + ' — a lista de rotas publicas vem de module.json:publicRoutes, nunca do codigo');
      }
    }
  }
  return achados;
}

/**
 * Toda entrada de `publicRoutes` aponta para uma rota que EXISTE no contrato do módulo.
 *
 * Entrada com typo (`GET /helth`) não isenta nada e ninguém percebe: o autor acredita que abriu a
 * rota, a cadeia continua exigindo token, e o defeito só aparece em produção. O método entra na
 * comparação porque a lei diz que ele faz parte da declaração — abrir a leitura nunca pode abrir a
 * escrita do mesmo caminho por descuido (03-operacao.md §2.1).
 */
function conferirRotasPublicasReais(ctx) {
  const declaradas = ctx.manifesto?.publicRoutes ?? [];
  if (declaradas.length === 0) return [];
  const spec = specDe(ctx);
  // Spec ausente ou com `paths:` ilegivel e do `contract` — acusar aqui viraria "nao consegui ler"
  // em "a rota nao existe", que e afirmar falsidade e mandar apagar o que esta certo.
  if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];

  const operacoes = operacoesDaSpec(spec.conteudo);
  const achados = [];
  for (const entrada of declaradas) {
    const [metodo, caminho] = entrada.split(/\s+/);
    // Forma garantida pelo JSON Schema (`^(GET|POST|PATCH|PUT|DELETE) /`); manifesto torto e do
    // `schema-manifesto`, nao desta regra.
    if (caminho === undefined) continue;
    const rota = [...operacoes.keys()].find((r) => normalizar(r) === normalizar(caminho));
    if (rota === undefined) {
      achados.push(`publicRoutes declara "${entrada}" mas o contrato nao tem o caminho "${caminho}"`
        + ' — a entrada nao isenta nada, e a rota que se queria publica segue exigindo token');
      continue;
    }
    if (!operacoes.get(rota).has(metodo)) {
      achados.push(`publicRoutes declara "${entrada}" mas o contrato nao declara ${metodo} em "${rota}"`
        + ` (declara: ${[...operacoes.get(rota)].join(', ') || 'nenhum'})`);
    }
  }
  return achados;
}

/**
 * O discriminador de INJEÇÃO, e o único — `sql-concatenado` (raiz) e `sql-no-modulo` (módulo) fazem
 * a mesma pergunta em coleções diferentes, e uma segunda cópia divergiria da primeira no primeiro
 * padrão que alguém acrescentasse de um lado.
 *
 * Duas condições na MESMA linha: parece SQL, e o valor entra na string. É o recorte que deixa a
 * forma correta passar — `db.query('… where hash = $1', [hash])` não interpola nada.
 */
function ehSqlInjetado(texto) {
  if (!PADRAO_SQL.test(texto)) return false;
  return INTERPOLACAO_EM_SQL.some((padrao) => padrao.test(texto));
}

/**
 * Percorre as linhas de código de cada arquivo do módulo que casa o filtro.
 *
 * `padrao` aceita regex OU predicado: regra cuja decisão é de UMA forma passa o regex, e regra que
 * cruza duas condições na mesma linha passa a função. Sem isso, a segunda precisaria do próprio laço
 * — e um laço duplicado é onde `eTeste` deixa de ser pulado no dia em que alguém mexer só num deles.
 */
function varrer(ctx, filtrar, padrao, mensagem) {
  const casa = typeof padrao === 'function' ? padrao : (texto) => padrao.test(texto);
  const achados = [];
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !filtrar(arquivo)) continue;
    for (const { numero, texto } of arquivo.linhasCodigo) {
      if (casa(texto)) achados.push(`${arquivo.rel}:${numero}: ${mensagem}`);
    }
  }
  return achados;
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
export function varrerRaiz(projeto, aplicar) {
  const achados = [];
  for (const arquivo of projeto.codigo) {
    if (arquivo.eTeste) continue;
    for (const { numero, texto } of arquivo.linhasCodigo) {
      const mensagem = aplicar(texto);
      if (mensagem !== null) achados.push(`${arquivo.rel}:${numero}: ${mensagem}`);
    }
  }
  return achados;
}

export default [
  {
    id: 'log',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      return varrer(ctx, () => true, SAIDA_DIRETA, 'saida direta — use o logger estruturado');
    },
  },
  {
    id: 'determinismo',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      return varrer(
        ctx,
        (arquivo) => arquivo.rel.startsWith('core/'),
        /Math\.random\(|new Date\(\s*\)|Date\.now\(|datetime\.now\(|\brandom\.\w+\(/,
        'nao-determinismo em core/ — use as portas relogio e geradorId',
      );
    },
  },
  {
    id: 'random-inseguro',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        // FRONTEIRA com `determinismo`, e ela e explicita: dentro de `core/` quem cobra RNG fraco e
        // o `determinismo`, por reprodutibilidade, e o conserto dele (receber a porta `geradorId`)
        // ja resolve o lado da seguranca. Acusar aqui tambem daria duas mensagens para um conserto
        // so. Fora de `core/` o `determinismo` cala, e e exatamente ali que esta regra vive.
        if (arquivo.eTeste || arquivo.rel.startsWith('core/')) continue;
        arquivo.linhasCodigo.forEach(({ numero, texto }, indice) => {
          if (RNG_FRACO.test(texto) && contextoSecretoPerto(texto, arquivo.linhasCodigo[indice - 1]?.texto)) {
            achados.push(`${arquivo.rel}:${numero}: token/segredo gerado com RNG nao-criptografico`
              + ' — use CSPRNG (crypto.randomUUID, crypto.getRandomValues, secrets)');
          }
        });
      }
      return achados;
    },
  },
  {
    id: 'rota-publica-autenticada',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const daApi = ctx.codigo.filter((a) => !a.eTeste && a.rel.startsWith('api/'));
      // Sem `api/` nao ha cadeia de middleware para julgar — `estrutura` ja cobra a ausencia dela.
      if (daApi.length === 0) return [];
      return [...conferirOrigemDaLista(daApi), ...conferirRotasPublicasReais(ctx)];
    },
  },
  {
    /**
     * A permissão em vigor é a DECLARADA — e é o análogo exato da cláusula (b) do
     * `rota-publica-autenticada`, com o molde já demonstrando o padrão: *"As permissoes vem do
     * manifesto, nunca de literal no codigo"*.
     *
     * Cobra UMA coisa, e o nome diz qual. A outra metade — "toda permissão declarada é exigida em
     * alguma rota", o análogo do `config-morta` — foi DESCARTADA, e não por preguiça: ela é
     * incompatível com esta. O molde consome as permissões por POSIÇÃO
     * (`const [ler, escrever] = config.manifesto.permissions`), então a string `<modulo>:ler` nunca
     * aparece no código — e não pode aparecer, porque é exatamente o que esta regra proíbe.
     * Procurá-la seria cobrar o oposto do que se cobra na linha de cima. Registrado no §7.1.
     */
    id: 'permissao-literal',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      return varrer(
        ctx,
        (arquivo) => arquivo.rel.startsWith('api/'),
        PERMISSAO_LITERAL,
        'permissao literal em exigirPermissao — a permissao em vigor vem de'
        + ' module.json:permissions, nunca do codigo: com o literal aqui, o manifesto declara uma'
        + ' coisa e a rota exige outra, e mudar o manifesto nao muda nada',
      );
    },
  },
  {
    id: 'cookie-seguro',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          // CONDICIONAL: so cobra onde o cookie de sessao EXISTE. Modulo sem cookie — o caso do
          // molde, cuja auth e `Authorization: Bearer` — nao tem o que declarar, e a regra cala.
          if (!DEFINE_COOKIE.test(texto) || !COOKIE_DE_SESSAO.test(texto)) continue;
          const faltando = FLAGS_DE_COOKIE.filter(({ padrao }) => !padrao.test(texto));
          if (faltando.length === 0) continue;
          achados.push(`${arquivo.rel}:${numero}: cookie de sessao sem ${faltando.map((f) => f.nome).join(', ')}`
            + ' — sem HttpOnly qualquer XSS le o cookie, sem Secure ele viaja em claro, e sem'
            + ' SameSite ele acompanha requisicao de outro site');
        }
      }
      return achados;
    },
  },
  {
    id: 'token-em-armazenamento',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (!ARMAZENAMENTO_DO_NAVEGADOR.test(texto)) continue;
          // O proprio `sessionStorage` carrega a palavra "session": sem tira-lo do texto antes de
          // procurar o contexto, guardar o TEMA em sessionStorage seria acusado como token.
          const semOIdentificador = texto.replace(ARMAZENAMENTO_DO_NAVEGADOR, ' ');
          if (!temContextoSecreto(semOIdentificador)) continue;
          achados.push(`${arquivo.rel}:${numero}: token de autenticacao em localStorage/sessionStorage`
            + ' — qualquer XSS na pagina o le. Use cookie HttpOnly, ou mantenha o token so em memoria');
        }
      }
      return achados;
    },
  },
  {
    /**
     * SQL parametrizado, nunca concatenado — na FIAÇÃO, que é onde a query nasce: o módulo não pode
     * ter driver (`sdk-fornecedor`) nem importar adapter (`import-adapter`), então quem monta a query
     * é `adapters/`.
     *
     * A gêmea de escopo `module` é `sql-no-modulo`, e as duas nunca acusam o mesmo arquivo: esta lê
     * `projeto.codigo` (`adapters/`, `src/`, `packages/`), aquela lê `ctx.codigo` (a pasta do módulo),
     * e `context.mjs` mantém as duas coleções disjuntas por construção.
     */
    id: 'sql-concatenado',
    nivel: 'erro',
    escopo: 'root',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      return varrerRaiz(projeto, (texto) => (ehSqlInjetado(texto)
        ? 'SQL montado por concatenacao ou interpolacao — o valor de fora entra na string e vira'
          + ' COMANDO. Use placeholder ($1, ?, :nome, %s) e passe o valor como parametro: o driver'
          + ' escapa, a string nunca'
        : null));
    },
  },
  {
    /**
     * O vetor que sobrava, e ele estava medido: SQL montado DENTRO do módulo.
     *
     * O `sql-concatenado` foi para a raiz porque quem fala com banco é o adapter, e isso continua
     * certo. Só que "o módulo não fala com banco" é doutrina sem verificador na única forma que
     * importa: a superfície canônica de `packages/ports/` é tipada por OPERAÇÃO — `listar`,
     * `buscarPorHash`, `inserir`, `contar`, e nenhuma porta aceita comando —, mas o `core/ports/` do
     * MÓDULO é escrito pelo autor do módulo e nada compara a forma dele com a canônica. Acrescentar
     * `executarConsulta(sql: string)` ali é legal aos olhos do gate, e a partir daí a concatenação
     * mora no módulo e a execução na raiz: `sql-concatenado` vê o `.query(sql)` do adapter e NÃO vê
     * como a string nasceu. Medido — a mesma linha, acusada em `adapters/` e calada em `modules/`.
     *
     * MESMO discriminador da gêmea, uma implementação só (`ehSqlInjetado`): parece SQL, e o valor
     * entra na string. Divergir aqui faria uma das duas acusar o que a outra deixa passar.
     */
    id: 'sql-no-modulo',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      return varrer(
        ctx,
        () => true,
        ehSqlInjetado,
        'SQL montado no modulo — o modulo nao fala com banco: a query e do adapter, atras de uma porta'
          + ' tipada por OPERACAO (buscarPorHash(hash)), nunca por COMANDO (executar(sql)). Nesta'
          + ' fronteira o `sql-concatenado` da raiz nao ajuda: o adapter recebe a string ja montada e'
          + ' nao ve como ela nasceu',
      );
    },
  },
  {
    /**
     * Segredo não vai para log — e o sinal vem de onde já existe declaração, não de um campo novo.
     *
     * O módulo cruza `sensitiveFields` com a projeção e o log (`sensivel-em-saida`), e a raiz não
     * tem esse campo: `project.json` declara `requiredEnv` e nada mais, com
     * `additionalProperties: false` fechando a porta de propósito. O sinal aqui é melhor, porque já
     * está declarado: as chaves `RAIZ_*` do manifesto filtradas pelo MESMO vocabulário fechado de
     * sufixo de credencial que `gateway-credencial` e `segredo-em-publico` usam. `RAIZ_JWT_SECRET` é
     * segredo; `RAIZ_API_BASE_URL` não é, e não é acusada.
     */
    id: 'segredo-em-log',
    nivel: 'erro',
    escopo: 'root',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      const credenciais = (projeto.manifesto.valor?.requiredEnv ?? [])
        .filter((chave) => PADRAO_CREDENCIAL.test(chave));
      if (credenciais.length === 0) return [];

      return varrerRaiz(projeto, (texto) => {
        if (!CHAMADA_DE_LOG.test(texto)) return null;
        const citada = credenciais.find((chave) => new RegExp(`\\b${chave}\\b`).test(texto));
        if (citada === undefined) return null;
        return `credencial "${citada}" citada em chamada de log — o valor dela vai para o arquivo de`
          + ' log, para o agregador e para quem tiver acesso a eles, onde nenhuma rotacao de segredo'
          + ' alcanca. Logue o FATO ("segredo ausente"), nunca o segredo';
      });
    },
  },
  {
    id: 'gateway-credencial',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      if (ctx.manifesto?.role === 'gateway') return [];
      return (ctx.manifesto?.requiredEnv ?? [])
        .filter((chave) => PADRAO_CREDENCIAL.test(chave))
        .map((chave) => `env "${chave}" e credencial de servico externo — so modulo com papel "gateway" pode declarar`);
    },
  },
];
