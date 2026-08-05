// Raiz de composicao — o WIRING, e nada alem. Lei dona: specs/arquitetura/00-arquitetura.md §3.4.
//
// O que este arquivo faz:
//   1. DESCOBRE os modulos lendo modulos/*/modulo.json — nao existe lista fixa de modulos no codigo;
//   2. resolve as portas de cada um a partir do config/portas.json DELE;
//   3. INJETA os adapters e monta cada api/ sob a rotaBase do manifesto.
//
// O que ele NAO faz: regra de negocio. Nenhum modulo importa daqui, e nada aqui conhece o
// dominio de modulo nenhum. Acrescentar um modulo nao pode exigir editar este arquivo.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  criarAuditoria,
  criarAuthQueNega,
  criarGeradorId,
  criarRelogio,
  criarRepositorio,
} from '../adapters/memoria/index.js';
import type { Auth } from '../packages/portas/index.js';

export interface ManifestoDescoberto {
  id: string;
  nome: string;
  rotaBase: string;
  papel: string;
  portas: string[];
  pasta: string;
}

/** Fabrica de adapter por (porta, provedor). Acrescentar provedor e acrescentar linha AQUI, so. */
const FABRICAS: Record<string, Record<string, () => unknown>> = {
  repositorio: { memoria: () => criarRepositorio() },
  auditoria: { memoria: () => criarAuditoria() },
  relogio: { sistema: () => criarRelogio() },
  geradorId: { padrao: () => criarGeradorId() },
};

/** Le todos os manifestos. E a DESCOBERTA: o sistema conhece os modulos por declaracao, nao por import. */
export function descobrirModulos(raiz: string): ManifestoDescoberto[] {
  const base = join(raiz, 'modulos');
  if (!existsSync(base)) return [];

  return readdirSync(base)
    .filter((nome) => !nome.startsWith('_'))
    .filter((nome) => existsSync(join(base, nome, 'modulo.json')))
    .map((nome) => {
      const pasta = join(base, nome);
      const manifesto = JSON.parse(readFileSync(join(pasta, 'modulo.json'), 'utf8')) as ManifestoDescoberto;
      return { ...manifesto, pasta };
    });
}

/**
 * Resolve as portas declaradas por um modulo, lendo a ESCOLHA em config/portas.json dele.
 * Porta declarada sem provedor conhecido derruba o boot — melhor falhar aqui que servir errado.
 */
export function resolverDependencias(modulo: ManifestoDescoberto): Record<string, unknown> {
  const escolhas = JSON.parse(readFileSync(join(modulo.pasta, 'config', 'portas.json'), 'utf8')) as Record<
    string,
    string
  >;
  const dependencias: Record<string, unknown> = {};

  for (const porta of modulo.portas) {
    const provedor = escolhas[porta];
    const fabrica = FABRICAS[porta]?.[provedor ?? ''];
    if (fabrica === undefined) {
      throw new Error(
        `[composicao] ${modulo.id}: porta "${porta}" com provedor "${provedor}" sem fabrica registrada`,
      );
    }
    dependencias[porta] = fabrica();
  }
  return dependencias;
}

/**
 * Auth do sistema. Enquanto nao houver login, NEGA tudo — as rotas que precisam funcionar sem
 * token estao declaradas em `rotasPublicas` de cada modulo, e so elas passam.
 */
export function resolverAuth(): Auth {
  return criarAuthQueNega();
}
