/**
 * regras/contrato.mjs — família "Contrato" do catálogo (specs/arquitetura/04-regras.md §4.5).
 * ids: contrato, rota-nomenclatura, contrato-sincronizado, projecao-contrato, payload-camelcase,
 *      saida-sensivel, sensivel-em-saida, resumo-exportado, saida-crua
 *
 * O `contrato/openapi.yaml` é a FONTE. Estas regras existem para que ele não seja ficção: o que
 * está na spec existe no código, o que está no código existe na spec, e nada sensível vaza.
 *
 * A leitura da spec mora em `../spec.mjs`, compartilhada com `consome-contrato` (Isolamento).
 */
import {
  leiturasFalhas, normalizar, propriedadesDaResposta, rotasDaSpec, servidorDaSpec, specDe,
} from '../spec.mjs';

const OBRIGATORIAS = ['/health', '/meta', '/resumo'];

/**
 * A forma que o leitor de bloco aceita, por seção. É o que falta numa mensagem que só diz
 * "não verifiquei": o autor precisa saber o que editar, e citar só *flow style* manda quem já
 * está em bloco refazer o que já fez.
 */
const FORMA_ACEITA = {
  paths: 'em "paths:", cada rota e uma chave de recuo EXATAMENTE 2 na propria linha '
    + '("  /registros:") e cada metodo, uma chave de recuo EXATAMENTE 4 ("    get:") — recuo '
    + 'diferente disso e bloco valido que o leitor nao alcanca',
  servers: 'em "servers:", o PRIMEIRO item declara "url:" — na linha do traco '
    + '("  - url: /api/v1/<modulo>") ou em qualquer outra linha do mesmo item; aspas simples ou '
    + 'duplas sao aceitas',
};

/**
 * A mensagem de spec ilegível, e o único lugar que a escreve. Dona: a regra `contrato`.
 *
 * Nomeia a seção que falhou, e não uma causa: a detecção é agnóstica de propósito, e a mensagem
 * tem de ser fiel a isso. *Flow style* entra como a causa mais provável, não como a única —
 * `paths:` indentado com 4 espaços é bloco válido e chega aqui pelo mesmo caminho, e o autor que
 * lesse "reescreva em bloco" ficaria sem saída, exatamente o que esta mensagem existe para evitar.
 */
function mensagemIlegivel(falhas) {
  return `contrato/openapi.yaml presente mas ILEGIVEL para o gate: a leitura de "${falhas.join(':" e "')}:" `
    + 'nao extraiu nada. O gate le YAML em BLOCO, sem dependencia externa — e o que permite ele viajar '
    + 'com o modulo extraido e rodar sem instalar nada. A causa mais comum e flow style ({...} numa linha '
    + `so), mas nao e a unica. O leitor aceita assim: ${falhas.map((f) => FORMA_ACEITA[f]).join('; ')}.`;
}

/**
 * Verbos que não podem ser SEGMENTO de path — a ação é o método HTTP (02-contrato-e-dados §2).
 * Inline como `SDKS_FORNECEDOR`: é vocabulário NORMATIVO fechado, parte da regra, não tunable de
 * projeto — mudá-lo é mudar a lei, e a lei não mora em config.
 *
 * Critério de inclusão: a palavra nomeia uma AÇÃO que o método HTTP já expressa. Substantivo de
 * recurso fica de fora, mesmo quando parece verbo — por isso `busca`, `lista` e `resumo` não
 * estão aqui, e `buscar`, `listar` estão. Os dois idiomas entram porque a doutrina manda rota em
 * português (§3.1 "Idioma") e a comparação é por segmento inteiro, nunca substring.
 */
const VERBOS_PROIBIDOS = new Set([
  // inglês
  'get', 'post', 'put', 'patch', 'delete', 'create', 'update', 'remove', 'list',
  'fetch', 'find', 'search', 'add', 'edit', 'new', 'save', 'send',
  // português
  'criar', 'atualizar', 'remover', 'deletar', 'apagar', 'excluir', 'listar', 'buscar',
  'procurar', 'pesquisar', 'adicionar', 'editar', 'novo', 'nova', 'obter', 'consultar',
  'salvar', 'gravar', 'alterar', 'cadastrar', 'inserir', 'enviar', 'gerar',
]);

/** Rotas registradas no código, em qualquer binding. Normaliza `:hash` e `{hash}` para `{}`. */
function rotasDoCodigo(ctx) {
  const padroes = [
    /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /@\w*router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
  ];
  const rotas = new Set();
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !/^api\//.test(arquivo.rel)) continue;
    for (const padrao of padroes) {
      for (const achado of arquivo.conteudo.matchAll(padrao)) rotas.add(normalizar(achado[2]));
    }
  }
  return rotas;
}

/** Recorta um bloco YAML por nome de chave, devolvendo o texto indentado sob ela. */
function blocoDe(yaml, padraoChave) {
  const trechos = [];
  let dentro = false;
  let recuoBase = 0;

  for (const linha of yaml.split(/\r?\n/)) {
    const recuo = linha.length - linha.trimStart().length;
    if (padraoChave.test(linha)) {
      dentro = true;
      recuoBase = recuo;
      continue;
    }
    if (dentro && linha.trim() !== '' && recuo <= recuoBase) dentro = false;
    if (dentro) trechos.push(linha);
  }
  return trechos.join('\n');
}

/**
 * Texto de tudo que sai numa RESPOSTA — incluindo os schemas de `components` alcançados por
 * `$ref` de dentro de `responses:`. Sem seguir o `$ref`, um campo sensível descrito num schema
 * compartilhado passava despercebido, que é o caso mais comum num contrato bem escrito.
 */
function trechosDeResposta(yaml) {
  const direto = blocoDe(yaml, /^\s*responses:\s*$/);
  const componentes = blocoDe(yaml, /^\s*schemas:\s*$/);
  const referenciados = new Set(
    [...direto.matchAll(/#\/components\/schemas\/(\w+)/g)].map((achado) => achado[1]),
  );

  const partes = [direto];
  for (const nome of referenciados) {
    partes.push(blocoDe(componentes, new RegExp(`^\\s*${nome}:\\s*$`)));
  }
  return partes.join('\n');
}

/**
 * Nomes de propriedade declarados em schema de RESPOSTA — as chaves filhas de cada `properties:`.
 *
 * Reusa `trechosDeResposta`, então schema de REQUISIÇÃO fica de fora de graça: `NovoRegistro` é
 * alcançado por `$ref` de dentro de `requestBody:`, nunca de `responses:`, e não entra no texto.
 *
 * A pilha de recuos existe para o aninhamento (`Erro.erro.codigo`): sem ela, entrar num
 * `properties:` interno perdia o escopo externo, e propriedade legítima ficava fora do conjunto —
 * o que viraria falso positivo, a direção de erro que esta regra não pode ter.
 */
function propriedadesDeResposta(yaml) {
  const nomes = new Set();
  const pilha = [];

  for (const linha of trechosDeResposta(yaml).split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    const recuo = linha.length - linha.trimStart().length;
    while (pilha.length > 0 && recuo <= pilha[pilha.length - 1]) pilha.pop();
    const chave = linha.match(/^\s*([A-Za-z_]\w*)\s*:/);
    if (chave !== null && pilha.length > 0 && recuo === pilha[pilha.length - 1] + 2) {
      nomes.add(chave[1]);
    }
    if (/^\s*properties:\s*$/.test(linha)) pilha.push(recuo);
  }
  return nomes;
}

/** `servers[0].url` da spec confere com o `rotaBase` do manifesto. */
function conferirServidor(ctx, yaml) {
  const esperado = ctx.manifesto?.rotaBase ?? null;
  // Manifesto ausente ou sem rotaBase e do `manifesto`/`schema-manifesto` — nao acusamos duas vezes.
  if (esperado === null) return [];
  const declarado = servidorDaSpec(yaml);
  if (declarado === null) return ['contrato/openapi.yaml nao declara servers[0].url — o prefixo do modulo fica implicito'];
  if (declarado !== esperado) {
    return [`contrato/openapi.yaml: servers[0].url "${declarado}" diverge do rotaBase "${esperado}" do manifesto`];
  }
  return [];
}

/**
 * O verbo do segmento, ou `null`. Compara **palavra inteira** do kebab, nunca substring: por isso
 * `criar-item` e `listar-registros` caem (a palavra `criar` é um token), e `postagens` e
 * `novidades` NÃO caem (`post` e `new` não são token nenhum ali). Substring pegaria os dois.
 */
function verboNoSegmento(segmento) {
  return segmento.toLowerCase().split('-').find((palavra) => VERBOS_PROIBIDOS.has(palavra)) ?? null;
}

/** Cada segmento de um path: verbo proibido, kebab-case, e camelCase dentro de `{}`. */
function conferirSegmentos(rota) {
  const achados = [];
  for (const segmento of rota.split('/').filter((s) => s !== '')) {
    const parametro = segmento.match(/^\{(.*)\}$/);
    const verbo = parametro === null ? verboNoSegmento(segmento) : null;
    if (parametro !== null && !/^[a-z][A-Za-z0-9]*$/.test(parametro[1])) {
      achados.push(`rota "${rota}": parametro "{${parametro[1]}}" nao e camelCase`);
    } else if (verbo !== null) {
      achados.push(`rota "${rota}": segmento "${segmento}" carrega o verbo "${verbo}" — a acao e o metodo HTTP, nao o path`);
    } else if (parametro === null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segmento)) {
      achados.push(`rota "${rota}": segmento "${segmento}" nao e kebab-case minusculo`);
    }
  }
  return achados;
}

/** Janela entre o nome da projeção e a `{` que a abre — assinatura, tipos, docstring. */
const JANELA_ATE_ABERTURA = 900;

/**
 * Fim (exclusivo) do trecho que abre em `inicio`, contando profundidade de chaves.
 * `-1` quando o texto acaba sem fechar.
 */
function fimBalanceado(texto, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidade += 1;
    else if (texto[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * O texto de cada projeção, delimitado por BALANCEAMENTO de chaves.
 *
 * Balancear, e não casar um terminador por regex, é o que mata a classe inteira de erro: o fim do
 * trecho passa a ser o fim REAL do objeto, e não "a próxima linha que termina em `}`". Enquanto o
 * regex exigia `\n\s*\}`, uma projeção que fechava na mesma linha (arrow de uma linha) não achava
 * terminador ali e a captura ATRAVESSAVA a função seguinte, colhendo chaves que nunca são
 * publicadas — falso positivo em `projecao-contrato` e em `sensivel-em-saida`, sobre código
 * correto. Agora não depende de como o autor quebrou a linha.
 */
function regioesDeProjecao(conteudo) {
  const regioes = [];
  // matchAll, nao match: um mapeador tem mais de uma projecao (resumo e detalhe, por exemplo),
  // e olhar so a primeira deixava as demais sem verificacao nenhuma.
  for (const nome of conteudo.matchAll(/(?:paraContrato|para_contrato)\w*/g)) {
    const abertura = conteudo.indexOf('{', nome.index);
    if (abertura === -1 || abertura - nome.index > JANELA_ATE_ABERTURA) continue;
    const fim = fimBalanceado(conteudo, abertura);
    if (fim !== -1) regioes.push(conteudo.slice(abertura, fim));
  }
  return regioes;
}

/** Chaves de objeto literal devolvidas pela projeção de saída do mapeador. */
function chavesDaProjecao(ctx) {
  const chaves = [];
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !/mapeador/i.test(arquivo.rel)) continue;
    for (const regiao of regioesDeProjecao(arquivo.conteudo)) {
      // Chave apos `{` ou `,` — nao apenas no inicio da linha. Objeto escrito numa linha so
      // (`{ hash: x, criado_em: y }`) escapava inteiro quando a extracao exigia inicio de linha.
      // A regiao COMECA na `{`, entao a primeira chave tem o mesmo delimitador que as demais.
      for (const achado of regiao.matchAll(/[{,]\s*["']?([A-Za-z_]\w*)["']?\s*:/g)) {
        chaves.push({ chave: achado[1], arquivo: arquivo.rel });
      }
    }
  }
  return chaves;
}

/**
 * Chaves projetadas que nenhum schema de resposta declara. UMA direção só, de propósito.
 *
 * A inversa (propriedade declarada e nunca projetada) parece simétrica e não é: `/health`,
 * `/meta` e `/resumo` são montadas pela própria `api/`, e o schema `Erro` pelo tratador de erro —
 * nenhum deles passa pelo mapeador. Cobrá-la daria falso positivo garantido nos três moldes.
 */
function divergenciasDaProjecao(projetadas, declaradas) {
  const vistos = new Set();
  const achados = [];
  for (const { chave, arquivo } of projetadas) {
    // Chave fora de camelCase e do `payload-camelcase`. Ela JAMAIS estara no contrato (que fala
    // camelCase por regra), entao acusa-la aqui daria dois erros para um defeito so — e o segundo
    // apontaria para o conserto errado ("declare no contrato" em vez de "renomeie o campo").
    if (!/^[a-z][A-Za-z0-9]*$/.test(chave)) continue;
    if (declaradas.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    achados.push(`${arquivo}: campo "${chave}" e projetado na saida e NAO esta declarado em nenhum schema de RESPOSTA do openapi.yaml`);
  }
  return achados;
}

export default [
  {
    id: 'contrato',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      if (spec === null) return ['contrato/openapi.yaml ausente'];
      // DONA de "spec ilegivel": esta regra ja e a dona de o contrato existir e servir de fonte.
      // Ilegivel e da mesma classe que ausente — o arquivo esta la e nao pode ser usado.
      // UMA mensagem mesmo quando as duas leituras falham: e um defeito so, com um conserto so.
      const falhas = leiturasFalhas(spec.conteudo);
      if (falhas.length > 0) return [mensagemIlegivel(falhas)];
      return OBRIGATORIAS
        .filter((rota) => !spec.conteudo.includes(`${rota}:`))
        .map((rota) => `contrato/openapi.yaml nao declara a rota obrigatoria "${rota}"`);
    },
  },
  {
    id: 'rota-nomenclatura',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU ilegivel e do `contrato`; acusar aqui tambem so duplica o mesmo defeito.
      if (spec === null) return [];

      // Silencio SEPARADO por secao: `servers:` ilegivel nao cega a checagem de nome das rotas,
      // que so depende de `paths:`. Silenciar as duas juntas jogaria fora verificacao que da para
      // fazer — e o gate so deve deixar de verificar o que realmente nao conseguiu ler.
      const falhas = leiturasFalhas(spec.conteudo);
      const achados = falhas.includes('servers') ? [] : conferirServidor(ctx, spec.conteudo);
      if (falhas.includes('paths')) return achados;
      return achados.concat([...rotasDaSpec(spec.conteudo)].flatMap(conferirSegmentos));
    },
  },
  {
    id: 'contrato-sincronizado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contrato`. Sem este silencio, uma spec que o
      // leitor nao alcanca faria esta regra AFIRMAR que toda rota do codigo falta no contrato —
      // falsidade, nao cegueira. So `paths:` importa aqui: `servers:` nao entra na comparacao.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];
      const naSpec = new Set([...rotasDaSpec(spec.conteudo)].map(normalizar));
      const noCodigo = rotasDoCodigo(ctx);

      // Nao achar rota nenhuma nao e conformidade — e cegueira. Dizer isso em voz alta e o que
      // impede a regra de "passar" num framework cujo registro de rota ela nao sabe ler.
      if (noCodigo.size === 0) {
        const temApi = ctx.codigo.some((a) => !a.eTeste && /^api\//.test(a.rel));
        return temApi
          ? ['nao foi possivel extrair rota do codigo — esta regra NAO verificou nada neste modulo']
          : [];
      }

      const achados = [];
      for (const rota of noCodigo) {
        if (!naSpec.has(rota)) achados.push(`rota "${rota}" existe no codigo e NAO no contrato/openapi.yaml`);
      }
      for (const rota of naSpec) {
        if (!noCodigo.has(rota)) achados.push(`rota "${rota}" existe no contrato/openapi.yaml e NAO no codigo`);
      }
      return achados;
    },
  },
  {
    id: 'projecao-contrato',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contrato`; acusar aqui so duplica o defeito.
      // Sem isto, spec que o leitor nao alcanca zera `declaradas` e a regra acusaria TODO campo
      // projetado. Os schemas de resposta vivem dentro de `paths:`; `servers:` nao afeta isto.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];

      const projetadas = chavesDaProjecao(ctx);
      const temMapeador = ctx.codigo.some((a) => !a.eTeste && /mapeador/i.test(a.rel));
      if (projetadas.length === 0) {
        return temMapeador
          ? ['nao foi possivel extrair projecao do mapeador — esta regra NAO verificou nada neste modulo']
          : [];
      }

      const declaradas = propriedadesDeResposta(spec.conteudo);
      if (declaradas.size === 0) {
        return ['nao foi possivel extrair propriedade de schema de RESPOSTA do openapi.yaml — esta regra NAO verificou nada neste modulo'];
      }
      return divergenciasDaProjecao(projetadas, declaradas);
    },
  },
  {
    id: 'payload-camelcase',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const { chave, arquivo } of chavesDaProjecao(ctx)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(chave)) {
          achados.push(`${arquivo}: campo "${chave}" na projecao nao e camelCase — o contrato fala camelCase`);
        }
      }
      const spec = specDe(ctx);
      if (spec === null) return achados;
      for (const achado of trechosDeResposta(spec.conteudo).matchAll(/^\s{6,}([a-z_][\w]*)\s*:\s*\{\s*type:/gm)) {
        if (/_/.test(achado[1])) {
          achados.push(`contrato/openapi.yaml: propriedade de resposta "${achado[1]}" em snake_case — use camelCase`);
        }
      }
      return achados;
    },
  },
  {
    id: 'saida-sensivel',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const sensiveis = ctx.manifesto?.camposSensiveis ?? [];
      const spec = specDe(ctx);
      if (sensiveis.length === 0 || spec === null) return [];
      const resposta = trechosDeResposta(spec.conteudo);
      return sensiveis
        .filter((campo) => new RegExp(`\\b${campo}\\b`).test(resposta))
        .map((campo) => `campo sensivel "${campo}" aparece em schema de RESPOSTA do openapi.yaml`);
    },
  },
  {
    id: 'sensivel-em-saida',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const sensiveis = new Set(ctx.manifesto?.camposSensiveis ?? []);
      if (sensiveis.size === 0) return [];
      const achados = [];

      for (const { chave, arquivo } of chavesDaProjecao(ctx)) {
        if (sensiveis.has(chave)) {
          achados.push(`${arquivo}: campo sensivel "${chave}" na projecao de saida — mantenha fora, ou publique mascarado`);
        }
      }
      // O logger REDIGE por nome; citar o campo direto numa chamada de log burla a redacao.
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (!/\b(logger|log)\.(debug|info|warn|error)\(/.test(texto)) continue;
          for (const campo of sensiveis) {
            if (new RegExp(`\\b${campo}\\b`).test(texto)) {
              achados.push(`${arquivo.rel}:${numero}: campo sensivel "${campo}" citado em chamada de log`);
            }
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'resumo-exportado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // UMA direcao so, como `projecao-contrato`: `false` nao proibe nada. O modulo que nao entra
      // no dashboard pode ter `total` no `/resumo` dele sem que isso seja defeito de coisa alguma.
      if (ctx.manifesto?.exportaResumo !== true) return [];

      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contrato`. Sem este silencio, "nao consegui ler"
      // viraria "nao declara" — afirmar ausencia do que nao se leu manda apagar o que esta certo.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];

      const declaradas = propriedadesDaResposta(spec.conteudo, '/resumo', 'get', '200');
      // `/resumo` ausente da spec e do `contrato`, que ja a cobra como rota obrigatoria.
      if (declaradas === null || declaradas.has('total')) return [];
      return ['exportaResumo: true mas o schema 200 de GET /resumo nao declara "total" — o agregador '
        + 'cross-modulo compoe SEM lista fixa e so conhece a forma minima; sem ela, agregar exigiria '
        + 'um caso por modulo dentro do conector. Declare "total" (inteiro) na resposta de /resumo, '
        + 'ou exportaResumo: false'];
    },
  },
  {
    id: 'entrada-allowlist',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // A simetrica da `saida-crua`, na direcao da ENTRADA (02-contrato-e-dados §3.2: "allowlist de
      // campos — payload com campo desconhecido e rejeitado, nao ignorado").
      //
      // NAO proibe o corpo de ser passado adiante: o molde faz `criar(req.body as unknown, ...)`, e
      // a funcao chamada e justamente quem aplica a allowlist. Proibir a passagem acusaria o codigo
      // CORRETO. O que se proibe e o corpo virar entidade sem passar por ninguem — as tres formas
      // em que isso acontece.
      const padroes = [
        // 1. Espalhar o corpo dentro de um objeto/entidade: `{ ...req.body }`, `{**corpo}`.
        /\{\s*\*{2}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b|\.{3}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
        // 2. Corpo direto ao repositorio: `repositorio.inserir(req.body)`.
        /\b(?:repositorio|repository|repo)\.\w+\(\s*(?:req(?:uest)?\.)?(?:body|corpo)\s*[,)]/,
        // 3. Atribuicao em massa sobre uma entidade ja existente.
        /Object\.assign\([^,)]+,\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
      ];
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (padroes.some((padrao) => padrao.test(texto))) {
            achados.push(`${arquivo.rel}:${numero}: corpo da requisicao vira entidade sem allowlist`
              + ' — monte a entrada campo a campo, e rejeite campo desconhecido em vez de ignora-lo');
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'saida-crua',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // `linha`/`row` sao os nomes do lado do BANCO no mapeador — devolve-los e vazamento direto.
      // `registro` e o tipo de DOMINIO: circula entre camadas legitimamente e so vira resposta
      // depois da projecao, entao so acusamos quando ele vai cru para o corpo da resposta.
      const padrao = /\.json\(\s*(registro|registros|linha|linhas|row|rows|dados)\s*\)|return\s+(linha|linhas|row|rows)\s*$/;
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (padrao.test(texto)) {
            achados.push(`${arquivo.rel}:${numero}: devolve registro cru — monte a saida no mapeador, por allowlist`);
          }
        }
      }
      return achados;
    },
  },
];
