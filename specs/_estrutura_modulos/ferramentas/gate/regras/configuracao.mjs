/**
 * regras/configuracao.mjs — família "Configuração e ambiente" (specs/arquitetura/04-regras.md §4.4).
 * ids: config-valida, schema-config, config-morta, porta-declarada, hardcode-url, hardcode-numero,
 *      fallback-silencioso, cors-aberto, env-declarado, env-exemplo, env-modulo,
 *      env-fora-do-carregador, gitignore-segredo, segredo-em-publico,
 *      verificacao-declarada, lint-derivado, env-raiz-declarado,
 *      hardcode-url-raiz, fallback-raiz
 *
 * As SEIS últimas são sobre o PROJETO, não sobre o módulo, e por isso têm `escopo: 'raiz'`:
 * recebem `ctx.projeto` em vez de um contexto de módulo e rodam UMA vez por invocação. Enquanto
 * eram `escopo: 'modulo'` com guarda, o resultado era certo e a saída não: um defeito de projeto
 * emitia uma mensagem por módulo — dez módulos, dez mensagens idênticas para um conserto só.
 * Global nunca serviu: `analisar` descarta achado global cujo módulo não esteja entre os
 * selecionados, e a raiz não é módulo nenhum.
 */
import { carregarEsquema, validar } from '../esquema.mjs';
// Vocabulário de credencial: UMA lista, a do `gateway-credencial`. As duas regras fazem a mesma
// pergunta sobre a mesma chave por ângulos diferentes — duas listas divergiriam no primeiro sufixo
// novo que alguém acrescentasse de um lado só.
// `varrerRaiz` vem do mesmo lugar, e pelo mesmo argumento: e o percurso das linhas de codigo da
// FIACAO, usado por quatro regras de raiz espalhadas por duas familias. Duas copias de um laco
// divergiriam no primeiro filtro novo (`eTeste` foi exatamente esse filtro).
import { PADRAO_CREDENCIAL, varrerRaiz } from './operacao.mjs';
// A MESMA função que o `--conferir` do gerador usa. Importar (e não reimplementar) é o que impede
// a regra e o gerador de divergirem — o defeito que o gerador existe para eliminar, um nível acima.
import { BINDINGS, saidaDe } from '../../gerar-config-lint.mjs';

const CONFIGS = ['api', 'dominio', 'seguranca', 'portas', 'textos'];

/**
 * Chave de ambiente da RAIZ. `RAIZ_` é prefixo RESERVADO, e é o que a distingue da chave de módulo
 * (`<MODULO>_*`, cobrada por `env-modulo`): sem convenção não há como uma regra dizer de quem é a
 * chave. O vocabulário já chamava a raiz assim — o `.env` do módulo aponta para ela por `ENV_RAIZ`.
 */
const CHAVE_DE_RAIZ = /\bRAIZ_[A-Z0-9_]+\b/g;

/**
 * URL literal. UMA implementação, e as duas regras que a usam são o mesmo defeito em dois
 * territórios: `hardcode-url` no módulo e `hardcode-url-raiz` na fiação. Endereço de infraestrutura
 * vem do ambiente nos dois lados — o que muda é só de onde ele é declarado.
 */
const URL_LITERAL = /["'`]https?:\/\/[^"'`]+["'`]/;

/**
 * Default silencioso de env, nas quatro formas em que ele aparece. UMA lista, compartilhada por
 * `fallback-silencioso` (módulo) e `fallback-raiz` (fiação): o defeito é literalmente o mesmo — a
 * ausência de configuração deixa de derrubar o boot e passa a virar um valor embutido.
 */
const PADROES_DE_FALLBACK = [
  /process\.env\[[^\]]+\]\s*(\?\?|\|\|)\s*['"`]/,
  /process\.env\.\w+\s*(\?\?|\|\|)\s*['"`]/,
  /getenv\([^)]*,\s*['"]/,
  /environ\.get\([^)]*,\s*['"]/,
];
const ARQUIVOS_CARREGADORES = ['api/src/config.ts', 'api/src/config.js', 'api/src/config.py'];

/** Os dois caminhos que o `.gitignore` do projeto TEM de cobrir. `modulos/*` vale por qualquer id. */
const SEGREDOS_A_IGNORAR = ['.env', 'modulos/qualquer-modulo/.env'];

/**
 * Prefixos que o bundler EXPÕE no bundle do front. Vocabulário fechado — quem decide o que é
 * público é o build tool, não o projeto.
 *
 * A formulação intuitiva é invertida e vale registrar: chave SEM prefixo usada no front não vaza —
 * o bundler simplesmente não a injeta, e ela chega `undefined`. O defeito é o contrário, e é este:
 * valor secreto numa variável de prefixo público, que por isso vira público de verdade.
 */
const PREFIXOS_PUBLICOS = [
  'VITE_', 'NEXT_PUBLIC_', 'PUBLIC_', 'REACT_APP_', 'NUXT_PUBLIC_', 'EXPO_PUBLIC_', 'GATSBY_',
];

const CHAVE_PUBLICA = new RegExp(`\\b(?:${PREFIXOS_PUBLICOS.join('|')})[A-Z0-9_]+\\b`, 'g');

function ehPublicaComCredencial(chave) {
  return PREFIXOS_PUBLICOS.some((prefixo) => chave.startsWith(prefixo)) && PADRAO_CREDENCIAL.test(chave);
}

/** Linhas efetivas de um `.gitignore`: sem comentário e sem branco, na ordem original. */
function padroesDeIgnore(texto) {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#'));
}

/**
 * O padrão casa o caminho? Subconjunto honesto do gitignore, e é o bastante para a pergunta desta
 * regra: padrão SEM barra casa o nome do arquivo em qualquer profundidade; com barra, casa o
 * caminho a partir da raiz. `*` não atravessa `/`, `**` atravessa.
 *
 * O casamento é EXATO, e é o que mantém `.env.example` versionável: `.env` não casa `.env.example`.
 */
function casaIgnore(padrao, caminho) {
  const limpo = padrao.replace(/\/$/, '');
  const semAncora = limpo.startsWith('/') ? limpo.slice(1) : limpo;
  const alvo = limpo.includes('/') ? caminho : caminho.split('/').pop();
  // `**/` inicial vale ZERO ou mais diretorios, inclusive nenhum: `**/.env` cobre tanto o `.env` da
  // raiz quanto o de `modulos/x/`. Traduzi-lo como `.*/` exigiria ao menos uma barra e faria a
  // regra acusar um `.gitignore` correto — falso positivo, a direcao que ela nao pode ter.
  const expressao = semAncora.startsWith('**/')
    ? `(?:.*/)?${comoRegex(semAncora.slice(3))}`
    : comoRegex(semAncora);
  return new RegExp(`^${expressao}$`).test(alvo);
}

/**
 * Traduz o glob do gitignore para regex, caractere a caractere.
 *
 * Percorrer, e não encadear `replace`, é deliberado: a versão encadeada precisava de um caractere
 * neutro para segurar o `**` entre uma troca e outra, e esse marcador invisível acabou GRAVADO no
 * arquivo — que virou binário aos olhos do `grep`. Tradução sem estado escondido não tem como
 * deixar rastro.
 */
function comoRegex(glob) {
  let saida = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      saida += '.*';
      i += 1;
    } else if (glob[i] === '*') {
      saida += '[^/]*';
    } else if (glob[i] === '?') {
      saida += '[^/]';
    } else {
      saida += glob[i].replace(/[.+^${}()|[\]\\]/, '\\$&');
    }
  }
  return saida;
}

/** O `.gitignore` ignora este caminho? Vence o ÚLTIMO padrão que casa, como no git. */
function estaIgnorado(padroes, caminho) {
  let ignorado = false;
  for (const padrao of padroes) {
    const negado = padrao.startsWith('!');
    if (casaIgnore(negado ? padrao.slice(1) : padrao, caminho)) ignorado = !negado;
  }
  return ignorado;
}

/** Linhas de um `.env`, ignorando comentário e branco. Devolve [chave, valor]. */
function lerParesEnv(conteudo) {
  return conteudo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#'))
    .map((linha) => {
      const igual = linha.indexOf('=');
      return igual === -1 ? [linha, ''] : [linha.slice(0, igual).trim(), linha.slice(igual + 1).trim()];
    });
}

function arquivoPorNome(ctx, rel) {
  return ctx.arquivos.find((a) => a.rel === rel) ?? null;
}

function ehCarregador(rel) {
  return ARQUIVOS_CARREGADORES.includes(rel) || /vite\.config|next\.config/.test(rel);
}

export default [
  {
    id: 'config-valida',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return CONFIGS
        .filter((assunto) => ctx.configs[assunto].presente && ctx.configs[assunto].valor === null)
        .map((assunto) => `config/${assunto}.json nao e JSON valido`);
    },
  },
  {
    id: 'schema-config',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const assunto of CONFIGS) {
        const { presente, valor } = ctx.configs[assunto];
        // Ausente ou JSON quebrado ja foi reportado por `estrutura`/`config-valida`.
        if (!presente || valor === null) continue;
        achados.push(...validar(valor, carregarEsquema(`config-${assunto}`), `config/${assunto}.json`));
      }
      return achados;
    },
  },
  {
    /**
     * As duas metades de UMA declaração: `modulo.json:portas` diz o que o módulo EXIGE,
     * `config/portas.json` diz QUEM preenche cada exigência. Coincidem nos dois sentidos, como
     * `env-exemplo` faz entre `envRequerido` e `.env.example`.
     *
     * O schema não podia cobrar isto e o `$comentario` dele afirmava que cobrava — schema nenhum
     * enxerga o `modulo.json`. Com `additionalProperties: false` e sem `required`, as DUAS brechas
     * passavam: configurar `storage` sem declará-lo (está no vocabulário) e declarar `storage` sem
     * configurá-lo (não há campo obrigatório).
     *
     * As duas pontas têm consequências diferentes, e a mensagem diz qual: declarada e não
     * configurada DERRUBA O BOOT — `resolverDependencias` não acha o provedor e lança; configurada
     * e não declarada é config morta, um provedor escolhido para uma porta que ninguém exige.
     */
    id: 'porta-declarada',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const declaradas = ctx.manifesto?.portas;
      const { presente, valor } = ctx.configs.portas;
      // Manifesto torto e do `schema-manifesto`; arquivo ausente ou ilegivel e da `estrutura` e do
      // `config-valida`. Aqui so entra declaracao legivel dos dois lados.
      if (!Array.isArray(declaradas) || !presente || valor === null) return [];

      // Chave iniciada por `_` e comentario, pela mesma convencao do validador de schema.
      const configuradas = Object.keys(valor).filter((chave) => !chave.startsWith('_'));
      const achados = [];
      for (const porta of declaradas) {
        if (configuradas.includes(porta)) continue;
        achados.push(`porta "${porta}" declarada em modulo.json:portas e ausente de`
          + ' config/portas.json — a composicao nao acha o provedor e DERRUBA o boot');
      }
      for (const porta of configuradas) {
        if (declaradas.includes(porta)) continue;
        achados.push(`config/portas.json escolhe provedor para "${porta}", ausente de`
          + ' modulo.json:portas — provedor para uma porta que o modulo nao exige e config morta');
      }
      return achados;
    },
  },
  {
    id: 'cors-aberto',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const cors = ctx.configs.seguranca.valor?.cors;
      if (cors === undefined) return [];
      // `*` devolve o recurso para QUALQUER origem. Origem se declara, uma a uma.
      if ((cors.origensPermitidas ?? []).includes('*')) {
        return ['config/seguranca.json: cors.origensPermitidas contem "*" — origem e DECLARADA, nunca aberta'];
      }
      return [];
    },
  },
  {
    id: 'config-morta',
    nivel: 'aviso',
    escopo: 'modulo',
    verificar(ctx) {
      const codigo = ctx.codigo.filter((a) => !a.eTeste).map((a) => a.conteudo).join('\n');
      const achados = [];
      for (const assunto of CONFIGS) {
        const valor = ctx.configs[assunto].valor;
        if (valor === null || typeof valor !== 'object') continue;
        for (const chave of Object.keys(valor)) {
          if (chave.startsWith('_')) continue;
          if (!codigo.includes(chave)) achados.push(`config/${assunto}.json: chave "${chave}" declarada e nunca lida`);
        }
      }
      return achados;
    },
  },
  {
    id: 'hardcode-url',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          const casado = texto.match(URL_LITERAL);
          if (casado !== null) {
            achados.push(`${arquivo.rel}:${numero}: URL literal ${casado[0]} — vai para .env ou config/`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'hardcode-numero',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // Nome que denuncia valor de INFRAESTRUTURA. Numero de negocio (aliquota, prazo) tem nome
      // de negocio e mora em config/dominio.json — nao entra neste padrao.
      // Fronteira SO no inicio da palavra: `timeoutMs` e `maxTentativas` casam, `importante` nao
      // (nao ha fronteira antes de "port" em "im|port"). Exigir `\b` no fim perdia todo nome
      // composto — que e justamente como esses valores costumam se chamar.
      const nomes = /\b(porta|port|timeout|tempoLimite|limite|limit|max|minimo|intervalo|ttl|janela|retentativas|tentativas)/i;
      const achados = [];

      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste || arquivo.rel.startsWith('config/')) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          // Atribuicao de literal numerico (>1) a identificador de infraestrutura.
          const casado = texto.match(/([A-Za-z_]\w*)\s*[:=]\s*(\d{2,})\b/);
          if (casado === null || !nomes.test(casado[1])) continue;
          // SCREAMING_SNAKE e constante de vocabulario fechado (codigo HTTP, enum), nao tunable —
          // chave de config e camelCase por nomenclatura (§3.1). `LIMITE_EXCEDIDO: 429` fica fora.
          if (casado[1] === casado[1].toUpperCase()) continue;
          achados.push(`${arquivo.rel}:${numero}: literal ${casado[2]} em "${casado[1]}" — vai para config/ ou .env`);
        }
      }
      return achados;
    },
  },
  {
    id: 'fallback-silencioso',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (PADROES_DE_FALLBACK.some((padrao) => padrao.test(texto))) {
            achados.push(`${arquivo.rel}:${numero}: fallback de env — falta de config DERRUBA o boot`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'env-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const id = ctx.manifesto?.id;
      if (id === undefined) return [];
      const prefixo = id.toUpperCase().replace(/-/g, '_');
      const declaradas = new Set(ctx.manifesto.envRequerido ?? []);
      const usadas = new Set();
      const padrao = new RegExp(`\\b(?:VITE_)?(${prefixo}_[A-Z0-9_]+)\\b`, 'g');

      for (const arquivo of ctx.codigo) {
        for (const achado of arquivo.conteudo.matchAll(padrao)) usadas.add(achado[1]);
      }
      return [...usadas]
        .filter((chave) => !declaradas.has(chave))
        .map((chave) => `env "${chave}" usada no codigo e ausente de modulo.json:envRequerido`);
    },
  },
  {
    id: 'env-exemplo',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const arquivo = arquivoPorNome(ctx, '.env.example');
      if (arquivo === null) return ['.env.example ausente — gere com ferramentas/sincronizar-env.mjs'];
      const declaradas = ctx.manifesto?.envRequerido ?? [];
      const documentadas = lerParesEnv(arquivo.conteudo).map(([chave]) => chave);
      const achados = [];
      for (const chave of declaradas) {
        if (!documentadas.includes(chave)) achados.push(`.env.example nao documenta "${chave}"`);
      }
      for (const chave of documentadas) {
        if (!declaradas.includes(chave)) achados.push(`.env.example documenta "${chave}", ausente do manifesto`);
      }
      return achados;
    },
  },
  {
    id: 'env-modulo',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const arquivo = arquivoPorNome(ctx, '.env');
      if (arquivo === null) return [];
      const prefixo = (ctx.manifesto?.id ?? '').toUpperCase().replace(/-/g, '_');
      return lerParesEnv(arquivo.conteudo)
        .map(([chave]) => chave)
        .filter((chave) => chave !== 'ENV_RAIZ' && !chave.startsWith(prefixo) && !chave.startsWith(`VITE_${prefixo}`))
        .map((chave) => `.env do modulo contem "${chave}" — so ENV_RAIZ e chaves ${prefixo}_* sao aceitas`);
    },
  },
  {
    id: 'gitignore-segredo',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      // Mesma guarda das outras duas regras de projeto: modulo solto nao tem `.gitignore` de
      // projeto, e cobrar um dele seria falso positivo garantido.
      if (!projeto.ehProjeto) return [];
      if (projeto.gitignore === null) {
        return ['.gitignore ausente na raiz do projeto — o .env real ficaria versionavel'];
      }
      const padroes = padroesDeIgnore(projeto.gitignore);
      const descobertos = SEGREDOS_A_IGNORAR.filter((caminho) => !estaIgnorado(padroes, caminho));
      if (descobertos.length === 0) return [];
      // NAO afirma que o arquivo esta versionado — isso exigiria `git ls-files`, e o gate nao roda
      // git de proposito. Aqui e so o arquivo de ignore; o que ja foi commitado e do passo de CI.
      return [`.gitignore nao ignora ${descobertos.join(' nem ')} — o segredo real fica versionavel.`
        + ' Acrescente as linhas ".env" e "modulos/*/.env" (o .env.example continua versionado)'];
    },
  },
  {
    id: 'segredo-em-publico',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      // No MANIFESTO: e a declaracao, e onde o defeito nasce. Sem excecao por `papel` — o
      // `gateway-credencial` isenta o gateway porque credencial e o oficio dele, mas nem o gateway
      // pode publicar a credencial no bundle.
      for (const chave of ctx.manifesto?.envRequerido ?? []) {
        if (ehPublicaComCredencial(chave)) {
          achados.push(`env "${chave}" tem prefixo PUBLICO e nome de credencial — o bundler injeta`
            + ' esse valor no bundle do front, onde qualquer visitante o le. Segredo fica no'
            + ' servidor, sem prefixo publico');
        }
      }
      // No CODIGO: pega a chave usada e nao declarada, que o manifesto por definicao nao mostra.
      // `env-fora-do-carregador` nao cobre isto — ele procura `process.env`, e o front le
      // `import.meta.env`, que nao casa o padrao dele.
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          for (const chave of texto.match(CHAVE_PUBLICA) ?? []) {
            if (!ehPublicaComCredencial(chave)) continue;
            achados.push(`${arquivo.rel}:${numero}: "${chave}" tem prefixo PUBLICO e nome de`
              + ' credencial — esse valor vai para o bundle do front');
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'verificacao-declarada',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      // Modulo solto (extraido e ainda nao religado a um esqueleto) ou fixture nao e projeto —
      // cobrar politica de projeto de quem nao tem `modulos/` seria falso positivo garantido.
      if (!projeto.ehProjeto) return [];
      const { presente, valor } = projeto.verificacao;
      // REPROVA quando ausente, e nao silencia: o arquivo nasce com todo projeto gerado, entao a
      // ausencia dele so acontece por apagamento ou por repositorio anterior ao template. Calar
      // tornaria "nenhuma politica declarada" indistinguivel de "politica conforme" — a confusao
      // que este gate inteiro existe para impedir.
      if (!presente) {
        return ['config/verificacao.json ausente na raiz do projeto — declare cobertura, severidade'
          + ' de dependencia e ferramenta por linguagem (schema em ferramentas/gate/schemas/)'];
      }
      if (valor === null) return ['config/verificacao.json nao e JSON valido'];
      return validar(valor, carregarEsquema('verificacao'), 'config/verificacao.json');
    },
  },
  {
    id: 'lint-derivado',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];

      // A pergunta e "o que esta na raiz e ALGUMA saida do gerador?", e NAO "bate com o binding
      // deste modulo". A config de lint e do PROJETO, e o binding do modulo e outro fato: um modulo
      // escafoldado com o binding errado faria esta regra pedir `eslint.config.js` num projeto
      // Python — mandando consertar a config quando o defeito e o manifesto do modulo. Mensagem que
      // aponta o conserto errado e pior que mensagem nenhuma.
      const derivadas = BINDINGS.map((binding) => saidaDe(binding));
      const naRaiz = Object.entries(projeto.configsDeLint).filter(([, texto]) => texto !== null);
      if (naRaiz.length === 0) {
        const nomes = [...new Set(derivadas.map((d) => d.nome))].join(' ou ');
        return [`nenhuma config de linter na raiz do projeto (${nomes}) — sem ela os limiares 40/3/4`
          + ' so sao cobrados pelo gate. Gere com: node ferramentas/gerar-config-lint.mjs'];
      }

      const achados = [];
      for (const [nome, texto] of naRaiz) {
        const esperadas = derivadas.filter((d) => d.nome === nome).map((d) => d.conteudo);
        if (esperadas.includes(texto)) continue;
        achados.push(`${nome} diverge de ferramentas/gate/limiares.mjs — o linter e o gate passariam`
          + ' a cobrar limiares diferentes, e o §7.2 manda o linter vencer, o que tornaria a'
          + ' divergencia invisivel. Regere com: node ferramentas/gerar-config-lint.mjs');
      }
      return achados;
    },
  },
  {
    /**
     * O análogo de `env-declarado` para a FIAÇÃO, e nos DOIS sentidos.
     *
     * O sentido "usada e não declarada" é o buraco que motivou o manifesto de raiz: até aqui o
     * `.env.example` da raiz era montado só com `modulo.json:envRequerido`, então o `JWT_SECRET` do
     * `resolverAuth()` e o `DATABASE_URL` do adapter real nasciam ÓRFÃOS — o segredo mais sensível
     * do sistema era o único que ninguém declarava.
     *
     * O sentido inverso entra porque a declaração tem consequência: chave declarada vai para o
     * `.env.example` e vira valor exigido do operador. Declarada e sem leitor, ela pede um segredo
     * que nada consome — e é exatamente o vício que esta base já pagou caro com `ui`,
     * `exportaResumo` e `geraArtefato`.
     *
     * O `.env.example` em si NÃO é cobrado aqui: `sincronizar-env.mjs --conferir` já o compara com
     * os manifestos, e roda no `verificar` dos três bindings. Duplicar isso em regra daria duas
     * mensagens para um conserto só.
     */
    id: 'env-raiz-declarado',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      const declaradas = projeto.manifesto.valor?.envRequerido;
      // Manifesto ausente, quebrado ou com `envRequerido` de outro tipo ja e do `manifesto-raiz` —
      // empilhar aqui daria duas mensagens para um conserto so.
      if (!Array.isArray(declaradas)) return [];

      const usadas = new Set();
      for (const arquivo of projeto.codigo) {
        for (const achado of arquivo.conteudo.matchAll(CHAVE_DE_RAIZ)) usadas.add(achado[0]);
      }

      const achados = [...usadas]
        .filter((chave) => !declaradas.includes(chave))
        .map((chave) => `env "${chave}" usada no codigo da raiz e ausente de projeto.json:envRequerido`);
      for (const chave of declaradas) {
        if (usadas.has(chave)) continue;
        achados.push(`env "${chave}" declarada em projeto.json e nunca usada em adapters/, src/ nem`
          + ' packages/ — ela entra no .env.example e passa a exigir um valor que nada le');
      }
      return achados;
    },
  },
  {
    /**
     * O gêmeo de `hardcode-url` na fiação — a MESMA `URL_LITERAL`, outro território.
     *
     * O adapter é onde o endereço do fornecedor de verdade aparece (`https://x.supabase.co`), e até
     * a I.1 nenhuma regra o enxergava. A única diferença em relação ao módulo é para onde a
     * mensagem aponta: no módulo, `.env` ou `config/`; aqui, `projeto.json:envRequerido`, que é
     * onde a raiz declara o que exige do ambiente.
     */
    id: 'hardcode-url-raiz',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      return varrerRaiz(projeto, (texto) => {
        const casado = texto.match(URL_LITERAL);
        if (casado === null) return null;
        return `URL literal ${casado[0]} na fiacao — endereco de infraestrutura vem do ambiente:`
          + ' declare a chave em projeto.json:envRequerido e leia-a aqui';
      });
    },
  },
  {
    /**
     * O gêmeo de `fallback-silencioso` na fiação — a MESMA `PADROES_DE_FALLBACK`.
     *
     * O defeito é idêntico e a consequência é pior: o que a raiz lê do ambiente é o segredo do
     * sistema, e um default embutido não "ajuda no desenvolvimento" — ele VIRA o valor de produção
     * no dia em que a chave falta, calado, com o boot subindo normalmente.
     *
     * Não briga com `env-raiz-declarado` (I.1): aquela cobra a chave USADA e não declarada, e não
     * proíbe a leitura. Ler `process.env` é o ofício de `src/composicao` — é o inverso do que
     * `env-fora-do-carregador` cobra no módulo. O que esta regra proíbe é o DEFAULT, nunca a leitura.
     */
    id: 'fallback-raiz',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      return varrerRaiz(projeto, (texto) => {
        if (!PADROES_DE_FALLBACK.some((padrao) => padrao.test(texto))) return null;
        return 'fallback de env na fiacao — falta de config tem de DERRUBAR o boot. O que a raiz le'
          + ' do ambiente e o segredo do sistema, e um default embutido vira o valor de producao no'
          + ' dia em que a chave falta, sem ninguem perceber';
      });
    },
  },
  {
    id: 'env-fora-do-carregador',
    nivel: 'aviso',
    escopo: 'modulo',
    verificar(ctx) {
      return ctx.codigo
        .filter((a) => !a.eTeste && !ehCarregador(a.rel))
        .filter((a) => /process\.env|os\.environ|os\.getenv/.test(a.conteudo))
        .map((a) => `${a.rel}: le env fora do carregador — so api/src/config.* toca o ambiente`);
    },
  },
];
