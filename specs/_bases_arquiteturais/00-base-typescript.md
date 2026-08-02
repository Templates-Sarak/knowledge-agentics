---
tipo: "arquitetura"
titulo: "Arquitetura Base: TypeScript"
dominio: "Infraestrutura / Design"
status: "🟢 Vigente"
tags: ["arquitetura", "typescript", "binding"]
relacionados: ["[[00-arquitetura]]", "[[04-regras]]", "[[00-contexto]]"]
---

# 1. Propósito

A fundação **da linguagem** neste repositório: stack, ferramental e convenções de TypeScript.

> **O que este documento NÃO define:** a arquitetura de módulos. Anatomia, manifesto, contrato, dados e
> isolamento são das leis vizinhas em `specs/arquitetura/` — `00-arquitetura.md` a `04-regras.md`. Aqui está
> só o que **muda por linguagem**. Regra em dois lugares diverge; esta é a metade que fala TypeScript.

# 2. Onde a lei vira código

O binding é a **materialização executável** desta base: um molde de módulo que compila, testa e passa no gate.

| Camada | Onde | Papel |
|---|---|---|
| Lei (agnóstica) | `specs/arquitetura/00-arquitetura.md` … `04-regras.md` | o que vale em qualquer linguagem |
| **Binding** | `specs/_estrutura_modulos/bindings/typescript/` | como a lei se materializa aqui |
| Molde de módulo | `bindings/typescript/_template/` | validado pelo gate **como módulo real** (ADR-006) |
| Esqueleto de raiz | `bindings/typescript/raiz/` | `packages/portas`, `adapters/memoria`, `src/composicao` |

Módulo novo **não se escreve à mão**: `node ferramentas/criar-modulo.mjs <id> --binding typescript`,
conduzido pela skill `code-modulo`.

# 3. Skills obrigatórias

| Skill | Papel |
|---|---|
| `padrao-escrita` | **Nível 0** — SRP, limiares, zero hardcoded, segredos, erro, log, testes |
| `padrao-typescript` | **Nível 2** — idiomas TS/JS + validador via API do compilador (`scripts/validate.mjs`) |

O **Nível 1** (arquitetura de módulos) é cobrado por máquina: `node ferramentas/gate/validar.mjs`.

# 4. Stack

- **Linguagem**: TypeScript `strict`. Node.js no backend, React no front.
- **Paradigma**: injeção de dependências pelo bootstrap — o módulo **recebe** os adapters, nunca os cria.
- **Gerenciador de pacotes**: `npm` (o esqueleto sai com workspaces configurados).
- **API**: Express. **Front**: Vite + React. **Testes**: Vitest.

# 5. Qualidade e tooling

O tooling de auditoria roda pelo **contexto global do Sarak**, sem poluir o `package.json` do projeto:

| Verificação | Comando |
|---|---|
| Tudo, na ordem certa | `npm run verificar` — gate + `.env.example` + `tsc` + testes |
| Só conformidade de arquitetura | `node ferramentas/gate/validar.mjs --todos` |
| Limiares e idiomas | `<SARAK_NODE_BIN>/eslint` · validador da `padrao-typescript` |
| Formatação | `<SARAK_NODE_BIN>/prettier` |
| Testes de um módulo | `npm test -w modulos/<id>` — rodam com adapters de memória, **sem rede e sem banco** |

Cobertura-alvo ~80% nos caminhos críticos — **alvo de equipe, não regra**: medi-la exige executar os testes,
e o gate é estático por contrato.

# 6. Segurança

- Zero segredo hardcoded (`cyber-segredos`). Segredo só em `.env`, nunca em `config/*.json` (versionado).
- `.env.example` é **gerado** de `modulo.json:envRequerido` — nunca editado à mão
  (`node ferramentas/sincronizar-env.mjs`).
- Variável exposta ao browser leva o prefixo do build (`VITE_`) e **nunca** contém chave ou token: o que vai
  para o browser é público, por definição.
