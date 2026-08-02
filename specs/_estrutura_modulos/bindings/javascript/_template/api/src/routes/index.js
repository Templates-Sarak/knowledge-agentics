// Rotas do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §2.
//
// O contrato manda: toda rota daqui existe em contrato/openapi.yaml, e o inverso tambem
// (regra `contrato-sincronizado`). Valide na borda ANTES do dominio; exija permissao nomeada;
// monte a resposta pelo mapeador; lance ErroApi — nunca `res.status(...)` ad hoc.
import { Router } from 'express';

import { ErroDeValidacao, montarRegistro } from '../../../core/dominio/index.js';
import { ErroApi } from '../erros.js';
import { exigirPermissao } from '../middlewares/index.js';
import { paraColecao, paraContrato } from '../mapeadores/index.js';

/** Paginacao validada na borda, com padrao e teto vindos de config/api.json. */
function lerPaginacao(query, config) {
  const pagina = Number(query.pagina ?? 1);
  const tamanho = Number(query.tamanho ?? config.api.paginaTamanhoPadrao);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErroApi('VALIDACAO', 'parametro "pagina" deve ser inteiro >= 1');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > config.api.paginaTamanhoMaximo) {
    throw new ErroApi('VALIDACAO', `parametro "tamanho" deve estar entre 1 e ${config.api.paginaTamanhoMaximo}`);
  }
  return [pagina, tamanho];
}

/** Allowlist de entrada: campo desconhecido e REJEITADO, nunca ignorado (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function lerCorpo(corpo) {
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
function permissoesDe(config) {
  const [ler, escrever] = config.manifesto.permissoes;
  if (ler === undefined || escrever === undefined) {
    throw new Error('[rotas] modulo.json:permissoes precisa declarar leitura e escrita');
  }
  return { ler, escrever };
}

function rotasObrigatorias(router, { deps, config }) {
  const { manifesto } = config;

  router.get('/health', (_req, res, next) => {
    deps.repositorio.contar()
      .then(() => res.json({ ok: true, modulo: manifesto.id }))
      .catch(next);
  });

  router.get('/meta', (_req, res) => {
    res.json(manifesto);
  });

  router.get('/resumo', (_req, res, next) => {
    deps.repositorio.contar()
      .then((total) => res.json({ total }))
      .catch(next);
  });
}

function rotasDeRegistros(router, { deps, config }) {
  const { ler, escrever } = permissoesDe(config);

  router.get('/registros', exigirPermissao(ler), (req, res, next) => {
    Promise.resolve()
      .then(() => lerPaginacao(req.query, config))
      .then(([pagina, tamanho]) => deps.repositorio.listar(pagina, tamanho))
      .then((r) => res.json(paraColecao(r.itens, r.pagina, r.tamanho, r.total)))
      .catch(next);
  });

  router.get('/registros/:hash', exigirPermissao(ler), (req, res, next) => {
    deps.repositorio.buscarPorHash(req.params.hash)
      .then((registro) => {
        if (registro === null) throw new ErroApi('NAO_ENCONTRADO', 'registro nao encontrado');
        res.json(paraContrato(registro));
      })
      .catch(next);
  });

  router.post('/registros', exigirPermissao(escrever), (req, res, next) => {
    Promise.resolve()
      .then(() => criar(req.body, deps, config, req.requestId))
      .then((registro) => res.status(201).json(paraContrato(registro)))
      .catch((causa) => next(traduzir(causa)));
  });
}

async function criar(corpo, deps, config, requestId) {
  const entrada = lerCorpo(corpo);
  const registro = montarRegistro(
    entrada,
    config.dominio.statusValidos,
    deps.geradorId.hash(),
    deps.relogio.agora(),
  );
  await deps.repositorio.inserir(registro);
  await deps.auditoria.registrar({
    hash: registro.hash,
    acao: 'criar',
    sujeito: 'sistema',
    camposAlterados: Object.keys(registro),
    requestId,
  });
  return registro;
}

/** Erro de dominio e erro do CLIENTE: a borda o traduz para VALIDACAO (specs/arquitetura/02-contrato-e-dados.md §3.2). */
function traduzir(causa) {
  if (causa instanceof ErroDeValidacao) return new ErroApi('VALIDACAO', causa.message);
  return causa;
}

export function criarRotas(opcoes) {
  const router = Router();
  rotasObrigatorias(router, opcoes);
  rotasDeRegistros(router, opcoes);
  return router;
}
