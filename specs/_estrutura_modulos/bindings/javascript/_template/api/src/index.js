// Bootstrap da api do modulo <modulo>. Lei dona: doutrina/01-modulo.md §5.
//
// REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
// `adapters/*` nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
// config/portas.json. E o que permite trocar de banco editando um JSON.
import express from 'express';

import { carregarConfiguracao, envObrigatoria } from './config.js';
import { criarLogger } from './logger.js';
import { criarRotas } from './routes/index.js';
import {
  autenticacao,
  cors,
  headersDeSeguranca,
  rateLimit,
  requestId,
  tratadorDeErro,
} from './middlewares/index.js';

/**
 * Monta o modulo num Express. Usado pela raiz de composicao E pelos testes de contrato.
 * @param {{ deps: import('../../core/portas/index.js').DependenciasModulo, auth: import('../../core/portas/index.js').Auth }} opcoes
 */
export function criarApp({ deps, auth }) {
  const config = carregarConfiguracao();
  const { seguranca, manifesto } = config;
  const logger = criarLogger({
    modulo: manifesto.id,
    nivelMinimo: config.api.nivelLog,
    camposSensiveis: manifesto.camposSensiveis,
  });

  const app = express();
  app.use(express.json({ limit: `${config.api.corpoMaximoKb}kb` }));
  app.use(requestId(() => deps.geradorId.hash()));
  app.use(headersDeSeguranca(seguranca.headers));
  app.use(cors(seguranca.cors));
  app.use(rateLimit(seguranca.rateLimit));
  app.use(autenticacao(auth, manifesto.rotasPublicas, manifesto.rotaBase));
  app.use(manifesto.rotaBase, criarRotas({ deps, config }));
  app.use(tratadorDeErro(logger));

  return app;
}

/**
 * Execucao standalone — dev do modulo isolado e modulo ja extraido.
 * No monolito modular quem sobe e a raiz de composicao; aqui a porta vem do ambiente, e a falta
 * dela DERRUBA o boot (doutrina/01 §4.3).
 */
export function iniciar(opcoes) {
  const config = carregarConfiguracao();
  const logger = criarLogger({
    modulo: config.manifesto.id,
    nivelMinimo: config.api.nivelLog,
    camposSensiveis: config.manifesto.camposSensiveis,
  });
  const porta = Number(envObrigatoria('<MODULO>_API_PORT'));

  criarApp(opcoes).listen(porta, () => {
    logger.info('api no ar', { porta, rotaBase: config.manifesto.rotaBase });
  });
}
