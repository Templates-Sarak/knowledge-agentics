// Rotas do modulo <module>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.
//
// O contrato manda: toda rota daqui existe em contract/openapi.yaml, e o inverso tambem
// (regra `synchronized-contract`). Valide na borda ANTES do dominio; exija permissao nomeada;
// monte a resposta pelo mapeador; lance ApiError — nunca `res.status(...)` ad hoc.
import { Router } from 'express';

import { ValidationError, buildRecord } from '../../../core/domain/index.js';
import { ApiError } from '../errors.js';
import { requirePermission } from '../middlewares/index.js';
import { toCollection, toContract, toMeta } from '../mappers/index.js';

/** Paginacao validada na borda, com padrao e teto vindos de config/api.json. */
function readPagination(query, config) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? config.api.defaultPageSize);
  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError('VALIDATION', 'parameter "page" must be an integer >= 1');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > config.api.maxPageSize) {
    throw new ApiError('VALIDATION', `parameter "pageSize" must be between 1 and ${config.api.maxPageSize}`);
  }
  return [page, pageSize];
}

/** Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function readBody(body) {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError('VALIDATION', 'body must be an object');
  }
  const allowed = new Set(['title', 'status']);
  const unknownField = Object.keys(body).find((key) => !allowed.has(key));
  if (unknownField !== undefined) {
    throw new ApiError('VALIDATION', `unknown field in body: "${unknownField}"`);
  }
  return body;
}

/** As permissoes vem do manifesto, nunca de literal no codigo. */
function permissionsFor(config) {
  const [read, write] = config.manifest.permissions;
  if (read === undefined || write === undefined) {
    throw new Error('[routes] module.json:permissions must declare read and write');
  }
  return { read, write };
}

function requiredRoutes(router, { deps, config }) {
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

function recordRoutes(router, { deps, config }) {
  const { read, write } = permissionsFor(config);

  router.get('/entries', requirePermission(read), (req, res, next) => {
    Promise.resolve()
      .then(() => readPagination(req.query, config))
      .then(([page, pageSize]) => deps.repository.list(page, pageSize))
      .then((r) => res.json(toCollection(r.items, r.page, r.pageSize, r.total)))
      .catch(next);
  });

  router.get('/entries/:hash', requirePermission(read), (req, res, next) => {
    deps.repository
      .findByHash(req.params.hash)
      .then((entry) => {
        if (entry === null) throw new ApiError('NOT_FOUND', 'entry not found');
        res.json(toContract(entry));
      })
      .catch(next);
  });

  router.post('/entries', requirePermission(write), (req, res, next) => {
    Promise.resolve()
      .then(() => create(req.body, deps, config, req.requestId))
      .then((entry) => res.status(201).json(toContract(entry)))
      .catch((cause) => next(translate(cause)));
  });
}

async function create(body, deps, config, requestId) {
  const input = readBody(body);
  const entry = buildRecord(input, config.domain.validStatuses, deps.idGenerator.hash(), deps.clock.now());
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
function translate(cause) {
  if (cause instanceof ValidationError) return new ApiError('VALIDATION', cause.message);
  return cause;
}

export function createRoutes(options) {
  const router = Router();
  requiredRoutes(router, options);
  recordRoutes(router, options);
  return router;
}
