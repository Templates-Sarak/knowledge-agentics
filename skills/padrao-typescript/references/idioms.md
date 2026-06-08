# Idiomas TS/JS + Mapeamento das Regras

Leia ao escrever TS/JS conforme o padrão ou ao interpretar a saída do `validate.mjs`. As regras
universais estão em `padrao-escrita`; aqui está a **forma TS/JS** de cada uma e **como o validador
a detecta**. TS é superset; **JS = TS sem tipos**.

---

## Idiomas

| Elemento | Convenção TS/JS |
|---|---|
| Arquivo de módulo | `kebab-case.ts` ou `camelCase.ts` |
| Componente | `PascalCase.tsx` |
| Classe / tipo / interface | `PascalCase` |
| Função / variável | `camelCase` |
| Constante | `UPPER_CASE` (número/string fixos aceitáveis; segredo/URL não) |
| Privado | prefixo `_` ou `#` (campo privado de classe) |

- **Tipos:** `tsconfig` com `strict: true`; tipar assinaturas públicas; evitar `any` (preferir `unknown` + narrowing).
- **JS:** sem tipos (opcionalmente JSDoc). O validador **não** cobra tipagem em `.js/.jsx`.
- **Contrato camelCase nativo:** no front/Node o contrato de API já é camelCase — não há conversão de casing
  (diferente do backend Python, que converte na borda).
- **Imports:** dependa só do `api/` de outro módulo, nunca de `domain/`/`data/` — ver `PADRAO-ORGANIZACAO.md`.

---

## Mapeamento regra → forma TS/JS → detecção do validador

| Regra (Nível 0) | Forma TS/JS | Detecção (`validate.mjs`, AST do TS) | Confiança |
|---|---|---|---|
| Função ≤ 40 linhas | `function`/arrow/método | linhas do nó (start→end) | alta |
| Aninhamento ≤ 3 | `if/for/while/switch/try` aninhados | profundidade de blocos de controle | alta |
| ≤ 4 parâmetros | parâmetros (menos `this`) | contagem de `parameters` | alta |
| Sem `console.*` (logger) | `console.log/error/...` | `CallExpression` em `console.<x>` | alta |
| Não engolir exceção | `catch {}` vazio | `CatchClause` com bloco sem statements | alta |
| Tipar fronteiras | função pública sem tipo (**TS**) | retorno/param sem `type` em `.ts/.tsx` | alta |
| Segredo em env | `const apiKey = "..."` | string literal em nome que casa `secretNamePatterns` | alta |
| Zero hardcoded | número mágico / URL | número fora do allowlist + fora de const `UPPER_CASE`; string com prefixo de URL | **baixa** (heurística) |

> Nomes são normalizados (lowercase, sem `_`/`-`) antes de casar com `secretNamePatterns` — então
> `API_KEY`, `apiKey` e `api_key` casam com o padrão `apikey`.

### Diferença TS × JS na detecção
- **Tipagem** só é avaliada em `.ts/.tsx`. Em `.js/.jsx` o validador pula essa dimensão (JS não tem tipos).
- Todas as outras dimensões valem igual para os dois (a sintaxe é a mesma família).

### Sobre a heurística de hardcoded (por que `confianca: baixa`)
- Número fora de `allowedMagicNumbers` pode ser legítimo; constantes `UPPER_CASE` são isentas.
- URLs/hosts são sinalizados mesmo como constante (são valores por-ambiente → `config.json`/`.env`).
- O agente / `code-diagnostico` decide o que é violação real e o que é falso positivo.

### O que o validador NÃO faz (fica com o agente / code-diagnostico)
- SRP, acoplamento entre módulos, tabelas cross-módulo, "é segredo de verdade?", cobertura de testes.

---

## Dependência e execução
- Precisa do pacote **`typescript`** — resolvido a partir do **projeto-alvo** (ou do cwd). Projetos TS/JS
  normalmente já o têm; se faltar: `npm i -D typescript`.
- **Tooling complementar:** `eslint`/`prettier` cobrem estilo genérico; o validador garante exatamente os
  limiares Sarak. Complementares, não substitutos.
