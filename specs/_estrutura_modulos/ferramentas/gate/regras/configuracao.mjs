/**
 * regras/configuracao.mjs — família "Configuração e ambiente" (specs/arquitetura/04-regras.md §4.4).
 * ids: config-valida, schema-config, config-morta, hardcode-url, hardcode-numero,
 *      fallback-silencioso, cors-aberto, env-declarado, env-exemplo, env-modulo,
 *      env-fora-do-carregador
 */
import { carregarEsquema, validar } from '../esquema.mjs';

const CONFIGS = ['api', 'dominio', 'seguranca', 'portas', 'textos'];
const ARQUIVOS_CARREGADORES = ['api/src/config.ts', 'api/src/config.js', 'api/src/config.py'];

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
