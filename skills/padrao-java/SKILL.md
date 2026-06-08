---
name: padrao-java
description: Camada Java (Nível 2) do padrão Sarak — idiomas Java e a aplicação dos limiares via Checkstyle configurado (assets/checkstyle.xml). Use ao escrever, revisar ou validar código Java. Regras universais em padrao-escrita.
---

# Skill: Padrão Java (Nível 2)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Traduz o padrão universal (`padrao-escrita`) para **Java**: idiomas da linguagem + a aplicação dos limiares
objetivos via **Checkstyle** (e, opcionalmente, PMD) com a configuração do ecossistema (`assets/checkstyle.xml`).

> Regras universais (SRP, zero hardcoded, segredos, modularidade, testes…) vivem em `padrao-escrita` e no
> `CLAUDE.md`. Esta skill **não as redefine** — dá a forma Java e a automação. Como em `padrao-go`, o
> validador é o **linter consagrado configurado** (não um validador próprio em AST).

## Quando usar
- Proativa: ao escrever ou revisar **código Java**.
- Ao validar conformidade de um módulo Java (rodar o Checkstyle com nosso config).

## Idiomas Java do padrão
- **Nomes**: classes/interfaces/enums em `PascalCase`; métodos/variáveis em `camelCase`; constantes em `UPPER_SNAKE_CASE`; pacotes minúsculos.
- **Exceções**: nunca **engolir** (`catch` vazio) — tratar, embrulhar ou propagar; exceções específicas, não `catch (Exception)`; `try-with-resources` para recursos.
- **Imutabilidade**: `final` onde possível; preferir objetos imutáveis; coleções imutáveis na fronteira.
- **Logging**: logger (SLF4J/Logback) — **nunca** `System.out.println` (ver `obs-logs`).
- **Null/Optional**: `Optional` em retornos onde ausência é válida; validar input na borda.

## Validador — Checkstyle + `assets/checkstyle.xml`
```
checkstyle -c assets/checkstyle.xml src/    # ou via plugin Maven/Gradle
```
O config aplica os **limiares do `padrao-escrita`**: `MethodLength` (≤ **40**), `ParameterNumber` (≤ **4**),
`NestedIfDepth` (≤ **3**), `CyclomaticComplexity`, `EmptyCatchBlock` (não engolir exceção), `MagicNumber`.
PMD pode complementar (regras de design). Se faltar, use o plugin `maven-checkstyle-plugin`/`gradle checkstyle`.

## Regras e limites
- **NUNCA** deixe `catch` vazio (engolir exceção) — `EmptyCatchBlock` cobra; trate/embrulhe/propague.
- **NUNCA** use `System.out.println` para log — logger estruturado (ver `obs-logs`).
- **NÃO** embuta limiar no código — vêm do `checkstyle.xml` (zero hardcoded de regra).
- **NÃO** redefina as regras universais aqui — em dúvida, leia `padrao-escrita`.
- **NÃO** saia do escopo: dimensões de julgamento (SRP, acoplamento, dados, API) são do `code-diagnostico`, não do linter.

## Checklist "pronta"
- [ ] Nomes idiomáticos (PascalCase classe, camelCase método, UPPER_SNAKE constante)?
- [ ] Sem `catch` vazio; exceções específicas; `try-with-resources` em recursos?
- [ ] Logger (SLF4J) em vez de `System.out`?
- [ ] `checkstyle -c checkstyle.xml` sem violar MethodLength/NestedIfDepth/ParameterNumber?
- [ ] `final`/imutabilidade onde aplicável; sem número mágico?

## Referências (Camada 3 — leia sob demanda)
- `references/idiomas.md` — idiomas Java detalhados e o mapeamento regra-universal → forma Java / regra Checkstyle que a cobre.
- `assets/checkstyle.xml` — configuração do Checkstyle com os limiares do `padrao-escrita`.
