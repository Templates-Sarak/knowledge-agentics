---
tipo: "template"
titulo: "Páginas Internas e Hubs"
dominio: "UI/UX Front-end"
status: "🟡 Pendente"
prioridade: "Alta"
tags: ["paginas", "hub", "servicos"]
---

# 1. Visão Geral
Estrutura e layout base para as páginas secundárias (produtos, serviços, metodologias, sobre nós).

# 2. Padrão "Hub and Spoke" (Catálogos)
- **Página Mãe (Hub):** [Ex: Como será a página `/servicos`? Hero listando ecossistema, seguido por grid de cards com CTAs de aprofundamento?]
- **Páginas Filhas (Spokes):** [Ex: Como será a estrutura das rotas `/servicos/[slug]`?]
  - **Blocagem Padrão (Spoke):**
    1. Hero com título específico.
    2. Bloco Gargalo vs. Solução.
    3. Casos de Uso / Cenários.
    4. Entregáveis (Escopo).
    5. FAQ Contextual (restrito a 3 perguntas).
    6. CTA de fechamento.

# 3. Páginas Institucionais Genéricas
- **Layout de Leitura (Ex: Sobre Nós / Manifesto):** [Ex: Limitação de largura em texto (max-w-prose), uso de blockquotes estilizados, blocos intercalados de imagem e texto, alinhamento padrão (esquerdo)]

# 4. Regras de Comportamento
- **Fallback (Tratamento de 404 dinâmico):** [Como tratar acessos a slugs não existentes em um Hub? Redirecionar para o Hub principal ou mostrar página 404 padrão?]
- **Componentes Compartilhados:** [Ex: As páginas usarão um componente de Hero unificado recebendo parâmetros diferentes, ou Heros customizados por rota?]
