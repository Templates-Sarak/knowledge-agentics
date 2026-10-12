/**
 * rules/isolation.mjs — família "Isolamento" do catálogo (specs/arquitetura/04-regras.md §4.2).
 * ids: lateral-import, import-adapter, vendor-sdk, gateway-http, gateway-declared,
 *      consumes-cycle, consumes-contract, ui-kit, ui-token,
 *      pure-ports, isolated-adapter, composition-discovery
 *
 * É a família que sustenta a extraibilidade. Se ela passa, o módulo sai da pasta sem refactor.
 *
 * As TRÊS últimas são de escopo `root` e olham a **fiação**, não o módulo. Estão nesta família
 * porque a pergunta é a mesma — quem pode depender de quem —, só que na direção complementar:
 * `lateral-import` e `import-adapter` cobram o módulo; estas três cobram a raiz.
 *
 * O `ui.mode` do manifesto tem duas cláusulas (01-modulo.md §7) e só UMA delas ganha regra própria:
 * a do modo `own` ("proibido importar componente de outro módulo") **é** a `lateral-import`
 * inteira — o import de `@<escopo>/<vizinho>` e o caminho relativo que sai da pasta. Escrever uma
 * segunda regra para ela daria duas mensagens e um conserto só.
 */
import { failedReads, normalize, specOperations, specOf } from '../spec.mjs';
// `gatewaysOf` e a derivacao dos gateways REAIS pelo nome do arquivo, sem os barris. UMA
// implementacao, compartilhada com `gateway-tests` (§4.1) — as duas pontas do mesmo triangulo.
import { gatewaysOf, hasFileIn } from './structure.mjs';
// Vocabulario de SQL: UMA lista, a de `concatenated-sql`. Aqui ela e COMPOSTA com o vocabulario de
// conexao — a pergunta e "este gateway fala com banco?", nao "esta linha e SQL?" —, e e essa
// composicao que permite as duas regras compartilharem os verbos sem compartilharem o recorte.
import { SQL_SOURCE } from './operation.mjs';
// O texto sem comentario nem docstring. Mora em `../text.mjs` porque CINCO familias o usam, e
// porque de dentro de `rules/` ele fechava um ciclo com `operation.mjs` (ver o cabecalho de la).
import { codeText } from '../text.mjs';

const VENDOR_SDKS = [
  '@supabase/', 'pg', 'mysql', 'mysql2', 'aws-sdk', '@aws-sdk/', 'firebase',
  'firebase-admin', 'oracledb', 'mongodb', 'mongoose', 'openai', 'redis', 'ioredis',
  'psycopg2', 'boto3', 'sqlalchemy', 'pymongo',
];

/**
 * Bibliotecas de UI BRUTAS — exatamente o que `packages/ui-kit` existe para envolver, sendo ele o
 * "ponto único de contato com a biblioteca de UI" (00-arquitetura.md §3.3). Inline como
 * `VENDOR_SDKS`, e pelo mesmo argumento: é vocabulário NORMATIVO fechado, parte da regra e não
 * tunable de projeto — mudá-lo é mudar a lei, e a lei não mora em config.
 *
 * Critério de inclusão: o pacote RENDERIZA componente ou ESTILIZA. `react`, `vue` e afins ficam de
 * fora de propósito — são o framework em que o próprio kit é escrito, não a biblioteca que ele
 * envolve, e proibi-los tornaria o modo `kit` impossível de cumprir.
 */
const UI_LIBRARIES = [
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
const COLOR_PROPERTIES = [
  'color', 'backgroundColor', 'background-color', 'background', 'borderColor', 'border-color',
  'border', 'outlineColor', 'outline-color', 'outline', 'boxShadow', 'box-shadow', 'fill', 'stroke',
];
const SOURCE_PROPERTIES = ['fontFamily', 'font-family', 'font'];

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
const LITERAL_COLOR = new RegExp(
  `\\b(?:${COLOR_PROPERTIES.join('|')})\\s*:[^;\\n{}]{0,40}?`
  + '(?:#[0-9a-fA-F]{3,8}\\b|(?:rgba?|hsla?)\\s*\\()',
);
const LITERAL_SOURCE = new RegExp(`\\b(?:${SOURCE_PROPERTIES.join('|')})\\s*:\\s*['"\`]`);

/**
 * Folha de estilo entra na varredura, e não é detalhe: em `ui.mode: "kit"` ela é o lugar MAIS
 * provável de a cor literal aparecer, e `ctx.codigo` é filtrado por extensão de linguagem — sem
 * esta lista, um `.css` nunca chega aqui, e a regra fica limpa exatamente onde o defeito mora.
 *
 * `.module.css` entra por `.css`: `ext` é a última extensão do nome.
 */
const EXT_STYLE = new Set(['.css', '.scss', '.sass', '.less']);

/**
 * A fonte em folha de estilo precisa de outro discriminador: CSS não usa aspas
 * (`font-family: Inter`), então exigir aspas — o que separa literal de token no JS — deixaria
 * passar a forma mais comum de todas. O que ocupa o lugar do token ali é a VARIÁVEL (`var(--x)`)
 * e as palavras-chave da própria linguagem; qualquer outra coisa é a fonte escrita à mão.
 */
const LITERAL_SOURCE_IN_STYLE = /\b(?:font|font-family)\s*:\s*(?!var\(|inherit|initial|unset|revert)\S/i;

function hasVisualLiteral(text, isStyle) {
  if (LITERAL_COLOR.test(text)) return true;
  return isStyle ? LITERAL_SOURCE_IN_STYLE.test(text) : LITERAL_SOURCE.test(text);
}

// Captura o alvo de `import ... from 'X'`, `require('X')`, `import('X')` e `from X import` (Python).
const IMPORT_PATTERNS = [
  /from\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*(?:from|import)\s+([A-Za-z0-9_.]+)/gm,
];

/**
 * Todos os alvos de import de um arquivo, sem duplicata.
 *
 * `linhasCodigo`, e NUNCA `conteudo` — o mesmo cuidado que `ui-token` e `sensitive-in-output` já
 * tomam, e pelo mesmo motivo: **a própria lei escrita num comentário viraria violação dela mesma**.
 * Sobre o texto cru, um bloco que só documenta o que não se pode fazer —
 *
 *     // Como NAO fazer:
 *     // import { X } from '@acme/fin';
 *
 * — produzia três acusações de uma vez (`lateral-import`, `import-adapter`, `vendor-sdk`) sobre
 * código correto. Falso positivo é a direção de erro que o §7.2 declara que este gate não aceita.
 *
 * O recorte não é total, e o §7.2 registra o resto: `linhasCodigo` tira comentário e docstring, não
 * string. `const exemplo = "import x from '@acme/y'"` continua sendo visto — é código de verdade, e
 * separar literal de instrução exigiria AST.
 *
 * A junção por `\n` preserva o `^` do padrão de import do Python, que é ancorado por linha.
 */
export function importsOf(file) {
  const targets = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const finding of codeText(file).matchAll(pattern)) targets.add(finding[1]);
  }
  return [...targets];
}

/** Um import relativo que sobe acima da raiz do módulo saiu da fronteira. */
function leavesModule(relFile, target) {
  if (!target.startsWith('.')) return false;
  const parts = relFile.split('/').slice(0, -1).concat(target.split('/'));
  let depth = 0;
  for (const part of parts) {
    if (part === '..') depth -= 1;
    else if (part !== '.' && part !== '') depth += 1;
    if (depth < 0) return true;
  }
  return false;
}

function isModulePackage(target, neighborIds) {
  const matched = target.match(/^@[^/]+\/([^/]+)/);
  if (matched === null) return null;
  const base = matched[1].replace(/-(api|web|core)$/, '');
  return neighborIds.includes(base) ? base : null;
}

function packageRoot(target) {
  if (target.startsWith('@')) return target.split('/').slice(0, 2).join('/');
  return target.split('/')[0].split('.')[0];
}

/**
 * O SDK de fornecedor que este import traz, ou `undefined`. UMA implementação, usada por
 * `vendor-sdk` (que o proíbe no módulo) e por `pure-ports` (que o proíbe na interface
 * canônica) — duas leituras da mesma lista, que divergiriam no primeiro driver novo que alguém
 * acrescentasse de um lado só.
 */
function sdkOf(target) {
  const root = packageRoot(target);
  return VENDOR_SDKS.find((sdk) => root === sdk || target.startsWith(sdk));
}

/**
 * As áreas da RAIZ, e a única pergunta que a direção de dependência faz: em qual delas este import
 * cai? `packages/ports/` é distinguido do resto de `packages/` porque é o vértice do diagrama —
 * `modules/ ──→ packages/ports/ ←── adapters/`.
 */
const ROOT_AREAS = ['modules', 'adapters', 'src', 'packages'];

/**
 * Resolve um import relativo contra o arquivo que o escreveu, devolvendo caminho a partir da raiz
 * do projeto. `null` quando o caminho SOBE acima da raiz: ali ele deixou o projeto, e nenhuma área
 * o descreve — afirmar área seria inventar.
 */
function resolveRelative(relFile, target) {
  const stack = relFile.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '.' || part === '') continue;
    if (part !== '..') {
      stack.push(part);
      continue;
    }
    if (stack.length === 0) return null;
    stack.pop();
  }
  return stack.join('/');
}

/**
 * A forma de CAMINHO de um import NÃO relativo: Python chega pontilhado (`adapters.memory`), JS
 * por caminho ou por specifier — a troca de `.` por `/` iguala as duas antes de olhar segmento.
 *
 * Import relativo (`alvo` começa com `.`) sai intacto: o chamador decide o que fazer com ele —
 * `importArea` resolve contra `arquivoRel`, `import-adapter` casa a forma com barra que já
 * cobria `./adapters/x`. Aplicar a troca ali também não muda nada (relativo já usa barra em JS, e
 * dotted-relativo de Python não alcança `adapters/`, que mora fora de qualquer pacote do módulo).
 */
function pathShape(target) {
  return target.startsWith('.') ? target : target.replaceAll('.', '/');
}

/**
 * `import-adapter` casa `adapters/` em duas posições, e a posição MUDA com o tipo de import:
 *
 * NÃO relativo: só no PRIMEIRO segmento. É o que faz `adapters.memory` (Python, virando
 * `adapters/memory` via `pathShape`) apontar para a pasta de topo que `pythonpath=["."]`
 * expõe — e é o que salva `opentelemetry.adapters.wsgi` (`opentelemetry/adapters/wsgi`, primeiro
 * segmento `opentelemetry`) de ser confundido com ela: pacote externo com SUBMÓDULO chamado
 * `adapters` é código correto, e casar em qualquer posição os igualava por acidente de nome.
 *
 * Relativo: em QUALQUER segmento. Caminho relativo é posição de ARQUIVO, não nome de pacote — não
 * há pacote externo para colidir —, e é assim que `../../adapters/memory/index.js` continua
 * casando não importa a que profundidade o `../` termine.
 */
function adapterImports(target) {
  if (target.startsWith('.')) return /(^|\/)adapters?\//.test(target);
  return /^adapters?(\/|$)/.test(pathShape(target));
}

/**
 * Em que área do projeto este import cai? `null` = fora dele (stdlib, pacote externo, alias que não
 * dá para resolver) — e `null` NUNCA vira acusação, porque dependência externa é legítima em
 * `adapters/` por desenho.
 *
 * **A distinção que sustenta estas três regras: IMPORT é dependência; leitura de arquivo é
 * descoberta.** Só o que `importsOf` extrai chega aqui, e ele extrai forma de import — nunca
 * `readdirSync(join(root, 'modules'))`. É por isso que `src/composition.*`, que alcança todos os
 * módulos lendo o `module.json` de cada pasta, passa limpo: import amarra em tempo de compilação e mata a
 * substituição; leitura de arquivo é o mecanismo que permite acrescentar módulo sem tocar na
 * composição. Uma regra que procurasse a string `modules` acusaria o próprio desenho que protege.
 */
function importArea(relFile, target) {
  const path = target.startsWith('.')
    ? resolveRelative(relFile, target)
    : pathShape(target);
  if (path === null) return null;
  const [first, second] = path.split('/');
  if (!ROOT_AREAS.includes(first)) return null;
  if (first !== 'packages') return first;
  return second === 'ports' ? 'packages/ports' : 'packages';
}

/** Todos os imports dos arquivos de uma área da raiz, já com a área do alvo resolvida. */
function areaImports(project, prefix) {
  const list = [];
  for (const file of project.code) {
    if (!file.rel.startsWith(prefix)) continue;
    for (const target of importsOf(file)) {
      list.push({ rel: file.rel, target, area: importArea(file.rel, target) });
    }
  }
  return list;
}

/**
 * O pacote do kit deste módulo. É AQUI que `ui.pacote` ganha propósito: sem ele, o gate cobra o
 * nome canônico da tabela de nomes (`@<escopo>/ui-kit`, 04-regras.md §3.1); com ele, o projeto que
 * batizou o kit de outro jeito diz qual é, e continua verificável.
 */
function kitPackage(ctx) {
  return ctx.manifest?.ui?.pacote ?? null;
}

function isKitImport(ctx, target) {
  const pkg = kitPackage(ctx);
  if (pkg !== null) return target === pkg || target.startsWith(`${pkg}/`);
  return /^@[^/]+\/ui-kit(\/|$)/.test(target);
}

/**
 * O modo `kit` se aplica a este módulo? Duas guardas, e as duas silenciam por DESENHO.
 *
 * Modo `own` não tem regra aqui (ver o cabeçalho). E módulo sem `web/` é o caso ordinário —
 * descartar a tela é permitido (01-modulo.md §2) e é o que o molde Python faz: cobrar tela de quem
 * decidiu não ter uma seria falso positivo garantido.
 */
function kitModeApplies(ctx) {
  return ctx.manifest?.ui?.mode === 'kit' && hasFileIn(ctx, 'web/');
}

/** O laco de `alvo` isolado do de `lateral-import.verificar` — mesma tecnica das outras familias,
 * para o aninhamento caber no limiar que esta propria regra cobra do codigo do usuario (04-regras.md §4.7). */
function fileImportFindings(ctx, file, ids) {
  const findings = [];
  for (const target of importsOf(file)) {
    const neighbor = isModulePackage(target, ids.filter((id) => id !== ctx.dirId));
    if (neighbor !== null) {
      findings.push({ modulo: ctx.dirId, mensagem: `${file.rel}: imports module "${neighbor}" ("${target}")` });
    }
    if (leavesModule(file.rel, target)) {
      findings.push({ modulo: ctx.dirId, mensagem: `${file.rel}: relative path leaves the module directory ("${target}")` });
    }
  }
  return findings;
}

export default [
  {
    id: 'lateral-import',
    nivel: 'erro',
    escopo: 'global',
    check(contexts) {
      const ids = contexts.map((c) => c.dirId);
      const findings = [];
      for (const ctx of contexts) {
        for (const file of ctx.code) {
          findings.push(...fileImportFindings(ctx, file, ids));
        }
      }
      return findings;
    },
  },
  {
    id: 'import-adapter',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        // Teste é a raiz de composição dele mesmo: montar o adapter de memória ali é legítimo.
        if (file.isTest) continue;
        for (const target of importsOf(file)) {
          if (adapterImports(target) || /^@[^/]+\/adapter-/.test(target)) {
            findings.push(`${file.rel}: imports adapter ("${target}") — adapters are INJECTED, never imported`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'vendor-sdk',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        for (const target of importsOf(file)) {
          if (sdkOf(target) !== undefined) {
            findings.push(`${file.rel}: vendor SDK "${target}" is inside the module — use a port`);
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'gateway-http',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const forbidden = new RegExp(`\\b(${SQL_SOURCE}|createClient|new\\s+Pool|\\.query\\()`, 'i');
      return ctx.code
        // `codeText`, nao `conteudo`: o barril da pasta DOCUMENTA em comentario o que o
        // gateway nao pode fazer, e sobre o texto cru essa documentacao vira a violacao dela mesma.
        .filter((a) => a.rel.startsWith('core/gateways/') && forbidden.test(codeText(a)))
        .map((a) => `${a.rel}: gateway accesses a database — gateways use HTTP through another module's contract`);
    },
  },
  {
    id: 'gateway-declared',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const consumed = (ctx.manifest?.consumes ?? []).map((c) => c.module);
      // A exclusao de barril mora em `gatewaysOf` — ver o import no topo.
      const files = gatewaysOf(ctx);

      const findings = files
        .filter((name) => !consumed.includes(name))
        .map((name) => `core/gateways/${name}: is missing from module.json:consumes`);

      return findings.concat(
        consumed
          .filter((module) => !files.includes(module))
          .map((module) => `consumes declares "${module}" but core/gateways/${module} does not exist`),
      );
    },
  },
  {
    id: 'consumes-contract',
    nivel: 'erro',
    escopo: 'global',
    check(contexts) {
      const owners = new Map(contexts.map((c) => [c.dirId, c]));
      const findings = [];
      for (const ctx of contexts) {
        for (const entry of ctx.manifest?.consumes ?? []) {
          const failure = checkConsumption(owners.get(entry.module) ?? null, entry);
          if (failure !== null) findings.push({ modulo: ctx.dirId, mensagem: failure });
        }
      }
      return findings;
    },
  },
  {
    id: 'consumes-cycle',
    nivel: 'erro',
    escopo: 'global',
    check(contexts) {
      const graph = new Map(
        contexts.map((c) => [c.dirId, (c.manifest?.consumes ?? []).map((x) => x.module)]),
      );
      const findings = [];
      for (const start of graph.keys()) {
        const path = findCycle(graph, start);
        if (path !== null) findings.push({ modulo: start, mensagem: `dependency cycle: ${path.join(' -> ')}` });
      }
      return findings;
    },
  },
  {
    id: 'ui-kit',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      if (!kitModeApplies(ctx)) return [];

      // (a) Nenhum arquivo importa a biblioteca BRUTA — o kit e o unico ponto de contato com ela.
      const findings = [];
      for (const file of ctx.code) {
        for (const target of importsOf(file)) {
          const root = packageRoot(target);
          if (UI_LIBRARIES.some((lib) => root === lib || target.startsWith(lib))) {
            findings.push(`${file.rel}: imports raw UI library "${target}" — in ui.mode "kit", the kit package is the only allowed integration point`);
          }
        }
      }

      // (b) Declaracao sem consequencia — a forma exata do `web-declared`: o manifesto promete uma
      // origem para os componentes visuais e nada em `web/` vai busca-la la.
      const webFiles = ctx.code.filter((a) => a.rel.startsWith('web/') && !a.isTest);
      if (!webFiles.some((a) => importsOf(a).some((target) => isKitImport(ctx, target)))) {
        const expected = kitPackage(ctx) ?? '@<escopo>/ui-kit';
        findings.push(`ui.mode "kit" is declared, but no web/ file imports the kit ("${expected}") — import it in web/, declare its name in ui.package, or switch ui.mode back to "own"`);
      }
      return findings;
    },
  },
  {
    /**
     * O vértice do diagrama. A porta é a interface CANÔNICA: quem implementa depende dela, e ela
     * não depende de ninguém.
     *
     * "Não depende de nada" tem um recorte, e ele é obrigatório: `packages/ports/__init__.py`
     * importa `dataclasses`, `typing` e `__future__` — é disto que uma interface é feita. Contar
     * biblioteca-padrão acusaria um molde conforme. O que a regra proíbe são as DUAS dependências
     * que destroem a interface: as outras áreas do sistema, e o fornecedor.
     */
    id: 'pure-ports',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      const findings = [];
      for (const { rel, target, area } of areaImports(project, 'packages/ports/')) {
        if (area !== null && area !== 'packages' && area !== 'packages/ports') {
          findings.push(`${rel}: imports from ${area}/ ("${target}") — the port is the CANONICAL interface:`
            + ' implementations depend on it, never the reverse. Invert the dependency');
        }
        // O fornecedor na interface e o pior caso: `vendor-sdk` mantem o driver fora de CADA
        // modulo, e um `pg` aqui o devolveria a TODOS de uma vez, pela porta que eles importam.
        const sdk = sdkOf(target);
        if (sdk !== undefined) {
          findings.push(`${rel}: vendor SDK "${target}" is in the canonical interface — the port exists`
            + ' so modules do not know the vendor; placing the driver here exposes it to every module importing'
            + ' the port. The driver belongs in adapters/');
        }
      }
      return findings;
    },
  },
  {
    /**
     * O adapter implementa a porta e não conhece domínio nenhum — é o que o torna substituível e o
     * que permite ao módulo sair da pasta.
     *
     * Dependência EXTERNA aqui é legítima e não é acusada: `adapters/` é exatamente o lugar do
     * `pg`, do `@supabase/*` e do `boto3`. `vendor-sdk` proíbe isso no módulo; aqui é o
     * contrário, e proibir inverteria a arquitetura.
     */
    id: 'isolated-adapter',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      const findings = [];
      for (const { rel, target, area } of areaImports(project, 'adapters/')) {
        if (area === 'modules') {
          findings.push(`${rel}: imports from modules/ ("${target}") — the adapter implements the PORT and must not`
            + ' depend on a domain. Once it depends on a module, the adapter is no longer'
            + ' replaceable and that module can no longer be extracted independently');
        }
        if (area === 'src') {
          findings.push(`${rel}: imports from src/ ("${target}") — composition INSTANTIATES the adapter; depending`
            + ' on composition reverses the dependency and prevents independent adapter extraction');
        }
      }
      return findings;
    },
  },
  {
    /**
     * A composição DESCOBRE os módulos, nunca os importa — e a diferença entre as duas é a regra.
     *
     * `src/composition` alcança todos os módulos por `readdirSync(modules/)` + `module.json`, e
     * isso é a doutrina funcionando (00-arquitetura.md §3.4). Import é o oposto: fixa a lista em
     * tempo de compilação, e acrescentar um módulo passaria a exigir editar este arquivo.
     *
     * Importar `adapters/` daqui é o OFÍCIO da composição — ela instancia e injeta — e não é
     * acusado. Só `modules/` é.
     */
    id: 'composition-discovery',
    nivel: 'erro',
    escopo: 'root',
    check(project) {
      if (!project.isProject) return [];
      return areaImports(project, 'src/')
        .filter(({ area }) => area === 'modules')
        .map(({ rel, target }) => `${rel}: imports from modules/ ("${target}") — composition DISCOVERS modules by`
          + ' reading modules/*/module.json, never by import: imports fix the list at compile time'
          + ' and adding a module would require editing this file');
    },
  },
  {
    id: 'ui-token',
    nivel: 'aviso',
    escopo: 'module',
    check(ctx) {
      if (!kitModeApplies(ctx)) return [];
      const findings = [];
      const screenFiles = [...ctx.code, ...ctx.files.filter((a) => EXT_STYLE.has(a.ext))];
      for (const file of screenFiles) {
        if (!file.rel.startsWith('web/') || file.isTest) continue;
        const isStyle = EXT_STYLE.has(file.ext);
        // `linhasCodigo`, nunca `conteudo`: a propria lei escrita num comentario ("nada de #fff
        // aqui") viraria violacao dela mesma. Vale igual em folha de estilo: o extrator descarta
        // `/* ... */`, de uma linha ou de varias, e a linha de continuacao iniciada por `*`.
        for (const { number, text } of file.codeLines) {
          if (hasVisualLiteral(text, isStyle)) {
          findings.push(`${file.rel}:${number}: literal color or font in a style declaration — ui.mode "kit" gets colors and fonts from kit tokens`);
          }
        }
      }
      return findings;
    },
  },
];

/**
 * Confere UMA entrada de `consumes` contra o contrato do módulo dono. `null` = conforme.
 *
 * Nunca aprova por omissão: dono inexistente e dono sem spec viram achado, e não silêncio. É o
 * §7 aplicado — a regra diz que não conseguiu verificar, em vez de deixar passar.
 */
function checkConsumption(owner, entry) {
  const target = `"${entry.contract}" (owning module "${entry.module}")`;
  if (owner === null) return `consumes ${target}: the owning module does not exist in modules/`;

  const spec = specOf(owner);
  if (spec === null) return `consumes ${target}: the owner has no contract/openapi.yaml — verification was NOT possible`;

  // `paths:` do DONO ilegivel: o defeito e do dono, e o `contract` DELE ja o reporta (esta regra
  // e global, entao o dono esta sempre no conjunto analisado). Acusar aqui mandaria o autor do
  // CONSUMIDOR consertar um arquivo que nao e dele — o conserto errado, para a pessoa errada.
  // So `paths:` importa: o contrato consumido e a rota, e o `servers:` do dono nao entra nela.
  if (failedReads(spec.content).includes('paths')) return null;

  // Forma garantida pelo schema (`^(GET|POST|PATCH|PUT|DELETE) /`); manifesto torto e do
  // `manifest-schema`, nao desta regra — nao acusamos duas vezes o mesmo defeito.
  const [method, path] = entry.contract.split(/\s+/);
  if (path === undefined) return null;

  const operations = specOperations(spec.content);
  const route = [...operations.keys()].find((r) => normalize(r) === normalize(path));
  if (route === undefined) return `consumes ${target}: the owner's contract does not declare path "${path}"`;

  const methods = operations.get(route);
  if (methods.has(method)) return null;
  return `consumes ${target}: the owner declares "${route}" but not method ${method} (declared: ${[...methods].join(', ') || 'none'})`;
}

/** Busca em profundidade a partir de `inicio`, devolvendo o caminho do ciclo que volta a ele. */
function findCycle(graph, start) {
  const stack = [[start, [start]]];
  const seen = new Set();
  while (stack.length > 0) {
    const [current, path] = stack.pop();
    for (const neighbor of graph.get(current) ?? []) {
      if (neighbor === start) return [...path, start];
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      stack.push([neighbor, [...path, neighbor]]);
    }
  }
  return null;
}
