---
name: ui-integra-consumidor
description: Instala e acopla a biblioteca Sarak-Lib-UI-Core num sistema consumidor (Node.js/Next.js ou Python/FastAPI). Use ao integrar o front-end com a Lib. NÃO acione proativamente.
---

# Skill: Integrar UI Consumidor

Skill responsável pela instalação plug-and-play da biblioteca em sistemas clientes, garantindo a criação da pasta isolada de consumo e injeção de Providers.

## Quando usar
- Quando o usuário informar que está num repositório que consumirá a `Sarak-Lib-UI-Core` como dependência, e precisa acoplar o sistema.
- Use APENAS quando o usuário solicitar explicitamente. NÃO acione proativamente.

## Workflow

1. **Identificação do Ecossistema (HITL)**
   - **Ação:** Pergunte qual é a stack do projeto consumidor (Ex: Next.js/React ou FastAPI).
2. **Criação da Pasta Sarak-UI**
   - **Ferramenta:** `run_command`
   - **Ação:** Crie o diretório dedicado `Sarak-UI/` na raiz do consumidor, que isolará os proxies e chamadas para a library.
3. **Injeção de Providers**
   - **Ação:** Auxilie o usuário injetando os Contextos/Providers obrigatórios no ponto de entrada da aplicação cliente (ex: `_app.tsx` ou `layout.tsx`).
4. **Verificação das Bridges**
   - **Ação:** Certifique-se de que a biblioteca está corretamente plugada nas funções de persistência de banco de dados se houver comunicação local.

## Regras
- **NÃO** tente ditar como a lógica de negócios do consumidor deve ser feita; limite-se apenas a conectar os Providers da Sarak-UI.
- **SEMPRE** garanta que todo código da library gerado localmente fique confinado no diretório `Sarak-UI/`.

## Checklist
- [ ] A pasta `Sarak-UI/` foi criada no projeto cliente?
- [ ] Os providers foram acoplados na raiz?

## Referências (Camada 3)
- `assets/Sarak-UI/` — Boilerplate copiável para a criação da pasta de consumo no sistema cliente.
- `references/examples.md` — Exemplos práticos do padrão de injeção de dependência e integração (Bom e Ruim).
