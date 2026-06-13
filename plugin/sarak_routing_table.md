# Sarak Global Routing Table

> **Atenção IAs:** Este arquivo é o mapa central do ecossistema Sarak. Ele lista os comandos imperativos (Iniciados com `/`), as Skills Orgânicas, os Subagentes e Templates.

> **Diretriz de Orquestração (Time Tracking):** Ao iniciar QUALQUER tarefa solicitada pelo usuário, sua **primeiríssima** ação deve ser ler o arquivo `.agents/config.json` na raiz do projeto alvo. Se ele existir e possuir configuração de `time_tracking`, ligue o cronômetro usando a ferramenta MCP `start_timer` ANTES de planejar ou ler o código. Ao entregar a solução final, chame a ferramenta `stop_timer`. Isso garante o rastreio contínuo do início ao fim.

## 1. Comandos (Slash Commands)
Quando o usuário enviar qualquer comando listado abaixo, leia o arquivo correspondente antes de agir.
- **/code1-auditar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/code1-auditar.md`
- **/code2-caracterizar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/code2-caracterizar.md`
- **/code3-adequar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/code3-adequar.md`
- **/cyber1-auditar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/cyber1-auditar.md`
- **/cyber2-adequar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/cyber2-adequar.md`
- **/deploy-docker**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/deploy-docker.md`
- **/deploy-vercel**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/deploy-vercel.md`
- **/git1-auditar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/git1-auditar.md`
- **/git2-adequar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/git2-adequar.md`
- **/meta-criar-skill**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/meta-criar-skill.md`
- **/site-organizar**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/site-organizar.md`
- **/site-seo**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/site-seo.md`
- **/time-timer**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/time-timer.md`
- **/time**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/commands/time.md`

## 2. Skills Orgânicas
Quando o usuário solicitar o uso de uma destas skills (ou você julgar necessário pelo contexto), leia o arquivo SKILL.md correspondente para carregar o seu workflow.
- **code-adequacao**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/code-adequacao/SKILL.md`
- **code-diagnostico**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/code-diagnostico/SKILL.md`
- **code-entrega**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/code-entrega/SKILL.md`
- **code-limpeza-projeto**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/code-limpeza-projeto/SKILL.md`
- **cyber-api**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-api/SKILL.md`
- **cyber-auth**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-auth/SKILL.md`
- **cyber-codigo**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-codigo/SKILL.md`
- **cyber-config**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-config/SKILL.md`
- **cyber-dados**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-dados/SKILL.md`
- **cyber-dependencias**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-dependencias/SKILL.md`
- **cyber-ia**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-ia/SKILL.md`
- **cyber-infra**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-infra/SKILL.md`
- **cyber-segredos**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/cyber-segredos/SKILL.md`
- **db-migrations**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/db-migrations/SKILL.md`
- **deploy-docker**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/deploy-docker/SKILL.md`
- **deploy-vercel**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/deploy-vercel/SKILL.md`
- **git-commit-inicial**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/git-commit-inicial/SKILL.md`
- **git-especialista-repositorio**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/git-especialista-repositorio/SKILL.md`
- **git-revisao-diff**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/git-revisao-diff/SKILL.md`
- **git-verificacao-commit**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/git-verificacao-commit/SKILL.md`
- **meta-atualizar-base**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/meta-atualizar-base/SKILL.md`
- **meta-create-skill**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/meta-create-skill/SKILL.md`
- **meta-iniciar-repositorio**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/meta-iniciar-repositorio/SKILL.md`
- **meta-verificacao-base**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/meta-verificacao-base/SKILL.md`
- **obs-logs**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/obs-logs/SKILL.md`
- **obs-monitoramento**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/obs-monitoramento/SKILL.md`
- **otimizacao-nivel-1**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/otimizacao-nivel-1/SKILL.md`
- **otimizacao-nivel-2**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/otimizacao-nivel-2/SKILL.md`
- **otimizacao-nivel-3**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/otimizacao-nivel-3/SKILL.md`
- **padrao-escrita**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/padrao-escrita/SKILL.md`
- **padrao-go**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/padrao-go/SKILL.md`
- **padrao-java**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/padrao-java/SKILL.md`
- **padrao-python**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/padrao-python/SKILL.md`
- **padrao-typescript**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/padrao-typescript/SKILL.md`
- **site-organizacao**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/site-organizacao/SKILL.md`
- **site-seo**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/site-seo/SKILL.md`
- **spec-fundacao**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/spec-fundacao/SKILL.md`
- **spec-write**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/spec-write/SKILL.md`
- **test-api-contrato**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-api-contrato/SKILL.md`
- **test-carga**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-carga/SKILL.md`
- **test-e2e**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-e2e/SKILL.md`
- **test-integracao-api**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-integracao-api/SKILL.md`
- **test-unitario**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-unitario/SKILL.md`
- **test-ws-realtime**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/test-ws-realtime/SKILL.md`
- **time-tracking**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/time-tracking/SKILL.md`
- **ui-integra-consumidor**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/skills/ui-integra-consumidor/SKILL.md`

## 3. Subagentes Especializados
Agentes que podem ser acionados via ferramentas/tasks (ex: code-auditor). Leia o manifesto para descobrir as regras e os papéis.
- **code-adequador**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/agents/code-adequador.md`
- **code-auditor**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/agents/code-auditor.md`
- **code-revisor**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/agents/code-revisor.md`
- **cyber-auditor**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/agents/cyber-auditor.md`
- **git-auditor**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/agents/git-auditor.md`

## 4. Templates de Documentação
Modelos oficiais que devem ser usados como molde ao gerar documentação (Specs, ADRs, Arquitetura).
- **template-adr**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/specs/_estrutura_base/_templates/template-adr.md`
- **template-arquitetura**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/specs/_estrutura_base/_templates/template-arquitetura.md`
- **template-spec**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/specs/_estrutura_base/_templates/template-spec.md`

## 5. Variáveis de Ambiente Globais (Agent Context)
Sempre que uma skill pedir para você rodar ferramentas como Python, Pytest, Eslint, etc., NÃO use os instaladores locais do repositório. Em vez disso, use EXATAMENTE os caminhos absolutos abaixo:
- **SARAK_PYTHON_VENV**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/.venv/Scripts/python.exe`
- **SARAK_NODE_BIN**: `C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/node_modules/.bin`

> **Exemplos Práticos de Ferramentas Globais**:
> - **Pytest**: `"C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/.venv/Scripts/python.exe" -m pytest .`
> - **Playwright**: `"C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/node_modules/.bin/playwright" test`
> - **Artillery**: `"C:/Users/Igor/Desktop/Sarak/X - Trabalho/Code/knowledge-agentics/node_modules/.bin/artillery" run test.yml`
