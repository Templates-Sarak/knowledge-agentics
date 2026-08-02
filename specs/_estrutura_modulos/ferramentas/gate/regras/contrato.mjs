/**
 * regras/contrato.mjs — família "Contrato" do catálogo (specs/arquitetura/04-regras.md §4.5).
 * ids: contrato, contrato-sincronizado, payload-camelcase, saida-sensivel, saida-crua
 *
 * O `contrato/openapi.yaml` é a FONTE. Estas regras existem para que ele não seja ficção: o que
 * está na spec existe no código, o que está no código existe na spec, e nada sensível vaza.
 *
 * A leitura da spec mora em `../spec.mjs`, compartilhada com `consome-contrato` (Isolamento).
 */
import { normalizar, rotasDaSpec, specDe } from '../spec.mjs';

const OBRIGATORIAS = ['/health', '/meta', '/resumo'];

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

/** Chaves de objeto literal devolvidas pela projeção de saída do mapeador. */
function chavesDaProjecao(ctx) {
  const chaves = [];
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !/mapeador/i.test(arquivo.rel)) continue;
    // matchAll, nao match: um mapeador tem mais de uma projecao (resumo e detalhe, por exemplo),
    // e olhar so a primeira deixava as demais sem verificacao nenhuma.
    const projecoes = arquivo.conteudo.matchAll(/(?:paraContrato|para_contrato)\w*[\s\S]{0,900}?\{([\s\S]*?)\n\s*\}/g);
    for (const projecao of projecoes) {
      // Chave apos `{` ou `,` — nao apenas no inicio da linha. Objeto escrito numa linha so
      // (`{ hash: x, criado_em: y }`) escapava inteiro quando a extracao exigia inicio de linha.
      for (const achado of projecao[1].matchAll(/[{,]\s*["']?([A-Za-z_]\w*)["']?\s*:/g)) {
        chaves.push({ chave: achado[1], arquivo: arquivo.rel });
      }
    }
  }
  return chaves;
}

export default [
  {
    id: 'contrato',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      if (spec === null) return ['contrato/openapi.yaml ausente'];
      return OBRIGATORIAS
        .filter((rota) => !spec.conteudo.includes(`${rota}:`))
        .map((rota) => `contrato/openapi.yaml nao declara a rota obrigatoria "${rota}"`);
    },
  },
  {
    id: 'contrato-sincronizado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      if (spec === null) return [];
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
