/**
 * regras/isolamento.mjs — família "Isolamento" do catálogo (specs/arquitetura/04-regras.md §4.2).
 * ids: import-lateral, import-adapter, sdk-fornecedor, gateway-http, gateway-declarado,
 *      consome-ciclo, consome-contrato
 *
 * É a família que sustenta a extraibilidade. Se ela passa, o módulo sai da pasta sem refactor.
 */
import { leiturasFalhas, normalizar, operacoesDaSpec, specDe } from '../spec.mjs';

const SDKS_FORNECEDOR = [
  '@supabase/', 'pg', 'mysql', 'mysql2', 'aws-sdk', '@aws-sdk/', 'firebase',
  'firebase-admin', 'oracledb', 'mongodb', 'mongoose', 'openai', 'redis', 'ioredis',
  'psycopg2', 'boto3', 'sqlalchemy', 'pymongo',
];

// Captura o alvo de `import ... from 'X'`, `require('X')`, `import('X')` e `from X import` (Python).
const PADROES_IMPORT = [
  /from\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*(?:from|import)\s+([A-Za-z0-9_.]+)/gm,
];

/** Todos os alvos de import de um arquivo, sem duplicata. */
export function importesDe(arquivo) {
  const alvos = new Set();
  for (const padrao of PADROES_IMPORT) {
    for (const achado of arquivo.conteudo.matchAll(padrao)) alvos.add(achado[1]);
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
          if (/(^|\/)adapters?\//.test(alvo) || /^@[^/]+\/adapter-/.test(alvo)) {
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
          const raiz = raizDoPacote(alvo);
          const casado = SDKS_FORNECEDOR.find((sdk) => raiz === sdk || alvo.startsWith(sdk));
          if (casado !== undefined) {
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
      const proibidos = /\b(select\s+.*\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from|createClient|new\s+Pool|\.query\()/i;
      return ctx.codigo
        .filter((a) => a.rel.startsWith('core/gateways/') && proibidos.test(a.conteudo))
        .map((a) => `${a.rel}: gateway fala com banco — gateway e HTTP sobre o contrato do outro modulo`);
    },
  },
  {
    id: 'gateway-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // Barril da pasta (index.*/__init__.py) documenta o slot; nao e um gateway.
      const BARRIS = ['index', '__init__'];
      const consumidos = (ctx.manifesto?.consome ?? []).map((c) => c.modulo);
      const arquivos = ctx.codigo
        .filter((a) => a.rel.startsWith('core/gateways/'))
        .map((a) => a.rel.split('/').pop().replace(/\.[^.]+$/, ''))
        .filter((nome) => !BARRIS.includes(nome));

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
