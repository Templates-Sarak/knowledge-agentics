/**
 * regras/configuracao.mjs — família "Configuração e ambiente" (specs/arquitetura/04-regras.md §4.4).
 * ids: config-valida, schema-config, config-morta, hardcode-url, hardcode-numero,
 *      fallback-silencioso, cors-aberto, env-declarado, env-exemplo, env-modulo,
 *      env-fora-do-carregador, verificacao-declarada, lint-derivado
 *
 * As duas últimas são sobre o PROJETO, não sobre o módulo, e mesmo assim têm `escopo: 'modulo'` —
 * de propósito. `escopo` diz o que a regra precisa VER, e elas precisam de UM contexto qualquer
 * (todos carregam a mesma `ctx.projeto`), não de todos. Torná-las globais não mudaria uma linha do
 * resultado e ainda exigiria a forma `{ modulo, mensagem }`, porque `analisar` descarta achado
 * global cujo módulo não esteja entre os selecionados.
 */
import { carregarEsquema, validar } from '../esquema.mjs';
// Vocabulário de credencial: UMA lista, a do `gateway-credencial`. As duas regras fazem a mesma
// pergunta sobre a mesma chave por ângulos diferentes — duas listas divergiriam no primeiro sufixo
// novo que alguém acrescentasse de um lado só.
import { PADRAO_CREDENCIAL } from './operacao.mjs';
// A MESMA função que o `--conferir` do gerador usa. Importar (e não reimplementar) é o que impede
// a regra e o gerador de divergirem — o defeito que o gerador existe para eliminar, um nível acima.
import { BINDINGS, saidaDe } from '../../gerar-config-lint.mjs';

const CONFIGS = ['api', 'dominio', 'seguranca', 'portas', 'textos'];
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
          const casado = texto.match(/["'`]https?:\/\/[^"'`]+["'`]/);
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
      const padroes = [
        /process\.env\[[^\]]+\]\s*(\?\?|\|\|)\s*['"`]/,
        /process\.env\.\w+\s*(\?\?|\|\|)\s*['"`]/,
        /getenv\([^)]*,\s*['"]/,
        /environ\.get\([^)]*,\s*['"]/,
      ];
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (padroes.some((padrao) => padrao.test(texto))) {
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
    escopo: 'modulo',
    verificar(ctx) {
      // Mesma guarda das outras duas regras de projeto: modulo solto nao tem `.gitignore` de
      // projeto, e cobrar um dele seria falso positivo garantido.
      if (!ctx.projeto.ehProjeto) return [];
      if (ctx.projeto.gitignore === null) {
        return ['.gitignore ausente na raiz do projeto — o .env real ficaria versionavel'];
      }
      const padroes = padroesDeIgnore(ctx.projeto.gitignore);
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
    escopo: 'modulo',
    verificar(ctx) {
      // Modulo solto (extraido e ainda nao religado a um esqueleto) ou fixture nao e projeto —
      // cobrar politica de projeto de quem nao tem `modulos/` seria falso positivo garantido.
      if (!ctx.projeto.ehProjeto) return [];
      const { presente, valor } = ctx.projeto.verificacao;
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
    escopo: 'modulo',
    verificar(ctx) {
      if (!ctx.projeto.ehProjeto) return [];

      // A pergunta e "o que esta na raiz e ALGUMA saida do gerador?", e NAO "bate com o binding
      // deste modulo". A config de lint e do PROJETO, e o binding do modulo e outro fato: um modulo
      // escafoldado com o binding errado faria esta regra pedir `eslint.config.js` num projeto
      // Python — mandando consertar a config quando o defeito e o manifesto do modulo. Mensagem que
      // aponta o conserto errado e pior que mensagem nenhuma.
      const derivadas = BINDINGS.map((binding) => saidaDe(binding));
      const naRaiz = Object.entries(ctx.projeto.configsDeLint).filter(([, texto]) => texto !== null);
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
