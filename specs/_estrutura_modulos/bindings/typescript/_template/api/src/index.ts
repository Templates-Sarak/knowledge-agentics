// Bootstrap da api do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §5.
//
// REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
// `adapters/*` nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
// config/portas.json. E o que permite trocar Postgres por outro banco editando um JSON.
import express, { type Express } from 'express';

import { carregarConfiguracao, envObrigatoria } from './config.js';
import type { DependenciasModulo } from '../../core/portas/index.js';
import { criarLogger } from './logger.js';
import { criarRotas } from './routes/index.js';
import {
  type Auth,
  autenticacao,
  cors,
  headersDeSeguranca,
  rateLimit,
  requestId,
  tratadorDeErro,
} from './middlewares/index.js';

export interface OpcoesModulo {
  deps: DependenciasModulo;
  auth: Auth;
}

/** Monta o modulo num Express. Usado pela raiz de composicao E pelos testes de contrato. */
export function criarApp({ deps, auth }: OpcoesModulo): Express {
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
 * dela DERRUBA o boot (specs/arquitetura/01-modulo.md §4.3).
 */
export function iniciar(opcoes: OpcoesModulo): void {
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
