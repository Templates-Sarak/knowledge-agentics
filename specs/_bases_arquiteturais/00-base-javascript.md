---
tipo: "arquitetura"
titulo: "Arquitetura Base: JavaScript"
dominio: "Infraestrutura / Design"
status: "🟢 Vigente"
tags: ["arquitetura", "javascript", "binding"]
relacionados: ["[[00-arquitetura]]", "[[04-regras]]", "[[00-base-typescript]]"]
---

# 1. Propósito

A fundação **da linguagem** neste repositório: stack, ferramental e convenções de JavaScript.

> **O que este documento NÃO define:** a arquitetura de módulos. Anatomia, manifesto, contrato, dados e
> isolamento são das leis vizinhas em `specs/arquitetura/` — `00-arquitetura.md` a `04-regras.md`. Aqui está
> só o que **muda por linguagem**.

**Quando escolher este binding em vez do TypeScript.** Só quando há motivo real: um projeto que não pode
compilar, uma equipe sem TS, um alvo que roda o fonte direto. **Na dúvida, use `typescript`** — a anatomia é
idêntica e a verificação de tipos é mais forte.

# 2. Onde a lei vira código

**Tabela do repositório da base** (`knowledge-agentics`) — os caminhos abaixo não existem no projeto gerado;
ele recebe o *conteúdo* de cada linha, não a árvore do template.

| Camada | Onde, na base | Papel |
|---|---|---|
| Lei (agnóstica) | `specs/_estrutura_modulos/doutrina/00-arquitetura.md` … `04-regras.md` (instalada no projeto como `specs/arquitetura/`) | o que vale em qualquer linguagem |
| **Binding** | `specs/_estrutura_modulos/bindings/javascript/` | como a lei se materializa aqui |
| Molde de módulo | `specs/_estrutura_modulos/bindings/javascript/_template/` | validado pelo gate **como módulo real** (ADR-006) |
| Esqueleto de raiz | `specs/_estrutura_modulos/bindings/javascript/root/` | `packages/ports`, `adapters/memory`, `src/composicao` |

Módulo novo **não se escreve à mão**: `node tools/create-module.mjs <id> --role domain --binding javascript`,
conduzido pela skill `code-modulo`.

# 3. Skills obrigatórias

| Skill | Papel |
|---|---|
| `padrao-escrita` | **Nível 0** — SRP, limiares, zero hardcoded, segredos, erro, log, testes |
| `padrao-typescript` | **Nível 2** — a camada TS/JS cobre as duas; o validador parseia `.js` também |

O **Nível 1** (arquitetura de módulos) é cobrado por máquina: `node tools/gate/validate.mjs`.

# 4. Stack

- **Linguagem**: JavaScript ESM (`type: "module"`). Node.js no backend, React no front.
- **Tipagem**: **JSDoc verificado por `tsc --checkJs`** — não é opcional. Sem ela, a fronteira pública fica
  sem contrato e o `jsconfig.json` do esqueleto perde a razão de existir.
- **Paradigma**: injeção de dependências pelo bootstrap — o módulo **recebe** os adapters, nunca os cria.
- **Gerenciador de pacotes**: `npm`. **API**: Express. **Front**: Vite + React. **Testes**: Vitest.

# 5. Qualidade e tooling

| Verificação | Comando |
|---|---|
| Tudo, na ordem certa | `npm run verify` — gate + `.env.example` + `tsc --checkJs` + testes |
| Só conformidade de arquitetura | `node tools/gate/validate.mjs --todos` |
| Limiares e idiomas | `<SARAK_NODE_BIN>/eslint` · validador da `padrao-typescript` |
| Testes de um módulo | `npm test -w modules/<id>` — com adapters de memória, **sem rede e sem banco** |

Cobertura-alvo ~80% nos caminhos críticos — **alvo de equipe, não regra**.

# 6. Segurança

- Zero segredo hardcoded (`cyber-segredos`). Segredo só em `.env`, nunca em `config/*.json` (versionado).
- `.env.example` é **gerado** de `module.json:requiredEnv` (`node tools/sync-env.mjs`).
- Variável exposta ao browser leva o prefixo do build (`VITE_`) e **nunca** contém chave ou token.
