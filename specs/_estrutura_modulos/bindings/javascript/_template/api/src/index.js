// Bootstrap da api do modulo <modulo>. Lei dona: specs/arquitetura/01-modulo.md §5.
//
// REGRA CENTRAL: este arquivo RECEBE os adapters ja instanciados — nunca os cria e nunca importa
// `adapters/*` nem SDK de fornecedor. Quem escolhe o provedor e a raiz de composicao, lendo
// config/ports.json. E o que permite trocar de banco editando um JSON.
import express from 'express';

import { loadConfiguration, envRequired } from './config.js';
import { createLogger } from './logger.js';
import { createRoutes } from './routes/index.js';
import {
  authentication,
  cors,
  securityHeaders,
  rateLimit,
  requestId,
  errorHandler,
} from './middlewares/index.js';

/**
 * Monta o modulo num Express. Usado pela raiz de composicao E pelos testes de contrato.
 *
 * `root` e a pasta do modulo, quando quem monta o app ja a conhece — a raiz de composicao
 * (specs/arquitetura/00-arquitetura.md §3.4). Sem isto, `loadConfiguration()` resolve pelo cwd
 * do PROCESSO, que so bate com a pasta do modulo em execucao standalone; a raiz compoe varios
 * modulos no mesmo processo, cwd nenhum serve para todos ao mesmo tempo.
 * @param {{ deps: import('../../core/ports/index.js').DependenciasModulo, auth: import('../../core/ports/index.js').Auth, raiz?: string }} opcoes
 */
export function createApp({ deps, auth, raiz }) {
  const config = loadConfiguration(raiz);
  const { seguranca, manifesto } = config;
  const logger = createLogger({
    modulo: manifesto.id,
    nivelMinimo: config.api.nivelLog,
    camposSensiveis: manifesto.camposSensiveis,
  });

  // COMPOSTO (raiz passada pela raiz de composicao) x STANDALONE (dev isolado, testes de contrato).
  // A raiz de composicao MONTA este app sob a propria rotaBase (`app.use(manifesto.rotaBase, app)`)
  // — e o Express, ao montar por caminho, ja STRIPA esse prefixo do request antes de entrar aqui.
  // Reaplicar o prefixo por dentro duplicaria — nenhuma rota casaria (404). Pior: SEM mudar nada
  // aqui, o app inteiro (auth incluida) responderia por QUALQUER caminho que chegasse a ele antes
  // de "no match" — inclusive o de OUTRO modulo — porque middleware sem caminho roda sempre, e
  // "auth nega por padrao" negaria a rota publica do vizinho antes mesmo dele ser alcancado
  // (medido: 401 num modulo composto em segundo, so por causa do primeiro montado antes dele).
  // Standalone nao tem esse prefixo tirado por ninguem — o path chega inteiro, e o app precisa
  // aplicar `manifesto.rotaBase` ele mesmo, como sempre fez.
  const composto = raiz !== undefined;
  const prefixo = composto ? '/' : manifesto.rotaBase;

  const app = express();
  app.use(express.json({ limit: `${config.api.corpoMaximoKb}kb` }));
  app.use(requestId(() => deps.geradorId.hash()));
  app.use(securityHeaders(seguranca.headers));
  app.use(cors(seguranca.cors));
  app.use(rateLimit(seguranca.rateLimit));
  app.use(authentication(auth, manifesto.rotasPublicas, composto ? '' : manifesto.rotaBase));
  app.use(prefixo, createRoutes({ deps, config }));
  app.use(errorHandler(logger));

  return app;
}

/**
 * Execucao standalone — dev do modulo isolado e modulo ja extraido.
 * No monolito modular quem sobe e a raiz de composicao; aqui a porta vem do ambiente, e a falta
 * dela DERRUBA o boot (specs/arquitetura/01-modulo.md §4.3).
 */
export function start(opcoes) {
  const config = loadConfiguration();
  const logger = createLogger({
    modulo: config.manifesto.id,
    nivelMinimo: config.api.nivelLog,
    camposSensiveis: config.manifesto.camposSensiveis,
  });
  const porta = Number(envRequired('<MODULO>_API_PORT'));

  createApp(opcoes).listen(porta, () => {
    logger.info('api no ar', { porta, rotaBase: config.manifesto.rotaBase });
  });
}
