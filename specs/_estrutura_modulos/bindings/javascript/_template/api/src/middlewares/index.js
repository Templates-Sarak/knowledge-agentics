// Cadeia de seguranca do modulo <modulo>. Lei dona: doutrina/03-operacao.md §2.1.
//
// Ordem obrigatoria, igual em todo modulo:
//   requestId -> headers -> CORS -> rate limit -> autenticacao -> autorizacao -> rota -> erro
//
// Nenhuma rota monta erro a mao: quem transforma excecao em resposta e o tratador, no fim da cadeia.
import { ErroApi, envelopeDeErro } from '../erros.js';

/** Correlaciona log, trilha de auditoria e envelope de erro. Primeiro da cadeia, sempre. */
export function requestId(gerar) {
  return (req, res, next) => {
    req.requestId = gerar();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

export function headersDeSeguranca(config) {
  return (_req, res, next) => {
    if (config.hsts) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    if (config.noSniff) res.setHeader('x-content-type-options', 'nosniff');
    if (config.frameDeny) res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', config.referrerPolicy);
    next();
  };
}

/** Origens sao DECLARADAS em config/seguranca.json. `*` e proibido (regra `cors-aberto`). */
export function cors(config) {
  return (req, res, next) => {
    const origem = req.headers.origin;
    if (typeof origem === 'string' && config.origensPermitidas.includes(origem)) {
      res.setHeader('access-control-allow-origin', origem);
      res.setHeader('access-control-allow-methods', config.metodos.join(', '));
    }
    next();
  };
}

/** Contador em memoria: suficiente para um processo. Multi-instancia exige uma porta dedicada. */
export function rateLimit(config) {
  const janelas = new Map();

  return (req, res, next) => {
    const limite = req.method === 'GET' ? config.limiteLeitura : config.limiteEscrita;
    const chave = `${req.ip ?? 'desconhecido'}:${req.method}`;
    const agora = Date.now();
    const atual = janelas.get(chave);

    if (atual === undefined || agora - atual.inicio > config.janelaSegundos * 1000) {
      janelas.set(chave, { inicio: agora, contagem: 1 });
      next();
      return;
    }
    atual.contagem += 1;
    if (atual.contagem > limite) {
      res.setHeader('retry-after', String(config.janelaSegundos));
      next(new ErroApi('LIMITE_EXCEDIDO', 'limite de requisicoes excedido'));
      return;
    }
    next();
  };
}

/**
 * `rotasPublicas` e declarado RELATIVO a rotaBase ("GET /health"), mas esta cadeia roda ANTES do
 * router ser montado — aqui `req.path` ainda e absoluto. Sem tirar o prefixo, nenhuma rota
 * publica casaria e /health, /meta e /resumo responderiam 401.
 */
function caminhoRelativo(caminho, rotaBase) {
  if (!caminho.startsWith(rotaBase)) return caminho;
  const resto = caminho.slice(rotaBase.length);
  return resto === '' ? '/' : resto;
}

/** DENY BY DEFAULT: so as rotas de `modulo.json:rotasPublicas` passam sem token. */
export function autenticacao(auth, rotasPublicas, rotaBase) {
  const publicas = new Set(rotasPublicas.map((rota) => rota.toUpperCase()));

  return (req, _res, next) => {
    const relativo = caminhoRelativo(req.path, rotaBase);
    if (publicas.has(`${req.method} ${relativo}`.toUpperCase())) {
      req.permissoes = [];
      next();
      return;
    }
    const cabecalho = req.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      next(new ErroApi('NAO_AUTENTICADO', 'token ausente'));
      return;
    }
    auth.verificar(cabecalho.slice(7))
      .then((claims) => {
        if (claims === null) {
          next(new ErroApi('NAO_AUTENTICADO', 'token invalido'));
          return;
        }
        req.permissoes = claims.permissoes;
        next();
      })
      .catch(next);
  };
}

/** Autorizacao por permissao NOMEADA. RLS no banco e defesa em profundidade, nao o controle. */
export function exigirPermissao(permissao) {
  return (req, _res, next) => {
    if (!req.permissoes?.includes(permissao)) {
      next(new ErroApi('NAO_AUTORIZADO', 'permissao insuficiente'));
      return;
    }
    next();
  };
}

/** Unico lugar que transforma excecao em resposta. Detalhe vai para o log, nunca para o cliente. */
export function tratadorDeErro(logger) {
  return (erro, req, res, _next) => {
    const conhecido = erro instanceof ErroApi
      ? erro
      : new ErroApi('INTERNO', 'erro interno', erro instanceof Error ? erro.message : String(erro));

    logger.error('falha na requisicao', {
      requestId: req.requestId,
      codigo: conhecido.codigo,
      caminho: req.path,
      detalhe: conhecido.detalhe ?? conhecido.message,
    });
    res.status(conhecido.status).json(envelopeDeErro(conhecido, req.requestId));
  };
}
