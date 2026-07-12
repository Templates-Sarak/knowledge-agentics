---
name: ui-integra-consumidor
description: Instala e acopla o motor SarakManifestRenderer num sistema consumidor (Next.js/React/FastAPI). Configura Interceptors e DataStore. Use ao iniciar a infraestrutura do front-end com a Lib. NÃO acione proativamente.
---

# Skill: Integrar Consumidor (Infraestrutura)

Skill responsável pela instalação plug-and-play do Motor Declarativo (Sarak-Lib-UI-Core) no projeto cliente, garantindo a inicialização do `SarakManifestRenderer`, `SarakDataStore` e `Interceptors`.

## Quando usar
- Quando o usuário informar que está num repositório que consumirá a `Sarak-Lib-UI-Core` e precisa acoplar o sistema (Engine) na raiz do projeto.
- Quando for necessário plugar roteamento do framework hospedeiro ou cabeçalhos de autenticação na Engine.
- Use APENAS quando o usuário solicitar explicitamente a instalação/integração inicial. NÃO acione proativamente.

## Workflow

1. **Entrevista de Instalação (HITL) — faça TODAS estas perguntas ANTES de tocar em qualquer arquivo**
   - **Stack do consumidor:** qual o framework/host (Next.js/React, Vite, Remix, etc.) e o backend, se houver (Node, Python/FastAPI, PHP)? Isso decide como o Design Agent é acoplado na Etapa 5.
   - **Design Agent (chat de IA) — incluir ou não?** Pergunte explicitamente: *"Quer habilitar o chat do Design Agent (a IA que gera e ajusta o tema por linguagem natural)?"*
     - Deixe claro que é **100% opcional e desacoplado**: `agent-design-operator` **não** é dependência de `@sarak/lib-ui-core` (importar a UI nunca o baixa), e `options.designAgent` é opcional. Sem ele, a UI funciona por inteiro — só o `DesignAgentChatCard` aparece como "Não configurado", sem tentar nenhum fetch.
     - **Se NÃO:** pule a Etapa 5 inteira — nenhuma infra de IA, nenhuma env var de LLM, nenhum microsserviço.
     - **Se SIM:** faça as perguntas de follow-up abaixo.
   - **(Só se for incluir o agente) Perguntas de follow-up:**
     - **Modo de deploy do agente:** acoplado ao backend Node do próprio consumidor (via `initDesignAgent()`) ou microsserviço Node isolado (porta 4000)? Backend Python/PHP força o microsserviço.
     - **Provider/model de LLM:** o agente exige `DESIGN_AGENT_LLM_PROVIDER` e `DESIGN_AGENT_LLM_MODEL` no ambiente do agente — o módulo não escolhe sozinho. Confirme que o usuário tem essas credenciais.
     - **Persistência do agente:** precisa de `DATABASE_URL` (histórico de conversa/temas). Confirme o banco.
   - **Banco de dados da UI (sempre, com ou sem agente):** o Design Engine persiste temas. Confirme `DATABASE_URL` e o uso de `setupUIDatabase` (ver `references/examples.md`).
2. **Criação da Pasta Sarak-Engine (Isolamento)**
   - **Ferramenta:** `run_command`
   - **Ação:** Crie o diretório dedicado `Sarak-Engine/` na raiz do consumidor, que isolará os proxies, a store local e instâncias da biblioteca.
3. **Instanciação da DataStore e Interceptors**
   - **Ação:** Crie o arquivo de inicialização exportando uma instância isolada de `SarakDataStore`.
   - **Ação:** Configure o `networkInterceptor` (para injetar tokens JWT e cookies em chamadas de API geradas pela Sarak) e o `routerInterceptor` (para conectar o router do framework cliente, ex: `useRouter` do Next.js).
4. **Injeção do Manifest Renderer**
   - **Ação:** Substitua o conteúdo estático da página/layout raiz ou crie um Ponto de Entrada base injetando o componente mestre: `<SarakManifestRenderer payload={jsonDaPagina} dataStore={store} networkInterceptor={apiHandler} routerInterceptor={routeHandler} />`.
5. **Integração do Design Agent (SÓ se o usuário optou por incluir na Etapa 1)**
   - Se o usuário respondeu "não" na Etapa 1, **NÃO execute esta etapa** — a integração termina na Etapa 4.
   - A Sarak nunca chama rede diretamente (Spec 08 §6.2) — o chat (`DesignAgentChatCard`) só funciona se o consumidor injetar `options.designAgent.sendPrompt` no `SarakUIProvider`. Sem isso, o card mostra "Não configurado" e não tenta nenhum fetch.
   - **Ação:** Implemente `sendPrompt: (input: DesignAgentPromptInput) => Promise<DesignAgentPromptResult>` (tipos exportados por `@sarak/lib-ui-core`) chamando o backend `agent-design-operator` a partir do SEU servidor (nunca do browser direto, para não expor credenciais):
     - **Node.js (Next.js/Express/Fastify):** `initDesignAgent()` (de `agent-design-operator`) retorna um Router Express já pronto (inicializa banco + carrega o catálogo). Acople-o na sua API e chame essa rota interna no `sendPrompt`.
     - **Python (FastAPI/Django) ou PHP:** rode o agente como microsserviço Node isolado (porta 4000); o `sendPrompt` (no seu backend, não no browser) faz a chamada HTTP para ele.
   - **⚠️ O `sendPrompt` é um ADAPTADOR — os formatos do agente e do Provider NÃO são iguais, é obrigatório traduzir os dois lados:**
     - **Entrada:** a UI te entrega `{ prompt, draftTokens }` (`DesignAgentPromptInput`). A rota `POST /prompt` do agente espera `{ prompt, session_id, mode?, base_theme? }` — **você** gera o `session_id` (por usuário/sessão). `mode: 'create' | 'patch'` e `base_theme` são opcionais e definidos no seu backend (não vêm no tipo público): use `mode: 'patch'` + `base_theme` (o tema atual completo) quando for alteração de um tema já existente; senão omita (default `create`).
     - **Saída:** a rota devolve `{ success, message, payload? }`. Mapeie para o contrato do Provider: `message` → `message`, **`payload` → `themePatch`** (nomes diferentes!). A `message` já vem pronta em linguagem natural — incluindo o aviso de fatias que não aplicaram — repasse como está. (O contrato público também aceita `componentPresets?`, hoje não emitido pela rota — deixe indefinido.)
   - **Ação:** Injete o resultado no Provider: `<SarakUIProvider options={{ designAgent: { sendPrompt } }}>`.
6. **Handoff (Ponto de Transição)**
   - **Ação:** Após a infraestrutura base estar acoplada e renderizando com sucesso um manifesto vazio ou de teste (fallback), informe ao usuário que a integração arquitetural terminou.
   - **Próximo Passo Obrigatório:** Oriente o usuário (ou você mesmo no próximo turno) a invocar a skill **`ui-integra-escrever-manifesto`** para começar, de fato, a construir as telas (escrever o JSON).

## Regras (SRP - Responsabilidade Única)
- **NÃO** ensine ou tente montar telas, formulários ou laços de repetição (`renderFor`) nesta skill. O foco aqui é estrito: DevOps e Infraestrutura Front-end.
- **SEMPRE** garanta que o componente importado nas rotas seja o Renderizador Mestre, bloqueando a importação direta de componentes atômicos isolados pelo desenvolvedor (garantindo que tudo passe pelo JSON).

## Referências
- Spec 11 (`11-engine-declarativa-e-manifestos.md`) da Biblioteca Core.
- `references/examples.md` — Exemplos práticos do padrão de injeção de dependência e integração do Renderer.
