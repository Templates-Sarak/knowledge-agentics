---
tipo: "template"
titulo: "Páginas Legais e Banner de Cookies"
dominio: "Compliance / Legal"
status: "🟡 Pendente"
prioridade: "Média"
tags: ["legal", "privacidade", "lgpd", "cookies"]
---

# 1. Visão Geral
Definição da estrutura e mecanismos que garantem aderência às normas de privacidade de dados e conformidade (LGPD/GDPR).

# 2. Páginas Estáticas Legais
- **Política de Privacidade:** [Rota definida - Ex: `/legal-privacidade`. Detalha a coleta, uso, compartilhamento e exclusão de dados]
- **Termos de Uso:** [Rota definida - Ex: `/legal-termos`. Diretrizes contratuais de navegação e propriedade intelectual]
- **Política de Cookies:** [Rota definida - Ex: `/legal-cookies`. Explicação técnica sobre tecnologias de rastreamento]

# 3. Mecanismo de Consentimento (Cookie Banner)
- **Tipo de Banner:** [Ex: Barra inferior "Aceitar/Rejeitar", Modal obstrusivo central, Canto flutuante com opção de personalização]
- **Botões e Ações Exigidos:**
  - [Ex: Botão primário "Aceitar Todos"]
  - [Ex: Botão secundário "Rejeitar Não-Essenciais" ou "Configurar"]
- **Armazenamento de Estado:** [Onde fica salvo o aceite? localStorage? Qual a duração (ex: 365 dias)?]

# 4. Bloqueio de Scripts
- **Integração Lógica:** [Ex: Scripts de Analytics/Marketing só devem ser carregados (injetados no DOM) se houver consentimento explícito, usando wrappers, GTM Consent Mode ou Partytown config]

# 5. Formatação do Texto Legal
- **Acessibilidade:** [Ex: Títulos hierárquicos rígidos `<h1>` ao `<h6>`, sumário ou índice âncora lateral, fonte legível, última data de atualização clara no topo do documento]
