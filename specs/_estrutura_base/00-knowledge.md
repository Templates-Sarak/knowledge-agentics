---
tipo: "processo"
titulo: "Knowledge — Roteador de Capacidades (skills, commands, agents, hooks, MCP)"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "roteamento", "skills", "commands"]
relacionados: ["[[00-contexto]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
---

# 1. O que é este arquivo

O **roteador de capacidades** do ecossistema Sarak: dado *o que preciso fazer*, diz *qual artefato usar*.

> **As capacidades listadas aqui NÃO vivem neste repositório.** Elas vêm da base de inteligência Sarak,
> instalada na memória do agente (plugin `sarak@knowledge-agentics` no Claude Code; `sync_ide.py` nos demais
> provedores). Este arquivo é o **índice de roteamento** delas — não a implementação. Nunca copie o conteúdo
> de uma skill para cá nem para uma plan: **cite o nome** e o agente carrega o resto.

**Leia junto:** [[00-contexto]] (o que este repositório é e suas regras) — esta spec cobre *como fazer*,
aquela cobre *o que respeitar*.

---

# 2. Como cada bloco dispara (a regra de ouro)

| Bloco | Como entra em ação | Consequência prática |
|---|---|---|
| **skill** | O **modelo decide** pela `description`, **ou** você cita o nome | Citar a skill numa plan é o que garante que ela seja aplicada |
| **command** | **Manual** — você digita `/nome` | Um agente **não** dispara command; a plan pede ao humano, ou executa a skill equivalente |
| **agent** | O modelo **delega** (subagente com contexto próprio) | Isola varredura pesada e devolve resumo |
| **hook** | **Automático e determinístico** no evento do harness | Roda sempre — é a única garantia mecânica |
| **CLAUDE.md** | Sempre no contexto | Os inegociáveis; nunca precisa ser citado |

**Trava de disparo:** só as `padrao-*` são **proativas** (toda escrita/revisão de código). Todas as demais são
**sob demanda** — o agente só as aciona se a tarefa (ou a plan) pedir. Elas dizem *NÃO acione proativamente*
justamente porque são mutativas ou sensíveis.

---

# 3. Roteamento por situação (a tabela que resolve 90% dos casos)

| Preciso… | Use |
|---|---|
| Escrever/revisar qualquer código | `padrao-escrita` **+** a `padrao-<linguagem>` do alvo |
| Fechar uma tarefa de escrita/refactor antes de dizer "pronto" | `code-auditoria-padrao` (gate obrigatório) |
| Saber se um código legado está conforme | `code-diagnostico` (read-only) · em escala: `/code1-auditar` |
| Adequar legado ao padrão sem mudar comportamento | `code-adequacao` · fluxo completo: `/code2-caracterizar` → `/code3-adequar` |
| Cobrir código novo com testes | `test-unitario` |
| Testar endpoint com banco real efêmero | `test-integracao-api` |
| Garantir contrato de API (OpenAPI, provider/consumer) | `test-api-contrato` |
| Testar jornada de usuário ponta a ponta | `test-e2e` |
| Testar WebSocket/SSE, tempo real, reconexão | `test-ws-realtime` |
| Medir limite de carga, concorrência, N+1 | `test-carga` |
| Criar/alterar schema ou escrever migration | `db-migrations` |
| Caçar segredo vazado no código ou no bundle | `cyber-segredos` |
| Caçar segredo no **histórico** do git | `git-especialista-repositorio` · fluxo: `/git1-auditar` → `/git2-adequar` |
| Auditar CVEs e supply chain das dependências | `cyber-dependencias` |
| Auditoria de segurança ampla (7 domínios) | `/cyber1-auditar` → `/cyber2-adequar` |
| Revisar um diff/PR antes do commit | `git-revisao-diff` · perspectiva independente: agent `code-revisor` |
| Instalar o gate de segredos por commit | `git-verificacao-commit` |
| Criar repositório do zero / primeiro commit | `git-commit-inicial` |
| Deixar o app mais rápido sem gastar nada | `otimizacao-nivel-1` |
| Estruturar logging / métricas e alertas | `obs-logs` · `obs-monitoramento` |
| Publicar na Vercel / containerizar | `/deploy-vercel` · `/deploy-docker` |
| Escrever ou padronizar uma spec | `spec-write` |
| Sintetizar as plans executadas nas specs fixas | `spec-atualizar` |
| Definir o alicerce arquitetural de um repo novo | `spec-fundacao` |
| Criar/revisar uma skill | `meta-create-skill` · `/meta-criar-skill` |
| Preparar o projeto para entrega (licença, autoria, docs) | `code-entrega` · `code-documentacao` |
| Faxina de projeto (órfãos, código morto, deps não usadas) | `code-limpeza-projeto` |

---

# 4. Catálogo de skills (49)

## 4.1 `padrao-` — normas de escrita (as únicas proativas)

| Skill | Quando |
|---|---|
| `padrao-escrita` | **Fonte da verdade** universal: clean code, limiares, zero hardcoded, organização microservice-ready. Toda outra skill referencia esta. |
| `padrao-python` | Código Python — idiomas + validador de limiares (`scripts/validate.py`). |
| `padrao-typescript` | Código TS/JS — idiomas + validador via API do compilador TS. |
| `padrao-go` | Código Go — idiomas + `golangci-lint` configurado. |
| `padrao-java` | Código Java — idiomas + Checkstyle configurado. |

## 4.2 `code-` — operações sobre código

| Skill | Quando |
|---|---|
| `code-auditoria-padrao` | **Gate de fechamento**: invoca os validadores de AST antes de declarar uma tarefa concluída. |
| `code-diagnostico` | Diagnosticar conformidade de legado (read-only) e gerar backlog priorizado. |
| `code-adequacao` | Adequar legado item por item, com rede de caracterização, **preservando comportamento**. |
| `code-limpeza-projeto` | Remover órfãos, código morto, backups, deps não usadas (HITL + Grep antes de deletar). |
| `code-documentacao` | Padronizar README, `docs/`, autoria, licença, CODEOWNERS, changelog. |
| `code-entrega` | Gate de pré-entrega: autoria + licença + documentação no padrão. |

## 4.3 `spec-` — governança de especificações

| Skill | Quando |
|---|---|
| `spec-write` | Traduzir ideia/requisito em spec padronizada (usa os moldes de `_templates/`). |
| `spec-atualizar` | **Ponte do ciclo SDD**: lê `specs/plan/` e sintetiza nas specs fixas, por blocos e com HITL. |
| `spec-fundacao` | Wizard HITL do alicerce arquitetural/tecnológico de um repo novo → gera os ADRs. |
| `spec-site-fundacao` | Idem, para projeto de site (institucional/marketing). |

## 4.4 `test-` — testes

| Skill | Quando |
|---|---|
| `test-unitario` | Código **novo**: caminhos críticos pela borda pública, mock só de I/O externo (~80%). |
| `test-integracao-api` | Endpoint com infraestrutura real efêmera (Testcontainers/Docker), sem UI. |
| `test-api-contrato` | Definir/validar o OpenAPI do `api/` e testar provider ⇄ consumidores. |
| `test-e2e` | Jornadas críticas na UI (Playwright/Cypress) ou API ponta a ponta. |
| `test-ws-realtime` | Conexões com estado: WebSocket/SSE, heartbeat, broadcast, pub/sub, reconexão. |
| `test-carga` | Estresse, concorrência e gargalos (k6/Artillery). **HITL obrigatório.** |

## 4.5 `cyber-` — segurança por domínio

| Skill | Quando |
|---|---|
| `cyber-segredos` | Segredo hardcoded, no bundle do front ou em log. Dono do catálogo canônico de padrões. |
| `cyber-dependencias` | CVEs, pacote abandonado, typosquatting, script de instalação malicioso. |
| `cyber-codigo` | SAST: injeção, XSS, `eval`, desserialização insegura, cripto/random fracos. |
| `cyber-auth` | Hashing de senha, JWT (alg/exp/assinatura), cookies, MFA, brute-force. |
| `cyber-api` | Autorização (IDOR/BOLA), rate limiting, CORS, SSRF/CSRF, exposição de dados. |
| `cyber-config` | Headers de segurança, TLS, paths sensíveis expostos (DAST leve). |
| `cyber-dados` | LGPD: inventário de PII, minimização, mascaramento, retenção, direitos do titular. |
| `cyber-ia` | Prompt injection, insecure output handling, data poisoning, model DoS. |
| `cyber-infra` | IaC e CI/CD: Docker/K8s, Terraform, envenenamento de pipeline. |

## 4.6 `git-` — versionamento e repositório

| Skill | Quando |
|---|---|
| `git-commit-inicial` | Repo do zero: `init`, `.gitignore`, gate, primeiro commit, remoto, tag, branch de dev. |
| `git-verificacao-commit` | Gate rápido por commit: varre só o **staged** e bloqueia (pre-commit, exit 1). |
| `git-revisao-diff` | Qualidade do diff staged contra o padrão + debug/TODO/conflito esquecidos. |
| `git-especialista-repositorio` | Auditoria do **histórico inteiro** e remediação (reescrita + rotação). HITL severo. |

## 4.7 Demais áreas

| Skill | Área | Quando |
|---|---|---|
| `db-migrations` | `db-` | Schema conforme o padrão; migrations versionadas, reversíveis, expand-contract. |
| `deploy-vercel` | `deploy-` | Preparar e publicar na Vercel (preview → produção), env por CLI. |
| `deploy-docker` | `deploy-` | Dockerfile multi-stage, non-root, healthcheck, compose, sem segredo na imagem. |
| `otimizacao-nivel-1` | `otimizacao-` | Performance de **custo zero** (Core Web Vitals; índices, N+1, cache em memória). |
| `otimizacao-nivel-2` | `otimizacao-` | Performance por **concessão** (troca fidelidade/consistência por velocidade). HITL decisivo. |
| `otimizacao-nivel-3` | `otimizacao-` | Performance por **infra paga** (CDN/edge/ISR, replicas, filas). HITL de faturamento. |
| `obs-logs` | `obs-` | Logger JSON, níveis, correlation-id, agregação, retenção — sem segredo/PII. |
| `obs-monitoramento` | `obs-` | RED/USE, healthchecks, tracing OTel, dashboards, alertas/SLO. |
| `site-organizacao` | `site-` | Rotas hierárquicas, abas × páginas, a11y. **Só em sites.** |
| `site-criacao` | `site-` | Preencher as specs vazias geradas pela `spec-site-fundacao` (formulário inteligente). |
| `site-seo` | `site-` | SEO técnico + GEO local + AEO/GSO (robots/sitemap, JSON-LD, OG, NAP). |
| `meta-create-skill` | `meta-` | Criar/revisar skill: 3 camadas, `description`-gatilho, scaffold, checklist. |
| `meta-iniciar-repositorio` | `meta-` | Preparar um repo-alvo para receber inteligência local (`.agents/`, entrypoints, hook de índice). |
| `meta-atualizar-base` | `meta-` | Atualizar a Fonte da Verdade Sarak e espelhar para as IDEs (`sync_ide.py`). |
| `meta-verificacao-base` | `meta-` | Verificar integridade da base: YAML, contratos JSON, ponteiros órfãos. |

---

# 5. Commands (12) — disparo manual pelo humano

| Command | Fase | O que faz |
|---|---|---|
| `/code1-auditar` | 1 | Fan-out de `code-auditor` por módulo → plano de adequação em `.sarak/audit`. Read-only. |
| `/code2-caracterizar` | 2 | Rede de testes de caracterização nos módulos sem teste (só adiciona testes). |
| `/code3-adequar` | 3 | Caminha o backlog onda a onda, roteando por risco. **Mutativo.** |
| `/cyber1-auditar` | 1 | Fan-out de `cyber-auditor` pelos 7 domínios → relatório em `.sarak/security/`. |
| `/cyber2-adequar` | 2 | Adequa achados por severidade, HITL por achado, re-scan. **Mutativo.** |
| `/git1-auditar` | 1 | Varre todo o histórico (branches + tags) caçando vazamentos. Read-only. |
| `/git2-adequar` | 2 | Expurga vazamentos do histórico + rotação. **IRREVERSÍVEL**, HITL severo. |
| `/deploy-vercel` | — | Publica na Vercel. |
| `/deploy-docker` | — | Containeriza o app/módulo. |
| `/site-organizar` | — | Estrutura arquitetura e navegação do site. |
| `/site-seo` | — | Torna o site encontrável e indexável. |
| `/meta-criar-skill` | — | Cria/revisa uma skill no padrão. |

> **Um agente não digita `/comando`.** Se uma plan depende de um command, ela **instrui o humano** a rodá-lo
> (ou o executor aplica diretamente a **skill** equivalente, que é onde a lógica vive).

---

# 6. Agents (5) — subagentes de contexto isolado

| Agent | Papel | Disparado por | Escreve? |
|---|---|---|---|
| `code-auditor` | Auditoria de conformidade de **um** módulo (11 dimensões) | `/code1-auditar` | só `.sarak/audit` |
| `code-adequador` | Executa **uma** tarefa de adequação de risco baixo/médio | `/code3-adequar` | sim (código) |
| `code-revisor` | Revisão **independente** de um diff/PR (gate + caça-bugs) | sob demanda / orquestrador | não |
| `cyber-auditor` | Auditoria de **um** domínio de segurança | `/cyber1-auditar` | só `.sarak/security/` |
| `git-auditor` | Varredura do histórico Git completo | `/git1-auditar` | só `.sarak/git-audit` |

> Agent **não faz HITL** — quem confirma com o humano é a thread principal. Auditor não recebe `Edit`/`Write`:
> o read-only é travado mecanicamente pelas ferramentas.

---

# 7. Hooks (5) — as garantias determinísticas

| Hook | Evento | Garante |
|---|---|---|
| `cyber-git-seguro` | PreToolUse `Bash` | Barra comando git perigoso / commit com segredo. |
| `cyber-dependencias` | PreToolUse `Bash` | Barra instalação de pacote suspeito/vulnerável. |
| `test-cobertura` | PreToolUse `Bash` | Cobre a exigência de teste antes de operações de entrega. |
| `padrao-format` | PostToolUse `Write\|Edit\|MultiEdit` | Formata o que foi escrito. |
| `padrao-limiares` | PostToolUse `Write\|Edit\|MultiEdit` | Verifica os limiares objetivos (linhas, aninhamento, parâmetros). |

Ativação: nativa ao instalar o plugin (`hooks/hooks.json`), ou manual mesclando
`hooks/settings.template.json` no `.claude/settings.json` do projeto.

> **Hook bloqueou? Não contorne.** O bloqueio é informação: corrija a causa. Executor que burla um hook tem a
> execução reprovada automaticamente pelo revisor.

---

# 8. MCP — ferramentas externas

Servidores configurados na base (cada `config.json` é local e **fora do versionamento** — contém tokens):

| Servidor | Para |
|---|---|
| `github` | Repos, PRs, issues, Actions |
| `vercel` | Deploys, logs de runtime, projetos |
| `supabase` · `neon` · `postgres-local` | Banco de dados (gerenciado e local) |
| `docker` | Containers e imagens |
| `puppeteer` | Automação de navegador |
| `sequential-thinking` | Raciocínio estruturado em problemas longos |
| `StitchMCP` | Geração/integração de UI |

Ferramenta MCP só existe se o servidor estiver conectado **nesta sessão**. Uma plan que dependa de MCP deve
declarar isso e prever o caminho alternativo (CLI) — execução headless pode não ter os servidores
autenticados interativamente.

---

# 9. Regras de roteamento

1. **Cite, não copie.** Numa plan, escreva "aplique `db-migrations`" — jamais reproduza o conteúdo da skill.
   Conteúdo copiado desatualiza e passa a contradizer a fonte.
2. **Skill certa > esforço improvisado.** Existe skill para o assunto? Use. Não reinvente o fluxo dela.
3. **`padrao-escrita` + `padrao-<linguagem>` são o piso** de qualquer tarefa que toque código — sempre, sem
   precisar ser pedido.
4. **`code-auditoria-padrao` é o teto**: nenhuma tarefa de escrita/refactor é declarada concluída antes dela.
5. **Mutativo e sensível exige HITL.** `otimizacao-nivel-2/3`, `/git2-adequar`, `test-carga`, deploys: pare e
   pergunte. Um agente nunca decide sozinho o que é irreversível ou custa dinheiro.
6. **Auditar antes de adequar.** Nas áreas `code-`/`cyber-`/`git-`, a fase 1 é read-only e produz o plano; a
   fase 2 é mutativa e consome esse plano. Não pule a fase 1.
7. **Nada de commit por agente.** Nenhuma skill autoriza commit no ciclo SDD — quem commita é o usuário.

---

# 10. Contrato de manutenção desta spec

- Esta spec é **universal**: idêntica em todos os repositórios. Não a personalize por projeto — o que é
  específico do repositório vive em [[00-contexto]].
- Atualize quando a **base Sarak** mudar (skill/command/agent/hook criado, renomeado ou removido) — via plan,
  como qualquer outra alteração.
- Contagens declaradas (§4 e cabeçalhos) fazem parte do conteúdo: se o número mudar, corrija o número.
- **Ponteiro órfão é defeito**: skill citada aqui tem de existir na base instalada.
