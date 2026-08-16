#!/usr/bin/env node
/**
 * validate.mjs — a INTERFACE do gate. Lei dona: specs/arquitetura/04-regras.md
 *
 *   node tools/gate/validate.mjs <caminho-do-modulo>   valida UM modulo
 *   node tools/gate/validate.mjs --todos               todos + regras globais
 *   node tools/gate/validate.mjs --extracao <caminho>  a estrutura permite extrair?
 *   node tools/gate/validate.mjs --json <caminho>      saida para maquina
 *
 * A unidade de verificacao e o MODULO, nunca o repositorio: e o que permite ao modulo extraido
 * continuar verificavel no repositorio novo dele (specs/arquitetura/03-operacao.md §7).
 * Sai com 0 se nao houver erro, 1 caso contrario. Aviso nao reprova.
 *
 * Este arquivo so cuida de argumento, saida e exit code — as regras vivem em `engine.mjs`.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acharRaizProjeto, carregarContexto, carregarExcecoes, carregarProjeto, listarModulos } from './context.mjs';
import { ALVO_RAIZ, analisar } from './engine.mjs';

function aplicarExcecoes(achados, excecoes) {
  const perdoada = (a) => excecoes.validas.some((e) => e.modulo === a.modulo && e.regra === a.regra);
  return achados.filter((a) => !perdoada(a));
}

function imprimirHumano(achados, alvos, excecoesInvalidas) {
  for (const invalida of excecoesInvalidas) {
    process.stdout.write(`  ! excecao invalida (${invalida.modulo}/${invalida.regra}): ${invalida.porqueInvalida}\n`);
  }
  for (const alvo of alvos) {
    const meus = achados.filter((a) => a.modulo === alvo);
    const erros = meus.filter((a) => a.nivel === 'erro');
    const avisos = meus.filter((a) => a.nivel === 'aviso');
    process.stdout.write(`\n${alvo}: ${erros.length} erro(s), ${avisos.length} aviso(s)\n`);
    for (const item of [...erros, ...avisos]) {
      const marca = item.nivel === 'erro' ? 'x' : '!';
      process.stdout.write(`  ${marca} [${item.regra}] ${item.mensagem}\n`);
    }
  }
}

function resolverAlvo(argumento, raizPadrao) {
  const bruto = isAbsolute(argumento) ? argumento : resolve(process.cwd(), argumento);
  if (existsSync(join(bruto, 'module.json'))) return bruto;
  const porNome = join(raizPadrao, 'modules', argumento);
  if (existsSync(join(porNome, 'module.json'))) return porNome;
  return null;
}

function lerArgumentos() {
  const brutos = process.argv.slice(2);
  return {
    todos: brutos.includes('--todos'),
    json: brutos.includes('--json'),
    extracao: brutos.includes('--extracao'),
    caminho: brutos.find((a) => !a.startsWith('--')) ?? null,
  };
}

/**
 * Os blocos que a saída imprime. A raiz entra como alvo próprio SEMPRE que houver projeto —
 * inclusive com zero achado, e é de propósito: bloco ausente seria indistinguível de "a raiz não
 * foi analisada", que é a confusão que este gate existe para impedir. Sem `modules/` não há raiz de
 * projeto a analisar (módulo solto), e aí o bloco não aparece porque não haveria o que afirmar.
 *
 * Em `--extracao` ele também não aparece: ali `analisar` filtra para `REGRAS_DE_EXTRACAO`, nenhuma
 * regra de raiz sobrevive ao filtro, e um bloco vazio afirmaria uma verificação que não houve. A
 * pergunta da extração é sobre o MÓDULO, não sobre a raiz que ele vai deixar para trás.
 */
function alvosDaSaida(opcoes, selecionados, raizProjeto) {
  const modulos = selecionados.map((c) => c.idPasta);
  const temRaiz = opcoes.extracao !== true && carregarProjeto(raizProjeto).ehProjeto;
  return temRaiz ? [ALVO_RAIZ, ...modulos] : modulos;
}

function reportar(opcoes, contextos, selecionados, raizProjeto) {
  const excecoes = carregarExcecoes(raizProjeto);
  const achados = aplicarExcecoes(analisar(contextos, selecionados, opcoes), excecoes);
  const erros = achados.filter((a) => a.nivel === 'erro');

  if (opcoes.json) {
    process.stdout.write(`${JSON.stringify({ achados, erros: erros.length }, null, 2)}\n`);
    return erros.length > 0 ? 1 : 0;
  }

  const alvos = alvosDaSaida(opcoes, selecionados, raizProjeto);
  imprimirHumano(achados, alvos, excecoes.invalidas);
  const rotulo = opcoes.extracao ? 'extracao' : 'conformidade';
  const unidades = alvos.length > selecionados.length
    ? `${selecionados.length} modulo(s) + a raiz`
    : `${selecionados.length} modulo(s)`;
  process.stdout.write(
    erros.length === 0
      ? `\n${rotulo}: OK — ${unidades}, 0 erro(s)\n`
      : `\n${rotulo}: REPROVADO — ${erros.length} erro(s)\n`,
  );
  return erros.length > 0 ? 1 : 0;
}

function principal() {
  const opcoes = lerArgumentos();
  const aqui = dirname(fileURLToPath(import.meta.url));
  const partida = opcoes.caminho !== null ? resolve(process.cwd(), opcoes.caminho) : join(aqui, '..', '..');
  const raizProjeto = acharRaizProjeto(partida);

  const alvo = opcoes.todos ? null : resolverAlvo(opcoes.caminho ?? '', raizProjeto);
  if (!opcoes.todos && alvo === null) {
    process.stderr.write('uso: validate.mjs <caminho-do-modulo> | --todos | --extracao <caminho>\n');
    return 1;
  }

  // O alvo entra mesmo se estiver fora de `modules/` — e o que permite validar o molde de um
  // binding dentro do proprio repositorio do template (ADR-006).
  const pastas = listarModulos(raizProjeto);
  if (alvo !== null && !pastas.includes(alvo)) pastas.push(alvo);
  if (pastas.length === 0) {
    process.stderr.write(`erro: nenhum modulo encontrado em ${join(raizProjeto, 'modulos')}\n`);
    return 1;
  }

  const contextos = pastas.map((pasta) => carregarContexto(pasta, raizProjeto));
  const selecionados = opcoes.todos ? contextos : contextos.filter((c) => c.raiz === alvo);
  return reportar(opcoes, contextos, selecionados, raizProjeto);
}

process.exit(principal());
