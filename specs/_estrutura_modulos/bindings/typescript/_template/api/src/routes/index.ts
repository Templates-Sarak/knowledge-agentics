// Rotas do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.
//
// O contrato manda: toda rota daqui existe em contract/openapi.yaml, e o inverso tambem.
// Regras cobradas aqui: valida na borda ANTES do dominio; exige permissao nomeada; monta a
// resposta pelo mapeador (nunca o registro cru); lanca ApiError (nunca `res.status()` ad hoc).
import { Router } from 'express';

import type { ModuleConfiguration } from '../config.js';
import type { ModuleDependencies } from '../../../core/ports/index.js';
import { ValidationError, buildRecord } from '../../../core/domain/index.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../middlewares/index.js';
import { toCollection, toContract, toMeta } from '../mappers/index.js';

interface Options {
  deps: ModuleDependencies;
  config: ModuleConfiguration;
}

/** Paginacao validada na borda, com padrao e teto vindos de config/api.json. */
function readPagination(query: Record<string, unknown>, config: ModuleConfiguration): [number, number] {
  const page = Number(query['page'] ?? 1);
  const pageSize = Number(query['pageSize'] ?? config.api.defaultPageSize);
  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError('VALIDATION', 'parameter "page" must be an integer >= 1');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > config.api.maxPageSize) {
    throw new ApiError('VALIDATION', `parameter "pageSize" must be between 1 and ${config.api.maxPageSize}`);
  }
  return [page, pageSize];
}

/** Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function readBody(body: unknown): { title: unknown; status?: unknown } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError('VALIDATION', 'body must be an object');
  }
  const allowed = new Set(['title', 'status']);
  const unknownField = Object.keys(body).find((key) => !allowed.has(key));
  if (unknownField !== undefined) {
    throw new ApiError('VALIDATION', `unknown field in body: "${unknownField}"`);
  }
  return body as { title: unknown; status?: unknown };
}

function requiredRoutes(router: Router, { deps, config }: Options): void {
  const { manifest } = config;

  router.get('/health', (_req, res, next) => {
    deps.repository
      .count()
      .then(() => res.json({ ok: true, module: manifest.id }))
      .catch(next);
  });

  router.get('/meta', (_req, res) => {
    res.json(toMeta(manifest));
  });

  router.get('/summary', (_req, res, next) => {
    deps.repository
      .count()
      .then((total) => res.json({ total }))
      .catch(next);
  });
}

/**
 * As permissoes vem do manifesto, nunca de literal no codigo.
 * Manifesto incompleto derruba o boot aqui — melhor que servir rota sem autorizacao.
 */
function permissionsFor(config: ModuleConfiguration): { read: string; write: string } {
  const [read, write] = config.manifest.permissions;
  if (read === undefined || write === undefined) {
    throw new Error('[routes] module.json:permissions must declare read and write');
  }
  return { read, write };
}

function recordRoutes(router: Router, { deps, config }: Options): void {
  const { read, write } = permissionsFor(config);

  router.get('/entries', requirePermission(read), (req, res, next) => {
    Promise.resolve()
      .then(() => readPagination(req.query as Record<string, unknown>, config))
      .then(([page, pageSize]) => deps.repository.list(page, pageSize))
      .then((result) => res.json(toCollection(result.items, result.page, result.pageSize, result.total)))
      .catch(next);
  });

  router.get('/entries/:hash', requirePermission(read), (req, res, next) => {
    const hash = req.params['hash'];
    if (hash === undefined || hash === '') {
      next(new ApiError('VALIDATION', 'missing hash in the path'));
      return;
    }
    deps.repository
      .findByHash(hash)
      .then((entry) => {
        if (entry === null) throw new ApiError('NOT_FOUND', 'entry not found');
        res.json(toContract(entry));
      })
      .catch(next);
  });

  router.post('/entries', requirePermission(write), (req, res, next) => {
    Promise.resolve()
      .then(() => create(req.body as unknown, deps, config, req.requestId))
      .then((entry) => res.status(201).json(toContract(entry)))
      .catch((cause: unknown) => next(translate(cause)));
  });
}

async function create(
  body: unknown,
  deps: ModuleDependencies,
  config: ModuleConfiguration,
  requestId: string,
) {
  const input = readBody(body);
  const entry = buildRecord(
    input as { title: string; status?: string },
    config.domain.validStatuses,
    deps.idGenerator.hash(),
    deps.clock.now(),
  );
  await deps.repository.insert(entry);
  await deps.audit.record({
    hash: entry.hash,
    action: 'create',
    actor: 'system',
    changedFields: Object.keys(entry),
    requestId,
  });
  return entry;
}

/** Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function translate(cause: unknown): unknown {
  if (cause instanceof ValidationError) return new ApiError('VALIDATION', cause.message);
  return cause;
}

export function createRoutes(options: Options): Router {
  const router = Router();
  requiredRoutes(router, options);
  recordRoutes(router, options);
  return router;
}
