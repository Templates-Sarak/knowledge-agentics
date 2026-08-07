/**
 * regras/isolamento.mjs — família "Isolamento" do catálogo (specs/arquitetura/04-regras.md §4.2).
 * ids: import-lateral, import-adapter, sdk-fornecedor, gateway-http, gateway-declarado,
 *      consome-ciclo, consome-contrato, ui-kit, ui-token,
 *      portas-pura, adapter-isolado, composicao-descoberta
 *
 * É a família que sustenta a extraibilidade. Se ela passa, o módulo sai da pasta sem refactor.
 *
 * As TRÊS últimas são de escopo `raiz` e olham a **fiação**, não o módulo. Estão nesta família
 * porque a pergunta é a mesma — quem pode depender de quem —, só que na direção que faltava:
 * `import-lateral` e `import-adapter` cobram o módulo, e até aqui ninguém cobrava a raiz.
 *
 * O `ui.modo` do manifesto tem duas cláusulas (01-modulo.md §7) e só UMA delas ganha regra própria:
 * a do modo `proprio` ("proibido importar componente de outro módulo") **é** a `import-lateral`
 * inteira — o import de `@<escopo>/<vizinho>` e o caminho relativo que sai da pasta. Escrever uma
 * segunda regra para ela daria duas mensagens e um conserto só.
 */
import { leiturasFalhas, normalizar, operacoesDaSpec, specDe } from '../spec.mjs';
// `gatewaysDe` e a derivacao dos gateways REAIS pelo nome do arquivo, sem os barris. UMA
// implementacao, compartilhada com `testes-gateway` (§4.1) — as duas pontas do mesmo triangulo.
import { gatewaysDe, temArquivoEm } from './estrutura.mjs';
// Vocabulario de SQL: UMA lista, a de `sql-concatenado`. Aqui ela e COMPOSTA com o vocabulario de
// conexao — a pergunta e "este gateway fala com banco?", nao "esta linha e SQL?" —, e e essa
// composicao que permite as duas regras compartilharem os verbos sem compartilharem o recorte.
import { SQL_FONTE } from './operacao.mjs';
// O texto sem comentario nem docstring. Mora em `../texto.mjs` porque CINCO familias o usam, e
// porque de dentro de `regras/` ele fechava um ciclo com `operacao.mjs` (ver o cabecalho de la).
import { textoDeCodigo } from '../texto.mjs';

const SDKS_FORNECEDOR = [
  '@supabase/', 'pg', 'mysql', 'mysql2', 'aws-sdk', '@aws-sdk/', 'firebase',
  'firebase-admin', 'oracledb', 'mongodb', 'mongoose', 'openai', 'redis', 'ioredis',
  'psycopg2', 'boto3', 'sqlalchemy', 'pymongo',
];

/**
 * Bibliotecas de UI BRUTAS — exatamente o que `packages/ui-kit` existe para envolver, sendo ele o
 * "ponto único de contato com a biblioteca de UI" (00-arquitetura.md §3.3). Inline como
 * `SDKS_FORNECEDOR`, e pelo mesmo argumento: é vocabulário NORMATIVO fechado, parte da regra e não
 * tunable de projeto — mudá-lo é mudar a lei, e a lei não mora em config.
 *
 * Critério de inclusão: o pacote RENDERIZA componente ou ESTILIZA. `react`, `vue` e afins ficam de
 * fora de propósito — são o framework em que o próprio kit é escrito, não a biblioteca que ele
 * envolve, e proibi-los tornaria o modo `kit` impossível de cumprir.
 */
const BIBLIOTECAS_DE_UI = [
  '@mui/', '@material-ui/', 'antd', '@ant-design/', 'react-bootstrap', 'bootstrap',
  '@chakra-ui/', '@mantine/', 'primereact', 'primevue', 'semantic-ui-react', '@fluentui/',
  'vuetify', 'element-plus', 'quasar', '@radix-ui/', '@headlessui/',
  'styled-components', '@emotion/',
];

/**
 * Propriedades cujo valor é COR, e as de FONTE. Separadas porque o discriminador de literal é
 * diferente em cada uma: cor tem forma própria (`#hex`, `rgb(`, `hsl(`), fonte só se distingue de
 * um token por estar entre aspas (`fontFamily: 'Inter'` × `fontFamily: tokens.fonte`).
 */
const PROPRIEDADES_DE_COR = [
  'color', 'backgroundColor', 'background-color', 'background', 'borderColor', 'border-color',
  'border', 'outlineColor', 'outline-color', 'outline', 'boxShadow', 'box-shadow', 'fill', 'stroke',
];
const PROPRIEDADES_DE_FONTE = ['fontFamily', 'font-family', 'font'];

/**
 * O recorte que separa DECLARAÇÃO DE ESTILO de ATRIBUTO DE APRESENTAÇÃO, e é ele que elimina — não
 * mitiga — o falso positivo do ícone SVG inline: estilo é sempre `propriedade **:** valor`
 * (`color: '#fff'`, `style="fill:#000"`, template de CSS-in-JS), e atributo é sempre
 * `atributo **=** "valor"` (`<path fill="#000">`). Exigir os dois-pontos deixa o ícone de fora por
 * forma, não por lista de exceção.
 *
 * A janela até o literal não atravessa `;`, `{` nem `}`: é o que permite pegar
 * `border: '1px solid #ccc'` sem escapar da declaração e alcançar um atributo vizinho —
 * `style={{ color: tokens.a }} fill="#000"` para no `}`.
 */
const COR_LITERAL = new RegExp(
  `\\b(?:${PROPRIEDADES_DE_COR.join('|')})\\s*:[^;\\n{}]{0,40}?`
  + '(?:#[0-9a-fA-F]{3,8}\\b|(?:rgba?|hsla?)\\s*\\()',
);
const FONTE_LITERAL = new RegExp(`\\b(?:${PROPRIEDADES_DE_FONTE.join('|')})\\s*:\\s*['"\`]`);

/**
 * Folha de estilo entra na varredura, e não é detalhe: em `ui.modo: "kit"` ela é o lugar MAIS
 * provável de a cor literal aparecer, e `ctx.codigo` é filtrado por extensão de linguagem — um
 * `.css` nunca chegava aqui. A regra ficava limpa exatamente onde o defeito mora.
 *
 * `.module.css` entra por `.css`: `ext` é a última extensão do nome.
 */
const EXT_ESTILO = new Set(['.css', '.scss', '.sass', '.less']);

/**
 * A fonte em folha de estilo precisa de outro discriminador: CSS não usa aspas
 * (`font-family: Inter`), então exigir aspas — o que separa literal de token no JS — deixaria
 * passar a forma mais comum de todas. O que ocupa o lugar do token ali é a VARIÁVEL (`var(--x)`)
 * e as palavras-chave da própria linguagem; qualquer outra coisa é a fonte escrita à mão.
 */
const FONTE_LITERAL_EM_ESTILO = /\b(?:font|font-family)\s*:\s*(?!var\(|inherit|initial|unset|revert)\S/i;

function temLiteralVisual(texto, eEstilo) {
  if (COR_LITERAL.test(texto)) return true;
  return eEstilo ? FONTE_LITERAL_EM_ESTILO.test(texto) : FONTE_LITERAL.test(texto);
}

// Captura o alvo de `import ... from 'X'`, `require('X')`, `import('X')` e `from X import` (Python).
const PADROES_IMPORT = [
  /from\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*(?:from|import)\s+([A-Za-z0-9_.]+)/gm,
];

/**
 * Todos os alvos de import de um arquivo, sem duplicata.
 *
 * `linhasCodigo`, e NUNCA `conteudo` — o mesmo cuidado que `ui-token` e `sensivel-em-saida` já
 * tomam, e pelo mesmo motivo: **a própria lei escrita num comentário viraria violação dela mesma**.
 * Sobre o texto cru, um bloco que só documenta o que não se pode fazer —
 *
 *     // Como NAO fazer:
 *     // import { X } from '@acme/fin';
 *
 * — produzia três acusações de uma vez (`import-lateral`, `import-adapter`, `sdk-fornecedor`) sobre
 * código correto. Falso positivo é a direção de erro que o §7.2 declara que este gate não aceita.
 *
 * O recorte não é total, e o §7.2 registra o resto: `linhasCodigo` tira comentário e docstring, não
 * string. `const exemplo = "import x from '@acme/y'"` continua sendo visto — é código de verdade, e
 * separar literal de instrução exigiria AST.
 *
 * A junção por `\n` preserva o `^` do padrão de import do Python, que é ancorado por linha.
 */
export function importesDe(arquivo) {
  const alvos = new Set();
  for (const padrao of PADROES_IMPORT) {
    for (const achado of textoDeCodigo(arquivo).matchAll(padrao)) alvos.add(achado[1]);
  }
  return [...alvos];
}

/** Um import relativo que sobe acima da raiz do módulo saiu da fronteira. */
function saiDoModulo(arquivoRel, alvo) {
  if (!alvo.startsWith('.')) return false;
  const partes = arquivoRel.split('/').slice(0, -1).concat(alvo.split('/'));
  let profundidade = 0;
  for (const parte of partes) {
    if (parte === '..') profundidade -= 1;
    else if (parte !== '.' && parte !== '') profundidade += 1;
    if (profundidade < 0) return true;
  }
  return false;
}

function ehPacoteDeModulo(alvo, idsVizinhos) {
  const casado = alvo.match(/^@[^/]+\/([^/]+)/);
  if (casado === null) return null;
  const base = casado[1].replace(/-(api|web|core)$/, '');
  return idsVizinhos.includes(base) ? base : null;
}

function raizDoPacote(alvo) {
  if (alvo.startsWith('@')) return alvo.split('/').slice(0, 2).join('/');
  return alvo.split('/')[0].split('.')[0];
}

/**
 * O SDK de fornecedor que este import traz, ou `undefined`. UMA implementação, usada por
 * `sdk-fornecedor` (que o proíbe no módulo) e por `portas-pura` (que o proíbe na interface
 * canônica) — duas leituras da mesma lista, que divergiriam no primeiro driver novo que alguém
 * acrescentasse de um lado só.
 */
function sdkDe(alvo) {
  const raiz = raizDoPacote(alvo);
  return SDKS_FORNECEDOR.find((sdk) => raiz === sdk || alvo.startsWith(sdk));
}

/**
 * As áreas da RAIZ, e a única pergunta que a direção de dependência faz: em qual delas este import
 * cai? `packages/portas/` é distinguido do resto de `packages/` porque é o vértice do diagrama —
 * `modulos/ ──→ packages/portas/ ←── adapters/`.
 */
const AREAS_DA_RAIZ = ['modulos', 'adapters', 'src', 'packages'];

/**
 * Resolve um import relativo contra o arquivo que o escreveu, devolvendo caminho a partir da raiz
 * do projeto. `null` quando o caminho SOBE acima da raiz: ali ele deixou o projeto, e nenhuma área
 * o descreve — afirmar área seria inventar.
 */
function resolverRelativo(arquivoRel, alvo) {
  const pilha = arquivoRel.split('/').slice(0, -1);
  for (const parte of alvo.split('/')) {
    if (parte === '.' || parte === '') continue;
    if (parte !== '..') {
      pilha.push(parte);
      continue;
    }
    if (pilha.length === 0) return null;
    pilha.pop();
  }
  return pilha.join('/');
}

/**
 * A forma de CAMINHO de um import NÃO relativo: Python chega pontilhado (`adapters.memoria`), JS
 * por caminho ou por specifier — a troca de `.` por `/` iguala as duas antes de olhar segmento.
 *
 * Import relativo (`alvo` começa com `.`) sai intacto: o chamador decide o que fazer com ele —
 * `areaDoImport` resolve contra `arquivoRel`, `import-adapter` casa a forma com barra que já
 * cobria `./adapters/x`. Aplicar a troca ali também não muda nada (relativo já usa barra em JS, e
 * dotted-relativo de Python não alcança `adapters/`, que mora fora de qualquer pacote do módulo).
 */
function formaDeCaminho(alvo) {
  return alvo.startsWith('.') ? alvo : alvo.replaceAll('.', '/');
}

/**
 * `import-adapter` casa `adapters/` em duas posições, e a posição MUDA com o tipo de import:
 *
 * NÃO relativo: só no PRIMEIRO segmento. É o que faz `adapters.memoria` (Python, virando
 * `adapters/memoria` via `formaDeCaminho`) apontar para a pasta de topo que `pythonpath=["."]`
 * expõe — e é o que salva `opentelemetry.adapters.wsgi` (`opentelemetry/adapters/wsgi`, primeiro
 * segmento `opentelemetry`) de ser confundido com ela: pacote externo com SUBMÓDULO chamado
 * `adapters` é código correto, e casar em qualquer posição os igualava por acidente de nome.
 *
 * Relativo: em QUALQUER segmento. Caminho relativo é posição de ARQUIVO, não nome de pacote — não
 * há pacote externo para colidir —, e é assim que `../../adapters/memoria/index.js` continua
 * casando não importa a que profundidade o `../` termine.
 */
function importaAdapter(alvo) {
  if (alvo.startsWith('.')) return /(^|\/)adapters?\//.test(alvo);
  return /^adapters?(\/|$)/.test(formaDeCaminho(alvo));
}

/**
 * Em que área do projeto este import cai? `null` = fora dele (stdlib, pacote externo, alias que não
 * dá para resolver) — e `null` NUNCA vira acusação, porque dependência externa é legítima em
 * `adapters/` por desenho.
 *
 * **A distinção que sustenta estas três regras: IMPORT é dependência; leitura de arquivo é
 * descoberta.** Só o que `importesDe` extrai chega aqui, e ele extrai forma de import — nunca
 * `readdirSync(join(raiz, 'modulos'))`. É por isso que `src/composicao.*`, que alcança todos os
 * módulos lendo o `modulo.json` de cada pasta, passa limpo: import amarra em tempo de compilação e mata a
 * substituição; leitura de arquivo é o mecanismo que permite acrescentar módulo sem tocar na
 * composição. Uma regra que procurasse a string `modulos` acusaria o próprio desenho que protege.
 */
function areaDoImport(arquivoRel, alvo) {
  const caminho = alvo.startsWith('.')
    ? resolverRelativo(arquivoRel, alvo)
    : formaDeCaminho(alvo);
  if (caminho === null) return null;
  const [primeiro, segundo] = caminho.split('/');
  if (!AREAS_DA_RAIZ.includes(primeiro)) return null;
  if (primeiro !== 'packages') return primeiro;
  return segundo === 'portas' ? 'packages/portas' : 'packages';
}

/** Todos os imports dos arquivos de uma área da raiz, já com a área do alvo resolvida. */
function importesDaArea(projeto, prefixo) {
  const lista = [];
  for (const arquivo of projeto.codigo) {
    if (!arquivo.rel.startsWith(prefixo)) continue;
    for (const alvo of importesDe(arquivo)) {
      lista.push({ rel: arquivo.rel, alvo, area: areaDoImport(arquivo.rel, alvo) });
    }
  }
  return lista;
}

/**
 * O pacote do kit deste módulo. É AQUI que `ui.pacote` ganha propósito: sem ele, o gate cobra o
 * nome canônico da tabela de nomes (`@<escopo>/ui-kit`, 04-regras.md §3.1); com ele, o projeto que
 * batizou o kit de outro jeito diz qual é, e continua verificável.
 */
function pacoteDoKit(ctx) {
  return ctx.manifesto?.ui?.pacote ?? null;
}

function ehImportDoKit(ctx, alvo) {
  const pacote = pacoteDoKit(ctx);
  if (pacote !== null) return alvo === pacote || alvo.startsWith(`${pacote}/`);
  return /^@[^/]+\/ui-kit(\/|$)/.test(alvo);
}

/**
 * O modo `kit` se aplica a este módulo? Duas guardas, e as duas silenciam por DESENHO.
 *
 * Modo `proprio` não tem regra aqui (ver o cabeçalho). E módulo sem `web/` é o caso ordinário —
 * descartar a tela é permitido (01-modulo.md §2) e é o que o molde Python faz: cobrar tela de quem
 * decidiu não ter uma seria falso positivo garantido.
 */
function modoKitSeAplica(ctx) {
  return ctx.manifesto?.ui?.modo === 'kit' && temArquivoEm(ctx, 'web/');
}

export default [
  {
    id: 'import-lateral',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const ids = contextos.map((c) => c.idPasta);
      const achados = [];
      for (const ctx of contextos) {
        for (const arquivo of ctx.codigo) {
          for (const alvo of importesDe(arquivo)) {
            const vizinho = ehPacoteDeModulo(alvo, ids.filter((id) => id !== ctx.idPasta));
            if (vizinho !== null) {
              achados.push({ modulo: ctx.idPasta, mensagem: `${arquivo.rel}: importa o modulo "${vizinho}" ("${alvo}")` });
            }
            if (saiDoModulo(arquivo.rel, alvo)) {
              achados.push({ modulo: ctx.idPasta, mensagem: `${arquivo.rel}: caminho relativo sai da pasta do modulo ("${alvo}")` });
            }
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'import-adapter',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        // Teste é a raiz de composição dele mesmo: montar o adapter de memória ali é legítimo.
        if (arquivo.eTeste) continue;
        for (const alvo of importesDe(arquivo)) {
          if (importaAdapter(alvo) || /^@[^/]+\/adapter-/.test(alvo)) {
            achados.push(`${arquivo.rel}: importa adapter ("${alvo}") — o adapter e INJETADO, nunca importado`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'sdk-fornecedor',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        for (const alvo of importesDe(arquivo)) {
          if (sdkDe(alvo) !== undefined) {
            achados.push(`${arquivo.rel}: SDK de fornecedor "${alvo}" dentro do modulo — use uma porta`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'gateway-http',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const proibidos = new RegExp(`\\b(${SQL_FONTE}|createClient|new\\s+Pool|\\.query\\()`, 'i');
      return ctx.codigo
        // `textoDeCodigo`, nao `conteudo`: o barril da pasta DOCUMENTA em comentario o que o
        // gateway nao pode fazer, e sobre o texto cru essa documentacao virava a violacao dela mesma.
        .filter((a) => a.rel.startsWith('core/gateways/') && proibidos.test(textoDeCodigo(a)))
        .map((a) => `${a.rel}: gateway fala com banco — gateway e HTTP sobre o contrato do outro modulo`);
    },
  },
  {
    id: 'gateway-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const consumidos = (ctx.manifesto?.consome ?? []).map((c) => c.modulo);
      // A exclusao de barril mora em `gatewaysDe` — ver o import no topo.
      const arquivos = gatewaysDe(ctx);

      const achados = arquivos
        .filter((nome) => !consumidos.includes(nome))
        .map((nome) => `core/gateways/${nome}: sem entrada em modulo.json:consome`);

      return achados.concat(
        consumidos
          .filter((modulo) => !arquivos.includes(modulo))
          .map((modulo) => `consome declara "${modulo}" mas nao existe core/gateways/${modulo}`),
      );
    },
  },
  {
    id: 'consome-contrato',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const donos = new Map(contextos.map((c) => [c.idPasta, c]));
      const achados = [];
      for (const ctx of contextos) {
        for (const entrada of ctx.manifesto?.consome ?? []) {
          const falha = conferirConsumo(donos.get(entrada.modulo) ?? null, entrada);
          if (falha !== null) achados.push({ modulo: ctx.idPasta, mensagem: falha });
        }
      }
      return achados;
    },
  },
  {
    id: 'consome-ciclo',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const grafo = new Map(
        contextos.map((c) => [c.idPasta, (c.manifesto?.consome ?? []).map((x) => x.modulo)]),
      );
      const achados = [];
      for (const inicio of grafo.keys()) {
        const caminho = buscarCiclo(grafo, inicio);
        if (caminho !== null) achados.push({ modulo: inicio, mensagem: `ciclo em consome: ${caminho.join(' -> ')}` });
      }
      return achados;
    },
  },
  {
    id: 'ui-kit',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (!modoKitSeAplica(ctx)) return [];

      // (a) Nenhum arquivo importa a biblioteca BRUTA — o kit e o unico ponto de contato com ela.
      const achados = [];
      for (const arquivo of ctx.codigo) {
        for (const alvo of importesDe(arquivo)) {
          const raiz = raizDoPacote(alvo);
          if (BIBLIOTECAS_DE_UI.some((lib) => raiz === lib || alvo.startsWith(lib))) {
            achados.push(`${arquivo.rel}: importa a biblioteca de UI bruta "${alvo}" — em ui.modo "kit" o unico ponto de contato com ela e o pacote do kit`);
          }
        }
      }

      // (b) Declaracao sem consequencia — a forma exata do `web-declarado`: o manifesto promete uma
      // origem para os componentes visuais e nada em `web/` vai busca-la la.
      const doWeb = ctx.codigo.filter((a) => a.rel.startsWith('web/') && !a.eTeste);
      if (!doWeb.some((a) => importesDe(a).some((alvo) => ehImportDoKit(ctx, alvo)))) {
        const esperado = pacoteDoKit(ctx) ?? '@<escopo>/ui-kit';
        achados.push(`ui.modo "kit" declarado mas nenhum arquivo de web/ importa o kit ("${esperado}") — declaracao sem consequencia; importe o kit em web/, declare o nome dele em ui.pacote, ou volte a ui.modo "proprio"`);
      }
      return achados;
    },
  },
  {
    /**
     * O vértice do diagrama. A porta é a interface CANÔNICA: quem implementa depende dela, e ela
     * não depende de ninguém.
     *
     * "Não depende de nada" tem um recorte, e ele é obrigatório: `packages/portas/__init__.py`
     * importa `dataclasses`, `typing` e `__future__` — é disto que uma interface é feita. Contar
     * biblioteca-padrão acusaria um molde conforme. O que a regra proíbe são as DUAS dependências
     * que destroem a interface: as outras áreas do sistema, e o fornecedor.
     */
    id: 'portas-pura',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      const achados = [];
      for (const { rel, alvo, area } of importesDaArea(projeto, 'packages/portas/')) {
        if (area !== null && area !== 'packages' && area !== 'packages/portas') {
          achados.push(`${rel}: importa de ${area}/ ("${alvo}") — a porta e a interface CANONICA:`
            + ' quem implementa depende DELA, nunca o contrario. Inverta a dependencia');
        }
        // O fornecedor na interface e o pior caso: `sdk-fornecedor` mantem o driver fora de CADA
        // modulo, e um `pg` aqui o devolveria a TODOS de uma vez, pela porta que eles importam.
        const sdk = sdkDe(alvo);
        if (sdk !== undefined) {
          achados.push(`${rel}: SDK de fornecedor "${alvo}" na interface canonica — a porta existe`
            + ' para o modulo NAO conhecer o fornecedor; com o driver aqui, todo modulo que importa'
            + ' a porta passa a conhece-lo. O driver mora em adapters/');
        }
      }
      return achados;
    },
  },
  {
    /**
     * O adapter implementa a porta e não conhece domínio nenhum — é o que o torna substituível e o
     * que permite ao módulo sair da pasta.
     *
     * Dependência EXTERNA aqui é legítima e não é acusada: `adapters/` é exatamente o lugar do
     * `pg`, do `@supabase/*` e do `boto3`. `sdk-fornecedor` proíbe isso no módulo; aqui é o
     * contrário, e proibir inverteria a arquitetura.
     */
    id: 'adapter-isolado',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      const achados = [];
      for (const { rel, alvo, area } of importesDaArea(projeto, 'adapters/')) {
        if (area === 'modulos') {
          achados.push(`${rel}: importa de modulos/ ("${alvo}") — o adapter implementa a PORTA e nao`
            + ' conhece dominio nenhum. No dia em que ele conhece um modulo, o adapter deixa de ser'
            + ' substituivel e o modulo deixa de sair da pasta');
        }
        if (area === 'src') {
          achados.push(`${rel}: importa de src/ ("${alvo}") — a fiacao INSTANCIA o adapter; depender`
            + ' dela inverte a direcao e o adapter deixa de viajar sozinho na extracao');
        }
      }
      return achados;
    },
  },
  {
    /**
     * A composição DESCOBRE os módulos, nunca os importa — e a diferença entre as duas é a regra.
     *
     * `src/composicao` alcança todos os módulos por `readdirSync(modulos/)` + `modulo.json`, e
     * isso é a doutrina funcionando (00-arquitetura.md §3.4). Import é o oposto: fixa a lista em
     * tempo de compilação, e acrescentar um módulo passaria a exigir editar este arquivo.
     *
     * Importar `adapters/` daqui é o OFÍCIO da composição — ela instancia e injeta — e não é
     * acusado. Só `modulos/` é.
     */
    id: 'composicao-descoberta',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      if (!projeto.ehProjeto) return [];
      return importesDaArea(projeto, 'src/')
        .filter(({ area }) => area === 'modulos')
        .map(({ rel, alvo }) => `${rel}: importa de modulos/ ("${alvo}") — a composicao DESCOBRE os`
          + ' modulos lendo modulos/*/modulo.json, nunca por import: o import fixa a lista em tempo'
          + ' de compilacao, e acrescentar um modulo passaria a exigir editar este arquivo');
    },
  },
  {
    id: 'ui-token',
    nivel: 'aviso',
    escopo: 'modulo',
    verificar(ctx) {
      if (!modoKitSeAplica(ctx)) return [];
      const achados = [];
      const daTela = [...ctx.codigo, ...ctx.arquivos.filter((a) => EXT_ESTILO.has(a.ext))];
      for (const arquivo of daTela) {
        if (!arquivo.rel.startsWith('web/') || arquivo.eTeste) continue;
        const eEstilo = EXT_ESTILO.has(arquivo.ext);
        // `linhasCodigo`, nunca `conteudo`: a propria lei escrita num comentario ("nada de #fff
        // aqui") viraria violacao dela mesma. Vale igual em folha de estilo: o extrator descarta
        // `/* ... */`, de uma linha ou de varias, e a linha de continuacao iniciada por `*`.
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (temLiteralVisual(texto, eEstilo)) {
            achados.push(`${arquivo.rel}:${numero}: literal de cor ou fonte em declaracao de estilo — em ui.modo "kit" cor e fonte vem de token do kit`);
          }
        }
      }
      return achados;
    },
  },
];

/**
 * Confere UMA entrada de `consome` contra o contrato do módulo dono. `null` = conforme.
 *
 * Nunca aprova por omissão: dono inexistente e dono sem spec viram achado, e não silêncio. É o
 * §7 aplicado — a regra diz que não conseguiu verificar, em vez de deixar passar.
 */
function conferirConsumo(dono, entrada) {
  const alvo = `"${entrada.contrato}" (modulo dono "${entrada.modulo}")`;
  if (dono === null) return `consome ${alvo}: o modulo dono nao existe em modulos/`;

  const spec = specDe(dono);
  if (spec === null) return `consome ${alvo}: o dono nao tem contrato/openapi.yaml — NAO foi possivel verificar`;

  // `paths:` do DONO ilegivel: o defeito e do dono, e o `contrato` DELE ja o reporta (esta regra
  // e global, entao o dono esta sempre no conjunto analisado). Acusar aqui mandaria o autor do
  // CONSUMIDOR consertar um arquivo que nao e dele — o conserto errado, para a pessoa errada.
  // So `paths:` importa: o contrato consumido e a rota, e o `servers:` do dono nao entra nela.
  if (leiturasFalhas(spec.conteudo).includes('paths')) return null;

  // Forma garantida pelo schema (`^(GET|POST|PATCH|PUT|DELETE) /`); manifesto torto e do
  // `schema-manifesto`, nao desta regra — nao acusamos duas vezes o mesmo defeito.
  const [metodo, caminho] = entrada.contrato.split(/\s+/);
  if (caminho === undefined) return null;

  const operacoes = operacoesDaSpec(spec.conteudo);
  const rota = [...operacoes.keys()].find((r) => normalizar(r) === normalizar(caminho));
  if (rota === undefined) return `consome ${alvo}: o contrato do dono nao declara o caminho "${caminho}"`;

  const metodos = operacoes.get(rota);
  if (metodos.has(metodo)) return null;
  return `consome ${alvo}: o dono declara "${rota}" mas nao o metodo ${metodo} (declara: ${[...metodos].join(', ') || 'nenhum'})`;
}

/** Busca em profundidade a partir de `inicio`, devolvendo o caminho do ciclo que volta a ele. */
function buscarCiclo(grafo, inicio) {
  const pilha = [[inicio, [inicio]]];
  const vistos = new Set();
  while (pilha.length > 0) {
    const [atual, caminho] = pilha.pop();
    for (const vizinho of grafo.get(atual) ?? []) {
      if (vizinho === inicio) return [...caminho, inicio];
      if (vistos.has(vizinho)) continue;
      vistos.add(vizinho);
      pilha.push([vizinho, [...caminho, vizinho]]);
    }
  }
  return null;
}
