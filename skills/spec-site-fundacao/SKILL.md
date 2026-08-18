---
name: "spec-site-fundacao"
description: Entrevista HITL que define o alicerce de um projeto de Site (institucional/marketing) e instala a estrutura base de specs. Use ao iniciar um site novo, ou quando pedirem a fundação de um projeto de site. NÃO acione proativamente.
---

# Skill: Fundação de Site (Wizard)

Esta skill opera como um entrevistador focado em extrair as definições iniciais de um site e materializá-las inicializando a estrutura `_estrutura_base_site`.

## O Gatilho
Deve ser engatilhada automaticamente ao iniciar o projeto de um site ou invocada manualmente quando o usuário quiser "definir a base do site", "iniciar a documentação do site" ou "criar as fundações do site".

## Workflow

1. **Entrevista Estruturada (HITL Obrigatório)**
   - **Ferramenta:** Diálogo (Chat)
   - **Ação:** PARE a execução e faça exatamente as perguntas abaixo ao usuário, num único bloco amigável. Não gere nenhum documento antes que ele responda:
     1. **Stack Tecnológica:** Qual a stack base do site (HTML/CSS, React/Next.js, Tailwind, etc.) e provedor de hospedagem?
     2. **Identidade e Design:** Qual a paleta de cores principal, tipografia e estilo geral do site (sério, moderno, minimalista)?
     3. **Tom de Voz e Copy:** Qual a principal mensagem que o site deve passar e qual o tom de voz (formal, descontraído, persuasivo)?
     4. **Dados SEO/Institucionais:** Qual o nome da marca, palavras-chave principais e dados de contato que devem aparecer (NAP)?
     5. **Estrutura de Páginas:** Além da Home e Contato, quais páginas principais o site terá (Sobre, Serviços, Blog)?
     6. **Orquestração de Navegação:** O site precisará de rotas complexas, sub-abas ou suporte a múltiplos idiomas (i18n)?
     7. **Orquestração de Descoberta:** O site dependerá fortemente de tráfego orgânico (Google), busca local (GEO) ou otimização para IA (AEO)?
     8. **Orquestração de Detalhamento:** Deseja que eu detalhe toda a arquitetura física de pastas (ex: DDD), UI e infraestrutura técnica agora mesmo?

2. **Orquestração de Especialistas (Roteamento Dinâmico)**
   - **Ação:** Baseado nas respostas das perguntas 6, 7 e 8, INVOQUE ou RECOMENDE imediatamente o uso das seguintes skills especializadas:
     - Se sim para a P6 (Navegação/i18n), acione `/site-organizacao` para criar o mapa de rotas.
     - Se sim para a P7 (Tráfego/SEO/IA), acione `/site-seo` para mapear a estratégia técnica de descobrimento.
     - Se sim para a P8 (Detalhamento Arquitetural), acione `/site-criacao` para aprofundar as decisões estruturais.

3. **Cópia da Estrutura Base**
   - **Ação:** Copie a estrutura **inteira** de `_estrutura_base_site` para a pasta `specs/` do projeto-alvo, **preservando a hierarquia exatamente como está na origem**. Nada é renomeado, movido nem descartado — a estrutura é o contrato do ciclo SDD. Um `copytree` recursivo resolve; se copiar arquivo a arquivo, siga a tabela:

   | Origem (`_estrutura_base_site/`) | Destino (no projeto) | O que é |
   |---|---|---|
   | `00-contexto.md`, `00-indice.md`, `00-knowledge.md`, `00-prompt-revisor.md`, `00-prompt-executor.md` | `specs/00-*.md` | **Specs de processo — obrigatórias.** É por elas que qualquer agente se contextualiza |
   | `README.md`, `INDEX.md` | `specs/` | Manual e bússola do diretório |
   | `arquitetura/01`…`06` | `specs/arquitetura/` | Stack, identidade visual, tom de voz, SEO/NAP, a11y/performance, estrutura de código |
   | `specs/06`…`10` | **`specs/specs/`** | Layout global, Home, páginas internas, formulários, páginas legais |
   | `_templates/*.md` | `specs/_templates/` | Moldes, incluindo `template-plan.md` |
   | `adr/` (vazia) | `specs/adr/` | ADRs — decisões imutáveis |
   | `plan/` (vazia) | `specs/plan/` | **Fila de execução** — abriga toda plan (`plan-NN-<slug>.md`) do nascimento ao expurgo. Sem subpasta |

   > ⚠️ **As specs `06`–`10` vão para `specs/specs/`, NUNCA para `specs/plan/`.** A pasta `plan/` é a fila de
   > execução do ciclo SDD e só recebe arquivos `plan-NN-<slug>.md` escritos pelo agente revisor. Despejar
   > spec de conteúdo ali corrompe o índice de execução.

4. **Preenchimento Inicial dos Arquivos**
   - **Ferramenta:** `Write`
   - **Ação:** Preencha, com as respostas da entrevista, **apenas as specs fixas** — as 6 de `specs/arquitetura/` e as 5 de `specs/specs/`. Adapte os moldes aos requisitos reais.
   - **Ação:** No `specs/00-contexto.md`, preencha **somente** a §1 (Identidade do site) e a §3 (Stack e arquitetura em uma página) a partir das mesmas respostas. Mantenha intactos os blocos `> **Como escrever:**` e os demais `<!-- PREENCHER -->` — eles são o contrato de manutenção da spec, completado depois pelo agente revisor.
   - **NÃO** altere `00-indice.md`, `00-knowledge.md`, `00-prompt-revisor.md` nem `00-prompt-executor.md`: são **universais**, idênticas em todos os projetos.

5. **Entrega**
   - Informe ao usuário que a fundação do site foi documentada: specs fixas populadas (`arquitetura/` + `specs/`), specs de processo instaladas (`00-*`) e o ciclo SDD pronto (`plan/` vazia, aguardando a primeira plan).
   - Indique os próximos passos: `site-criacao` para aprofundar o detalhamento, e uma **primeira plan** do agente revisor para completar o `00-contexto.md` (§2 específicas, §7 fronteiras, §8 estado).

## Regras de Ouro
- **NÃO** tente adivinhar as informações de marca e identidade. O HITL (Perguntas) é inegociável.
- **Formatação Rigorosa:** Todos os arquivos markdown gerados DEVEM seguir a estrutura de seções proposta nos originais de `_estrutura_base_site`.
- **NÃO** crie nenhum arquivo em `specs/plan/`. A pasta nasce **vazia**: só o agente revisor escreve plans, e só no formato `plan-NN-<slug>.md`.
- **NÃO** omita as specs de processo (`00-*`). Sem elas o projeto nasce sem o ciclo SDD e nenhum agente consegue se contextualizar.
- **NÃO** commite. Entregue os arquivos no worktree — quem commita é o usuário.
