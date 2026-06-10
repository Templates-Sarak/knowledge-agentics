---
name: cyber-infra
description: Auditoria de segurança de Infraestrutura (IaC) e CI/CD — hardenização de Docker/Kubernetes, proteção de Terraform e bloqueio a envenenamento de pipeline. Use ao auditar repositórios de infra ou scripts de automação/CI. NÃO acione proativamente.
---

# Skill: Segurança — Infraestrutura e CI/CD

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Audita e endurece as engrenagens que levam e mantêm a aplicação no ar: **Pipeline CI/CD**, containers e provisionamento na nuvem (IaC).
Garante princípios de menor privilégio nos *runners* e *containers* e busca *misconfigurations* comuns. Mutativa ao corrigir → HITL.

> Hardening focado no código de infraestrutura/deploy. Hardening da camada HTTP de aplicação em si fica na `cyber-config`; CVEs do `package.json` na `cyber-dependencias`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, ao auditar ou implementar repositórios de IaC, pipelines de CI/CD ou manifestos de Docker/K8s.
- Mutativa (ajusta privilégios, altera imagens base) → HITL obrigatório.

## Workflow
Trate **uma ferramenta/pipeline por vez** (ex: CI primeiro, depois IaC).

1. **Containers (Docker/Kubernetes)** — audite manifestos (Dockerfile, helm, k8s yaml). Remova uso do usuário `root` (rootless), não conceda `privileged: true`, exclua secrets inseridos em variáveis de build/ambientes em imagens (`cyber-segredos`), exija base images pequenas/mínimas e *read-only root filesystems* se viável.
2. **Pipelines (GitHub Actions, GitLab CI)** — busque riscos de "Pipeline Poisoning". Verifique comandos de `RUN` executando scripts baixados via `curl` sem *hash*. Controle permissões de injetáveis dinâmicos (evitar `run: echo ${{ github.event.issue.title }}` sem aspas fortes). Bloqueie tokens exageradamente permissivos (`permissions: write-all`).
3. **Infraestrutura como Código (Terraform/CloudFormation)** — varredura estática à procura de portas abertas globalmente (`0.0.0.0/0`), buckets/storage de leitura ou gravação pública sem necessidade absoluta, e roles IAM permissivas demais (ex: uso de *wildcards* em Resources/Actions de AWS IAM).
4. **HITL — plano** — achados da infra + correção (mudança de rootless, travar regras do Security Group, apertar scopes de token CI). → "⚠️ Confirma o hardening?". **Aguarde.**
5. **Aplicar + verificar** — implemente a solução; assegure que o CI não quebrou de forma inválida. Reporte.

## Regras e limites
- **NUNCA** publique ou configure containers executando sua aplicação em produção com o usuário `root`. Sempre declare/crie um usuário sem privilégios para executar a workload (rootless).
- **NUNCA** deixe o GITHUB_TOKEN (ou tokens do CI) com permissões máximas de gravação de forma ampla. Defina *scopes* (permissões limitadas e explícitas) nas *jobs*.
- **NÃO** permita *Security Groups* globais a menos que explicitamente exigido e com WAF ativo (para `80/443`).
- **NÃO** instale dependências extras de build no container final; exija *multi-stage builds*.
- **NÃO** aplique hardening sem o HITL do passo 4.

## Checklist "pronta"
- [ ] Containers rodando com usuário *rootless* e sem privilégios excessivos?
- [ ] Multi-stage configurado e `privileged: true` evitado?
- [ ] Pipelines de CI/CD limpas de injeção de scripts e excesso de permissões de *token*?
- [ ] Regras IAM e exposição de Buckets/Portas de IaC fechadas?
- [ ] HITL feito; CI/build executado sem quebrar?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — workflow detalhado.
- `references/examples.md` — exemplo de Dockerfile seguro e pipeline seguro.
