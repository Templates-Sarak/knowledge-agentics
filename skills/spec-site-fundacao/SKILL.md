---
name: "spec-site-fundacao"
description: "Wizard oficial (Entrevista HITL) para definir o alicerce de um projeto de Site (institucional/marketing), copiando a estrutura base."
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
   - **Ação:** Baseado na localização `_estrutura_base_site` (que contém as pastas `arquitetura` e `specs`), copie a estrutura para a pasta `specs/` do projeto alvo, instanciando os arquivos:
     - `specs/arquitetura/01-stack-tecnologica.md`
     - `specs/arquitetura/02-identidade-visual.md`
     - `specs/arquitetura/03-tom-de-voz-e-copy.md`
     - `specs/arquitetura/04-dados-institucionais-seo.md`
     - `specs/arquitetura/05-acessibilidade-e-performance.md`
     - `specs/arquitetura/06-estrutura-de-codigo.md`
     - `specs/plan/06-layout-global-e-nav.md`
     - `specs/plan/07-pagina-home.md`
     - `specs/plan/08-paginas-internas-e-hub.md`
     - `specs/plan/09-formularios-e-contato.md`
     - `specs/plan/10-paginas-legais-e-cookies.md`
     
     *(Nota: Certifique-se de ajustar a nomenclatura/pastas exatas conforme o repositório original `_estrutura_base_site` determine, utilizando as respostas do usuário para preencher os arquivos)*.

4. **Preenchimento Inicial dos Arquivos**
   - **Ferramenta:** `Write`
   - **Ação:** Preencha o conteúdo dos arquivos recém-copiados com base nas respostas dadas pelo usuário na entrevista. Adapte os moldes aos requisitos reais.

5. **Entrega**
   - Informe ao usuário que a fundação do site foi documentada com sucesso e a estrutura básica (`arquitetura/` e `specs/`) foi populada.

## Regras de Ouro
- **NÃO** tente adivinhar as informações de marca e identidade. O HITL (Perguntas) é inegociável.
- **Formatação Rigorosa:** Todos os arquivos markdown gerados DEVEM seguir a estrutura de seções proposta nos originais de `_estrutura_base_site`.
