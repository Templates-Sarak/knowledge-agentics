// Rotas do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.
//
// O contrato manda: toda rota daqui existe em contract/openapi.yaml, e o inverso tambem
// (regra `contrato-sincronizado`). Valide na borda ANTES do dominio; exija permissao nomeada;
// monte a resposta pelo mapeador; lance ErroApi — nunca `res.status(...)` ad hoc.
import { Router } from 'express';

import { ErroDeValidacao, buildRecord } from '../../../core/domain/index.js';
import { ErroApi } from '../erros.js';
import { requirePermission } from '../middlewares/index.js';
import { toCollection, toContract, toMeta } from '../mappers/index.js';

/** Paginacao validada na borda, com padrao e teto vindos de config/api.json. */
function readPagination(query, config) {
  const pagina = Number(query.pagina ?? 1);
  const tamanho = Number(query.tamanho ?? config.api.paginaTamanhoPadrao);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErroApi('VALIDACAO', 'parametro "pagina" deve ser inteiro >= 1');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > config.api.paginaTamanhoMaximo) {
    throw new ErroApi(
      'VALIDACAO',
      `parametro "tamanho" deve estar entre 1 e ${config.api.paginaTamanhoMaximo}`,
    );
  }
  return [pagina, tamanho];
}

/** Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function readBody(corpo) {
  if (typeof corpo !== 'object' || corpo === null) {
    throw new ErroApi('VALIDACAO', 'corpo deve ser um objeto');
  }
  const permitidos = new Set(['titulo', 'status']);
  const desconhecido = Object.keys(corpo).find((chave) => !permitidos.has(chave));
  if (desconhecido !== undefined) {
    throw new ErroApi('VALIDACAO', `campo desconhecido no corpo: "${desconhecido}"`);
  }
  return corpo;
}

/** As permissoes vem do manifesto, nunca de literal no codigo. */
function permissionsFor(config) {
  const [ler, escrever] = config.manifesto.permissions;
  if (ler === undefined || escrever === undefined) {
    throw new Error('[rotas] module.json:permissoes precisa declarar leitura e escrita');
  }
  return { ler, escrever };
}

function requiredRoutes(router, { deps, config }) {
  const { manifesto } = config;

  router.get('/health', (_req, res, next) => {
    deps.repositorio
      .count()
      .then(() => res.json({ ok: true, modulo: manifesto.id }))
      .catch(next);
  });

  router.get('/meta', (_req, res) => {
    res.json(toMeta(manifesto));
  });

  router.get('/resumo', (_req, res, next) => {
    deps.repositorio
      .count()
      .then((total) => res.json({ total }))
      .catch(next);
  });
}

function recordRoutes(router, { deps, config }) {
  const { ler, escrever } = permissionsFor(config);

  router.get('/registros', requirePermission(ler), (req, res, next) => {
    Promise.resolve()
      .then(() => readPagination(req.query, config))
      .then(([pagina, tamanho]) => deps.repositorio.list(pagina, tamanho))
      .then((r) => res.json(toCollection(r.itens, r.pagina, r.tamanho, r.total)))
      .catch(next);
  });

  router.get('/registros/:hash', requirePermission(ler), (req, res, next) => {
    deps.repositorio
      .findByHash(req.params.hash)
      .then((registro) => {
        if (registro === null) throw new ErroApi('NAO_ENCONTRADO', 'registro nao encontrado');
        res.json(toContract(registro));
      })
      .catch(next);
  });

  router.post('/registros', requirePermission(escrever), (req, res, next) => {
    Promise.resolve()
      .then(() => create(req.body, deps, config, req.requestId))
      .then((registro) => res.status(201).json(toContract(registro)))
      .catch((causa) => next(translate(causa)));
  });
}

async function create(corpo, deps, config, requestId) {
  const entrada = readBody(corpo);
  const registro = buildRecord(
    entrada,
    config.dominio.statusValidos,
    deps.geradorId.hash(),
    deps.relogio.now(),
  );
  await deps.repositorio.insert(registro);
  await deps.auditoria.record({
    hash: registro.hash,
    acao: 'create',
    sujeito: 'sistema',
    camposAlterados: Object.keys(registro),
    requestId,
  });
  return registro;
}

/** Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function translate(causa) {
  if (causa instanceof ErroDeValidacao) return new ErroApi('VALIDACAO', causa.message);
  return causa;
}

export function createRoutes(opcoes) {
  const router = Router();
  requiredRoutes(router, opcoes);
  recordRoutes(router, opcoes);
  return router;
}
