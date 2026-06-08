# CLAUDE.md — Padrões do ecossistema Sarak

> Gancho sempre-ativo, na **raiz do projeto**. Enuncia os inegociáveis em forma compacta e **aponta** para a
> fonte da verdade — não duplica conteúdo. A base de inteligência Sarak (skills/commands/agents/hooks) é
> **copiada para `.claude/`** do projeto; o **manual do diretório** é **`.claude/README.md`**. Detalhe do padrão
> na skill **`padrao-escrita`** (`.claude/skills/padrao-escrita/SKILL.md` → `references/PADRAO-ORGANIZACAO.md`).
>
> Equivalente em outros provedores: no Antigravity, replicar este gancho em `GEMINI.md` (global) ou
> `.agents/rules/` (workspace), apontando para a mesma skill.

## Inegociáveis (Nível 0 — qualquer linguagem)
- **SRP**: módulo, arquivo e função com uma responsabilidade.
- **Limiares**: função ≤ 40 linhas, aninhamento ≤ 3, ≤ 4 parâmetros, guard clauses.
- **Zero hardcoded**: tunables não-secretos em `config.json` (por módulo); segredos/ambiente em `.env`.
- **Segredos**: `.env` no `.gitignore`, `.env.example` versionado, variáveis prefixadas por módulo.
- **Scripts**: uma responsabilidade, parametrizados, I/O claro.

## Inegociáveis (Nível 1 — organização microservice-ready)
- **Módulo = domínio**; pasta por módulo, mesmo nome (kebab-case) em `backend/` e `frontend/`.
- **Encapsulamento**: consome só o `api/` (contrato) de outro módulo — nunca `domain/`/`data/`.
- **Comunicação**: contrato + adaptador (local→rede sem mexer no consumidor).
- **Dados**: banco compartilhado disciplinado, tabelas prefixadas pelo módulo; sem JOIN cross-módulo.
- **API**: REST `/api/v1/`, plural kebab-case, sem verbos; contrato em camelCase.
- **`shared/`**: só contratos/tipos, zero lógica.

## Como trabalhar
- A base vive em **`.claude/`** (skills/commands/agents/hooks); o **manual** (o que é cada bloco + como criar) é **`.claude/README.md`**.
- Toda skill/command/agent **referencia** estes padrões — nunca os duplica.
- Em dúvida sobre estrutura/organização, leia `.claude/skills/padrao-escrita/references/PADRAO-ORGANIZACAO.md`.
- **Fluxos prontos** (commands): adequar legado ao padrão → `/code1-auditar` → `/code2-caracterizar` → `/code3-adequar`;
  segurança → `/cyber1-auditar` → `/cyber2-adequar`; histórico git → `/git1-auditar` → `/git2-adequar`.
- Criar/revisar **skill** → `meta-create-skill` (ou `/meta-criar-skill`); criar **command/agent/hook** → siga `.claude/README.md`.
- **Ativar os hooks** no projeto: mescle `.claude/hooks/settings.template.json` no `.claude/settings.json` (+ instale as ferramentas externas do `.claude/hooks/README.md`).
