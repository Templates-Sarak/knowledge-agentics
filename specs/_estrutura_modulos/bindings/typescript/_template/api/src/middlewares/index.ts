// Cadeia de seguranca do modulo <module>. Lei dona: specs/arquitetura/03-operacao.md §2.1.
//
// Ordem obrigatoria, igual em todo modulo:
//   requestId -> headers -> CORS -> rate limit -> autenticacao -> autorizacao -> rota -> erro
//
// Nenhuma rota monta erro a mao: quem transforma excecao em resposta e o tratador, no fim da cadeia.
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ConfigSecurity } from '../config.js';
import { ApiError, errorEnvelope } from '../errors.js';
import type { Logger } from '../logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    permissions: string[];
  }
}

/** Correlaciona log, trilha de auditoria e envelope de erro. Primeiro da cadeia, sempre. */
export function requestId(generate: () => string): RequestHandler {
  return (req, res, next) => {
    req.requestId = generate();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

export function securityHeaders(config: ConfigSecurity['headers']): RequestHandler {
  return (_req, res, next) => {
    if (config.hsts) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    if (config.noSniff) res.setHeader('x-content-type-options', 'nosniff');
    if (config.frameDeny) res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', config.referrerPolicy);
    next();
  };
}

/** Origens sao DECLARADAS em config/security.json. `*` e proibido (specs/arquitetura/03-operacao.md §2.1). */
export function cors(config: ConfigSecurity['cors']): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && config.allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-methods', config.methods.join(', '));
    }
    next();
  };
}

/** Contador em memoria: suficiente para um processo. Multi-instancia exige uma porta dedicada. */
export function rateLimit(config: ConfigSecurity['rateLimit']): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();

  return (req, res, next) => {
    const limit = req.method === 'GET' ? config.readLimit : config.writeLimit;
    const key = `${req.ip ?? 'unknown'}:${req.method}`;
    const now = Date.now();
    const current = windows.get(key);

    if (current === undefined || now - current.start > config.windowSeconds * 1000) {
      windows.set(key, { start: now, count: 1 });
      next();
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      res.setHeader('retry-after', String(config.windowSeconds));
      next(new ApiError('LIMIT_EXCEEDED', 'request limit exceeded'));
      return;
    }
    next();
  };
}

export interface Auth {
  verify(token: string): Promise<{ permissions: string[] } | null>;
}

/**
 * `publicRoutes` e declarado RELATIVO a rotaBase ("GET /health"), mas esta cadeia roda ANTES do
 * router ser montado — aqui `req.path` ainda e absoluto ("/api/v1/<module>/health"). Sem tirar o
 * prefixo, nenhuma rota publica casaria e /health, /meta e /resumo responderiam 401.
 */
function pathRelative(path: string, baseRoute: string): string {
  if (!path.startsWith(baseRoute)) return path;
  const rest = path.slice(baseRoute.length);
  return rest === '' ? '/' : rest;
}

/** DENY BY DEFAULT: so as rotas de `module.json:publicRoutes` passam sem token. */
export function authentication(auth: Auth, publicRoutes: string[], baseRoute: string): RequestHandler {
  const publicSet = new Set(publicRoutes.map((route) => route.toUpperCase()));

  return (req, _res, next) => {
    const relativePath = pathRelative(req.path, baseRoute);
    if (publicSet.has(`${req.method} ${relativePath}`.toUpperCase())) {
      req.permissions = [];
      next();
      return;
    }
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      next(new ApiError('UNAUTHENTICATED', 'missing token'));
      return;
    }
    auth
      .verify(header.slice(7))
      .then((claims) => {
        if (claims === null) {
          next(new ApiError('UNAUTHENTICATED', 'invalid token'));
          return;
        }
        req.permissions = claims.permissions;
        next();
      })
      .catch(next);
  };
}

/** Autorizacao por permissao NOMEADA. RLS no banco e defesa em profundidade, nao o controle. */
export function requirePermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.permissions?.includes(permission)) {
      next(new ApiError('FORBIDDEN', 'insufficient permission'));
      return;
    }
    next();
  };
}

/** Unico lugar que transforma excecao em resposta. Detalhe vai para o log, nunca para o cliente. */
export function errorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const known =
      error instanceof ApiError
        ? error
        : new ApiError('INTERNAL', 'internal error', error instanceof Error ? error.message : String(error));

    logger.error('request failed', {
      requestId: req.requestId,
      code: known.code,
      path: req.path,
      detail: known.detail ?? known.message,
    });
    res.status(known.status).json(errorEnvelope(known, req.requestId));
  };
}
