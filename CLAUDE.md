# CLAUDE.md — Padrões do ecossistema Sarak

> Gancho sempre-ativo, na **raiz do projeto**. Enuncia os inegociáveis em forma compacta e **aponta** para a
> fonte da verdade — não duplica conteúdo. A base de inteligência Sarak (skills/commands/agents/hooks) é o
> repositório **`knowledge-agentics`**, consumido como o plugin `sarak` (ou espelhado por `plugin/sync_ide.py`);
> o **manual do diretório** é o **`README.md` da raiz da base**. Detalhe do padrão de escrita na skill
> **`padrao-escrita`** (`skills/padrao-escrita/SKILL.md`).
>
> Equivalente em outros provedores: no Antigravity, replicar este gancho em `GEMINI.md` (global) ou
> `.agents/rules/` (workspace), apontando para a mesma skill.

## Inegociáveis (Nível 0 — qualquer linguagem)
- **SRP**: módulo, arquivo e função com uma responsabilidade.
- **Limiares**: função ≤ 40 linhas, aninhamento ≤ 3, ≤ 4 parâmetros, guard clauses.
- **Zero hardcoded**: tunables não-secretos na config versionada; segredos e valores por-ambiente no `.env`. Nunca um default de infraestrutura embutido.
- **Segredos**: `.env` no `.gitignore`, `.env.example` versionado, variáveis prefixadas por módulo.
- **Scripts**: uma responsabilidade, parametrizados, I/O claro.

## Inegociáveis (Nível 1 — arquitetura de módulos)
- **O princípio** — o único que este gancho afirma: **a fronteira física de pastas É a fronteira de dependência**. Extrair um módulo é copiar uma pasta e recortar chaves `<MODULO>_*` do `.env`, nunca reescrever import.
- **A lei não está aqui, e não deve ser reproduzida aqui**: o catálogo normativo é o `04-regras.md` — na base, `specs/_estrutura_modulos/doutrina/04-regras.md`; no projeto instanciado, `specs/arquitetura/04-regras.md`. Regra que não está lá não é regra.
- **Cobrada por máquina**, não de cabeça: `node tools/gate/validate.mjs --todos` (ou `<caminho-do-modulo>` para um só).
- **Só se aplica a projeto que adota o template de módulos** (`specs/_estrutura_modulos/README.md`). Sem o template, vale o Nível 0 acima mais a `padrao-<linguagem>` — não improvise meia estrutura modular.

## Como trabalhar
- A base vive no repositório **`knowledge-agentics`** (skills/commands/agents/hooks); o **manual** (o que é cada bloco + como criar) é o **`README.md` da raiz dele**.
- Toda skill/command/agent **referencia** estes padrões — nunca os duplica.
- Em dúvida sobre **qual lei do Nível 1 responde a quê**, o mapa é `skills/padrao-escrita/references/PADRAO-ORGANIZACAO.md` — ele não descreve a anatomia de módulo, aponta para o documento que a descreve.
- **Fluxos prontos**: criar módulo ou sistema modular → skill `code-modulo`; inicializar repositório completo → skill `meta-iniciar-repositorio`;
  adequar legado ao padrão → `/code1-auditar` → `/code2-caracterizar` → `/code3-adequar`;
  segurança → `/cyber1-auditar` → `/cyber2-adequar`; histórico git → `/git1-auditar` → `/git2-adequar`.
- Criar/revisar **skill** → `meta-create-skill` (ou `/meta-criar-skill`); criar **command/agent/hook** → siga o `README.md` da base.
- **Ativar os hooks**: instalados com o plugin `sarak`, o wiring de `hooks/hooks.json` já entra ativo. No modo manual, mescle `hooks/settings.template.json` no `.claude/settings.json` do projeto (+ instale as ferramentas externas do `hooks/README.md`).
