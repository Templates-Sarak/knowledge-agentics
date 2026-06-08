---
name: padrao-typescript
description: Camada TypeScript/JavaScript (Nível 2) do padrão Sarak — idiomas TS/JS e um validador de limiares (scripts/validate.mjs, via API do compilador TS). Use ao escrever, revisar ou validar código TS/JS. Regras universais em padrao-escrita.
---

# Skill: Padrão TypeScript/JavaScript (Nível 2)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Traduz o padrão universal (`padrao-escrita`) para a **família JS/TS**: idiomas + um **validador
executável** que verifica os limiares objetivos em `.ts/.tsx/.js/.jsx` e produz um JSON consumível pelo
`code-diagnostico` e pelo futuro hook. TS é tratado como superset; **JS = TS sem tipos** (a regra de
tipagem é N/A em arquivos JS).

> Regras universais (SRP, zero hardcoded, segredos, modularidade, testes…) vivem em `padrao-escrita`
> e no `CLAUDE.md`. Esta skill **não as redefine** — só dá a forma TS/JS e a automação.

## Quando usar
- Proativa: ao escrever ou revisar **código TypeScript ou JavaScript**.
- Ao validar conformidade de um arquivo/pasta TS/JS (rodar o validador).
- Como motor das dimensões mecânicas quando o `code-diagnostico` roda sobre um alvo TS/JS.

## Idiomas TS/JS do padrão
- **Arquivos** em `kebab-case.ts`/`camelCase.ts` (módulos) e `PascalCase.tsx` (componentes); **classes/tipos/componentes** em `PascalCase`; **funções/variáveis** em `camelCase`; **constantes** em `UPPER_CASE`.
- **Tipos:** `strict: true` no `tsconfig`; tipar assinaturas públicas; evitar `any`. **Em JS** a tipagem é N/A (opcional via JSDoc) — o validador não cobra tipo em `.js/.jsx`.
- **Contrato camelCase:** o contrato de API já é camelCase nativo aqui — sem conversão de casing (diferente do backend Python).
- **Tooling complementar:** `eslint` + `prettier` recomendados; o **validador próprio** é a fonte de verdade dos nossos limiares.

## Validador — `scripts/validate.mjs`
Usa a **API do compilador TypeScript** (parseia `.ts` e `.js`); thresholds em `scripts/config.json` (zero hardcoded).

```
node scripts/validate.mjs <arquivo-ou-pasta> [--config scripts/config.json]
```
**Dependência:** pacote `typescript`, resolvido **a partir do projeto-alvo** (ou do cwd). Se faltar, o script avisa `npm i -D typescript` e sai com código 2.
Saída: JSON `{ "alvo", "violacoes": [ {caminho, linha, dimensao, severidade, risco, descricao, regra, confianca} ] }`.

**Dimensões detectadas (mecânicas):**
- `limiares` — função/arrow/método > maxFunctionLines, aninhamento > maxNesting, params > maxParams.
- `logging` — `console.*`; `catch {}` vazio (exceção engolida).
- `tipagem` — função pública sem tipo de retorno/parâmetros (**só `.ts/.tsx`**).
- `segredos` — literal string em nome sensível (`token`, `apiKey`, `password`…) → severidade **alta**.
- `hardcoded` (heurística) — número mágico fora do allowlist (e fora de constante `UPPER_CASE`) e URL/host literal → `confianca: "baixa"`.

Julgamento (SRP, acoplamento, "é segredo de verdade?") **não** é do validador — fica com o agente/`code-diagnostico`.

## Regras e limites
- **NÃO** trate `confianca: "baixa"` (hardcoded heurístico) como verdade absoluta — é candidato a revisão.
- **NÃO** cobre tipagem em arquivos `.js/.jsx` — lá a regra é N/A (JS não tem tipos).
- **NÃO** embuta limiares no script — todos vêm de `config.json`.
- **NÃO** redefina as regras universais aqui — em dúvida, leia `padrao-escrita`.
- **NÃO** saia do escopo: dimensões de julgamento são consolidadas pelo `code-diagnostico`, não pelo validador.

## Checklist "pronta"
- [ ] Arquivos/identificadores no casing certo (camelCase, PascalCase p/ componentes, UPPER_CASE p/ const)?
- [ ] `tsconfig` com `strict: true`; assinaturas públicas tipadas (sem `any`)?
- [ ] `validate.mjs` roda resolvendo o `typescript` do projeto e lê limiares do `config.json`?
- [ ] Saída do validador é JSON no formato de dimensões do `backlog-format.md`?
- [ ] Tipagem não cobrada em `.js/.jsx`; hardcoded heurístico com `confianca: "baixa"`?

## Referências (Camada 3 — leia sob demanda)
- `references/idioms.md` — idiomas TS/JS detalhados e o mapeamento regra-universal → forma TS/JS / como o validador detecta.
- `scripts/validate.mjs` + `scripts/config.json` — o validador e seus parâmetros.
