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

interface Opcoes {
  deps: ModuleDependencies;
  config: ModuleConfiguration;
}

/** Paginacao validada na borda, com padrao e teto vindos de config/api.json. */
function readPagination(query: Record<string, unknown>, config: ModuleConfiguration): [number, number] {
  const pagina = Number(query['pagina'] ?? 1);
  const tamanho = Number(query['tamanho'] ?? config.api.defaultPageSize);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ApiError('VALIDACAO', 'parametro "pagina" deve ser inteiro >= 1');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > config.api.maxPageSize) {
    throw new ApiError('VALIDACAO', `parametro "tamanho" deve estar entre 1 e ${config.api.maxPageSize}`);
  }
  return [pagina, tamanho];
}

/** Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function readBody(corpo: unknown): { titulo: unknown; status?: unknown } {
  if (typeof corpo !== 'object' || corpo === null) {
    throw new ApiError('VALIDACAO', 'corpo deve ser um objeto');
  }
  const permitidos = new Set(['titulo', 'status']);
  const desconhecido = Object.keys(corpo).find((chave) => !permitidos.has(chave));
  if (desconhecido !== undefined) {
    throw new ApiError('VALIDACAO', `campo desconhecido no corpo: "${desconhecido}"`);
  }
  return corpo as { titulo: unknown; status?: unknown };
}

function requiredRoutes(router: Router, { deps, config }: Opcoes): void {
  const { manifesto } = config;

  router.get('/health', (_req, res, next) => {
    deps.repository
      .count()
      .then(() => res.json({ ok: true, modulo: manifesto.id }))
      .catch(next);
  });

  router.get('/meta', (_req, res) => {
    res.json(toMeta(manifesto));
  });

  router.get('/resumo', (_req, res, next) => {
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
function permissionsFor(config: ModuleConfiguration): { ler: string; escrever: string } {
  const [ler, escrever] = config.manifesto.permissions;
  if (ler === undefined || escrever === undefined) {
    throw new Error('[rotas] module.json:permissions precisa declarar leitura e escrita');
  }
  return { ler, escrever };
}

function recordRoutes(router: Router, { deps, config }: Opcoes): void {
  const { ler, escrever } = permissionsFor(config);

  router.get('/registros', requirePermission(ler), (req, res, next) => {
    Promise.resolve()
      .then(() => readPagination(req.query as Record<string, unknown>, config))
      .then(([pagina, tamanho]) => deps.repository.list(pagina, tamanho))
      .then((resultado) =>
        res.json(toCollection(resultado.itens, resultado.pagina, resultado.tamanho, resultado.total)),
      )
      .catch(next);
  });

  router.get('/registros/:hash', requirePermission(ler), (req, res, next) => {
    const hash = req.params['hash'];
    if (hash === undefined || hash === '') {
      next(new ApiError('VALIDACAO', 'hash ausente no caminho'));
      return;
    }
    deps.repository
      .findByHash(hash)
      .then((registro) => {
        if (registro === null) throw new ApiError('NAO_ENCONTRADO', 'registro nao encontrado');
        res.json(toContract(registro));
      })
      .catch(next);
  });

  router.post('/registros', requirePermission(escrever), (req, res, next) => {
    Promise.resolve()
      .then(() => create(req.body as unknown, deps, config, req.requestId))
      .then((registro) => res.status(201).json(toContract(registro)))
      .catch((causa: unknown) => next(translate(causa)));
  });
}

async function create(
  corpo: unknown,
  deps: ModuleDependencies,
  config: ModuleConfiguration,
  requestId: string,
) {
  const entrada = readBody(corpo);
  const registro = buildRecord(
    entrada as { titulo: string; status?: string },
    config.dominio.validStatuses,
    deps.idGenerator.hash(),
    deps.clock.now(),
  );
  await deps.repository.insert(registro);
  await deps.audit.record({
    hash: registro.hash,
    acao: 'create',
    sujeito: 'sistema',
    camposAlterados: Object.keys(registro),
    requestId,
  });
  return registro;
}

/** Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function translate(causa: unknown): unknown {
  if (causa instanceof ValidationError) return new ApiError('VALIDACAO', causa.message);
  return causa;
}

export function createRoutes(opcoes: Opcoes): Router {
  const router = Router();
  requiredRoutes(router, opcoes);
  recordRoutes(router, opcoes);
  return router;
}
