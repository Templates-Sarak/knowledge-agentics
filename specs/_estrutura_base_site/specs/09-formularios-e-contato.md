---
tipo: "template"
titulo: "Formulários e Página de Contato"
dominio: "UI/UX Front-end"
status: "🟡 Pendente"
prioridade: "Alta"
tags: ["formulario", "contato", "conversao", "leads"]
---

# 1. Visão Geral
Principal ferramenta de conversão e ponto de captura de leads. Define as regras de validação, campos e fluxos do usuário ao entrar em contato.

# 2. Estrutura da Página de Contato
- **Layout:** [Ex: 2 colunas no desktop (40/60). Esquerda com proposta de valor (pitch) e contatos alternativos. Direita com o formulário]

# 3. Definição do Formulário
- **Campos Solicitados:**
  1. [Ex: Nome Completo (Obrigatório)]
  2. [Ex: Empresa (Obrigatório)]
  3. [Ex: E-mail Corporativo (Obrigatório ou Condicional)]
  4. [Ex: WhatsApp/Telefone (Obrigatório ou Condicional)]
  5. [Ex: Mensagem ou Área de Interesse (Obrigatório)]
- **Honeypot / Anti-spam:** [Definir mecanismo para evitar spam (reCAPTCHA, Cloudflare Turnstile, ou input invisível via CSS)]
- **Integração / Backend:** [Para onde o formulário envia os dados? Endpoint de API própria, Webhook, Supabase, CRM?]

# 4. Comportamento e Validação (UX)
- **Validação em Tempo Real:** [Ocorre no *onBlur*, *onChange* ou *onSubmit*?]
- **Mensagens de Erro:** [Como são exibidas visualmente? Borda vermelha + texto inferior?]
- **Regex:** [Ex: Regra para e-mail padrão, regra para telefone (min 8 max 20 chars)]
- **Estado de Carregamento:** [Ex: Botão primário exibe spinner bloqueando envios duplicados]
- **Feedback de Sucesso:** [Ex: Redirecionamento para página `/obrigado` ou re-renderização do formulário para uma mensagem "Solicitação Recebida" com ícone de check na mesma tela]
