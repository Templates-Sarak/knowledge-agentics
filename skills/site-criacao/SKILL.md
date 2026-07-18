---
name: "site-criacao"
description: "Preenche as especificações vazias do site geradas pela spec-site-fundacao através de um formulário inteligente e síntese de informações estruturadas, com cobertura de 100% dos campos arquiteturais."
---

# Skill: Criação de Site (Síntese e Preenchimento)

Esta skill atua na etapa imediatamente posterior à `spec-site-fundacao`. Enquanto a fundação copia os templates vazios para o projeto, esta skill é responsável por aplicar o HITL (Human-in-the-Loop) enviando um formulário exaustivo e cirúrgico ao usuário, extraindo as respostas e preenchendo detalhadamente as especificações técnicas, de UI/UX, SEO e de negócios do site.

## O Gatilho
Pode ser executada logo após a conclusão da `spec-site-fundacao` ou invocada manualmente quando o usuário solicitar "preencher o template do site", "definir os detalhes do site" ou "continuar a criação do site".

## Workflow

1. **Validação de Contexto**
   - **Ação:** Verifique (de forma silenciosa) se as pastas `specs/arquitetura/` e `specs/plan/` (ou `specs/`) existem no repositório e se contêm os arquivos Markdown de base gerados.

2. **Entrevista com Formulário Granular (HITL Obrigatório)**
   - **Ferramenta:** Diálogo (Chat)
   - **Ação:** Envie o seguinte formulário em Markdown ao usuário e PARE a execução aguardando as respostas. Este formulário foi milimetricamente desenhado para cobrir cada lacuna dos 11 templates da `_estrutura_base_site`:

   ```markdown
   ## 📝 Formulário Completo de Criação do Site

   Para garantirmos 100% de precisão técnica na especificação, responda de forma cirúrgica aos tópicos abaixo. Você pode responder por partes ou enviar tudo de uma vez.

   ### PARTE 1: Engenharia e Arquitetura (Base Tecnológica)
   1. **Stack de Front-end:** Qual o framework principal (Next.js, Vite/React), linguagem (TypeScript) e estilização (Tailwind)? Qual a regra de lint/formatação (ex: Padrão Sarak default)?
   2. **Gerenciamento e Internacionalização:** Haverá gerenciador de estado (Zustand, Context)? O site terá internacionalização (i18n) e quais os idiomas primário/secundário?
   3. **Infraestrutura e Back-end:** Onde o site será hospedado (Vercel, AWS)? Será necessário Banco de Dados/CMS?
   4. **Estratégia de Renderização e Testes:** Será SSG, SSR ou ISR? Quais ferramentas de testes unitários/integração (Vitest, RTL) e E2E (Playwright, Cypress) serão usadas?

   ### PARTE 2: Identidade Visual e Tokens UI
   5. **Paleta de Cores e Temas:** Defina as cores primárias, secundárias e as cores semânticas (Sucesso/Erro/Aviso). Como o site lidará com Dark/Light Mode (quais os backgrounds padrão)?
   6. **Tipografia e Tokens:** Qual a fonte principal e secundária, e seus respectivos pesos (ex: 400, 700)? Os botões/cards terão cantos arredondados (soft) ou quadrados (hard)?
   7. **Ativos e Componentes:** Qual a biblioteca de ícones (ex: Lucide)? Qual o estilo visual fotográfico/ilustrativo? Como devem ser os botões (cor de fundo, hover effect)?

   ### PARTE 3: Estratégia de Conteúdo e SEO Institucional
   8. **Público e Tom de Voz:** Quem é a persona e quais suas dores/objetivos? Como devem ser redigidos os Títulos (Headlines) e CTAs (ex: verbos no infinitivo)? Quais termos/jargões são preferidos ou estritamente proibidos?
   9. **Dados Institucionais (NAP):** Qual a Razão Social, Nome Fantasia, CNPJ, Endereço físico completo e Contatos principais (E-mail/WhatsApp)?
   10. **Presença Digital e SEO:** Quais os links das Redes Sociais? Quais as palavras-chave focais e o tipo de Schema.org principal (LocalBusiness, Organization)?

   ### PARTE 4: Acessibilidade e Performance
   11. **Metas e Estratégias:** Qual o nível de acessibilidade exigido (ex: WCAG AA, navegação por teclado)? Há metas de Core Web Vitals (ex: LCP < 2.5s)? Como scripts de terceiros e fontes deverão ser carregados para evitar bloqueios?

   ### PARTE 5: Estrutura Global e Navegação
   12. **Layout Global (Header/Footer):** Como o Header se comporta no scroll (ex: glassmorphism, esconde no scroll down)? Qual a ordem dos links e CTA do Header? O que haverá nas colunas do Footer e na barra inferior (bottom-bar)?
   13. **Página Home:** Detalhe a "Hero Section" (Headline, Sub, CTA, Visual) e a ordem dos blocos seguintes (Prova Social, Pilares de Valor, Catálogo, CTA Final).
   14. **Páginas Internas (Hub & Spoke):** Como funcionará a arquitetura de catálogos (ex: estrutura da página mãe `/servicos` vs. detalhe `/servicos/[slug]`)? Qual a estratégia para páginas 404 (Fallback dinâmico ou página padrão)?
   15. **Formulários e Conversão:** Quais os campos exatos do formulário de contato? Qual a estratégia Anti-spam (Honeypot, reCAPTCHA)? A validação ocorre em tempo real (onBlur) ou no envio? O sucesso exibe uma mensagem in-line ou redireciona para `/obrigado`?
   16. **Páginas Legais:** Haverá banner de consentimento de cookies? Teremos páginas dedicadas de Termos de Uso e Política de Privacidade?

   ### PARTE 6: Estrutura de Código e Escabilidade
   17. **Arquitetura de Pastas (DDD):** A organização dos componentes será orientada a domínio (ex: `components/home`, `components/ui`) ou flat?
   18. **Segregação de Dados:** Haverá separação estrita de conteúdo (textos) do código JSX (ex: usando pastas `data/` ou `messages/` para i18n)?
   19. **Arquivos Nativos:** Exigiremos a geração nativa de `sitemap.ts`, `robots.ts` e `opengraph-image.tsx` na raiz do projeto (Next.js App Router)?
   ```

3. **Síntese e Preenchimento dos Arquivos**
   - **Ferramenta:** Edição de Arquivo (Write/Multi Replace)
   - **Ação:** Baseando-se nas respostas, abra um por um os arquivos de arquitetura (de `01` a `05`) e specs (`06` a `10`) presentes no repositório. Preencha todos os espaços reservados (como os indicados por `[Ex: ...]`) e apague os comentários de placeholder, substituindo-os pelos requisitos concretos do usuário. 
   - **Diretriz:** Se o usuário omitir algo irrelevante (ex: sem CNPJ por ser MVP pessoal), apague a respectiva linha de exigência do `.md` mantendo o documento limpo. Traduza a linguagem natural do usuário em requisitos arquiteturais formais e técnicos.

4. **Entrega**
   - Comunique ao usuário que a fundação e o planejamento do site estão 100% especificados, documentados na pasta `specs/` e prontos para embasar o desenvolvimento técnico.

## Regras de Ouro
- O questionário agora possui 19 pontos focais e mapeia 100% dos micro-detalhes de UI, UX e Arquitetura da `_estrutura_base_site`. Não avance para a escrita dos arquivos até ter massa crítica de respostas.
- Preencha cada arquivo respeitando sua finalidade de domínio, e remova blocos/itens que o usuário decidir não utilizar (ex: se não tiver Dark Mode, delete os parâmetros referentes ao tema escuro da Identidade Visual).
