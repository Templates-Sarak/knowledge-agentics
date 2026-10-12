#!/usr/bin/env node
/**
 * validate.mjs — a INTERFACE do gate. Lei dona: specs/arquitetura/04-regras.md
 *
 *   node tools/gate/validate.mjs <caminho-do-modulo>   valida UM modulo
 *   node tools/gate/validate.mjs --all                  todos + regras globais
 *   node tools/gate/validate.mjs --extraction <caminho> a estrutura permite extrair?
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

import { findProjectRoot, loadContext, loadExceptions, loadProject, listModules } from './context.mjs';
import { ROOT_TARGET, analyze, serializeFinding } from './engine.mjs';

function applyExceptions(findings, exceptions) {
  const waived = (a) => exceptions.valid.some((e) => e.module === a.modulo && e.rule === a.regra);
  return findings.filter((a) => !waived(a));
}

function printHuman(findings, targets, invalidExceptions) {
  for (const invalid of invalidExceptions) {
    process.stdout.write(`  ! Invalid exception (${invalid.module}/${invalid.rule}): ${invalid.invalidBecause}\n`);
  }
  for (const target of targets) {
    const own = findings.filter((a) => a.modulo === target);
    const errors = own.filter((a) => a.nivel === 'erro');
    const warnings = own.filter((a) => a.nivel === 'aviso');
    process.stdout.write(`\n${target}: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
    for (const item of [...errors, ...warnings]) {
      const mark = item.nivel === 'erro' ? 'x' : '!';
      process.stdout.write(`  ${mark} [${item.regra}] ${item.mensagem}\n`);
    }
  }
}

function resolveTarget(argument, defaultRoot) {
  const raw = isAbsolute(argument) ? argument : resolve(process.cwd(), argument);
  if (existsSync(join(raw, 'module.json'))) return raw;
  const byName = join(defaultRoot, 'modules', argument);
  if (existsSync(join(byName, 'module.json'))) return byName;
  return null;
}

function readArguments() {
  const rawArgs = process.argv.slice(2);
  return {
    all: rawArgs.includes('--all'),
    json: rawArgs.includes('--json'),
    extraction: rawArgs.includes('--extraction'),
    caminho: rawArgs.find((a) => !a.startsWith('--')) ?? null,
  };
}

/**
 * Os blocos que a saída imprime. A raiz entra como alvo próprio SEMPRE que houver projeto —
 * inclusive com zero achado, e é de propósito: bloco ausente seria indistinguível de "a raiz não
 * foi analisada", que é a confusão que este gate existe para impedir. Sem `modules/` não há raiz de
 * projeto a analisar (módulo solto), e aí o bloco não aparece porque não haveria o que afirmar.
 *
 * Em `--extraction` ele também não aparece: ali `analisar` filtra para `EXTRACTION_RULES`, nenhuma
 * regra de raiz sobrevive ao filtro, e um bloco vazio afirmaria uma verificação que não houve. A
 * pergunta da extração é sobre o MÓDULO, não sobre a raiz que ele vai deixar para trás.
 */
function outputTargets(options, selected, projectRoot) {
  const modules = selected.map((c) => c.dirId);
  const hasRoot = options.extraction !== true && loadProject(projectRoot).isProject;
  return hasRoot ? [ROOT_TARGET, ...modules] : modules;
}

function report(options, contexts, selected, projectRoot) {
  const exceptions = loadExceptions(projectRoot);
  const findings = applyExceptions(analyze(contexts, selected, options), exceptions);
  const errors = findings.filter((a) => a.nivel === 'erro');

  if (options.json) {
    process.stdout.write(JSON.stringify({
      findings: findings.map(serializeFinding),
      errorCount: errors.length,
    }, null, 2) + '\n');
    return errors.length > 0 ? 1 : 0;
  }

  const targets = outputTargets(options, selected, projectRoot);
  printHuman(findings, targets, exceptions.invalid);
  const label = options.extraction ? 'extraction' : 'conformance';
  const units = targets.length > selected.length
    ? `${selected.length} module(s) + the root`
    : `${selected.length} module(s)`;
  process.stdout.write(
    errors.length === 0
      ? `\n${label}: OK — ${units}, 0 error(s)\n`
      : `\n${label}: FAILED — ${errors.length} error(s)\n`,
  );
  return errors.length > 0 ? 1 : 0;
}

function main() {
  const options = readArguments();
  const here = dirname(fileURLToPath(import.meta.url));
  const start = options.caminho !== null ? resolve(process.cwd(), options.caminho) : join(here, '..', '..');
  const projectRoot = findProjectRoot(start);

  const target = options.all ? null : resolveTarget(options.caminho ?? '', projectRoot);
  if (!options.all && target === null) {
    process.stderr.write('Usage: validate.mjs <module-path> | --all | --extraction <module-path>\n');
    return 1;
  }

  // O alvo entra mesmo se estiver fora de `modules/` — e o que permite validar o molde de um
  // binding dentro do proprio repositorio do template (ADR-006).
  const dirs = listModules(projectRoot);
  if (target !== null && !dirs.includes(target)) dirs.push(target);
  if (dirs.length === 0) {
    process.stderr.write(`Error: no modules found in ${join(projectRoot, 'modules')}\n`);
    return 1;
  }

  const contexts = dirs.map((dir) => loadContext(dir, projectRoot));
  const selected = options.all ? contexts : contexts.filter((c) => c.raiz === target);
  return report(options, contexts, selected, projectRoot);
}

process.exit(main());
