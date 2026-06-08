---
description: Fase 1 de segurança — auditoria de conformidade dos 7 domínios cyber (fan-out de um cyber-auditor por domínio, ferramenta externa primeiro) e entrega o relatório consolidado em .sarak/security/. Estático por padrão; DAST só com URL autorizada. Read-only sobre o código-fonte.
argument-hint: [alvo]
allowed-tools: Task, Write, Read, Glob, Bash
---

# /cyber1-auditar — Fase 1: auditoria de segurança (7 domínios)

Alvo: **$1** (se vazio, use o diretório atual `.`).

Você é o **orquestrador** da auditoria de segurança. Dispara **um agente `cyber-auditor` por domínio** (7),
consolida o **relatório de segurança** e **persiste** em `.sarak/security/`. A **lógica por domínio** é das skills
`cyber-*`; o **formato** é `cyber-config` (`references/achados-format.md` + `assets/relatorio_seguranca.md`).
**Não toca no código-fonte** — só escreve artefatos de auditoria.

## Pré-requisitos (ferramentas externas — degradação graciosa)
gitleaks (segredos) · npm audit/pip-audit/osv-scanner (deps) · Semgrep/Bandit/gosec (SAST) · testssl.sh/nuclei (DAST).
Ausente → o `cyber-auditor` cai no script Sarak/julgamento e **registra a lacuna** (não trava, não inventa).

## Passos

1. **Autorização do DAST (HITL)** — pergunte ao usuário: **"Há uma URL própria/autorizada para teste ativo
   (config/api)? Informe a URL, ou confirme pular o DAST."** O estático **sempre** roda; o ativo **só** com
   autorização explícita. **Nunca** sondar alvo de terceiros.

2. **Fan-out (um `cyber-auditor` por domínio)** — dispare, via **Task** (Sonnet, **estático**), um agente para
   cada domínio: `segredos, dependencias, codigo, auth, api, config, dados`. Cada um roda a ferramenta externa +
   script Sarak, grava `.sarak/security/<dominio>/{achados.json,relatorio.md}` e devolve um **resumo compacto**.
   Trabalhe com os resumos (não re-leia os arquivos inteiros).

3. **DAST opcional (autorizado)** — se houver URL: rode `cyber-config/scripts/check_headers.py --url <url>`
   (e nuclei, se disponível) contra a **URL autorizada** e **enriqueça** os achados de `config`/`api`. Sem URL →
   marque esses achados como **"requer alvo autorizado"** (não pulados silenciosamente).

4. **Consolidar** — a partir dos resumos:
   - `.sarak/security/achados-<data>.json` — funda os `achados[]` num array único, **ordenado por severidade**
     (crítica→alta→média→baixa), `status: aberto`. (`<data>` via `Bash date +%F`.)
   - `.sarak/security/relatorio-<data>.md` — preencha `cyber-config/assets/relatorio_seguranca.md` (resumo por
     domínio + achados + métricas "antes"). **Segredos sempre mascarados.**

5. **Apresentar** — sumário executivo (achados por domínio, severidade máx, top críticos), os caminhos gerados, e
   o próximo passo `/cyber2-adequar`. Lembre: **`.sarak/` é versionável — commite** (não gitignore).

## Limites
- **NUNCA** rode DAST/probing sem a autorização do passo 1 (URL própria/autorizada).
- **NUNCA** exponha segredo por extenso — tudo mascarado (achados, relatório, sumário).
- **NÃO** modifique o código-fonte — só escreva sob `.sarak/security/`.
- **NÃO** adéque nada aqui — a adequação é a Fase 2 (`/cyber2-adequar`).
- **NÃO** consolide re-lendo os arquivos inteiros dos domínios — use os resumos (economia de contexto).
