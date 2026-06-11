---
name: test-ws-realtime
description: Escreve testes para conexões com estado e bidirecionais (WebSockets, SSE). Use ao validar lógica de tempo real, heartbeats, broadcast, pub/sub, e reconexão.
---

# Skill: Testes de WebSocket e Realtime

Testes REST (HTTP) são "sem estado" e lineares. Testes de WebSocket são contínuos, assíncronos e orientados a eventos. Esta skill cobre especificamente esse desafio técnico.

## Quando usar
- Ao testar qualquer camada que utilize WebSockets, Server-Sent Events (SSE) ou gRPC bidirecional.
- Para validar lógicas de salas (Rooms/Channels), broadcast de mensagens e latência de tempo real.

## Workflow

1. **Definir Eventos** — Mapeie os eventos de emissão (`emit`) e escuta (`on`), além dos cenários de conexão e desconexão.
2. **Gerenciamento de Clientes Múltiplos** — Conecte ao menos 2 clientes virtuais simultâneos para poder validar mecânicas de *broadcast* (Cliente A envia, Cliente B recebe).
3. **Validação de Heartbeat (Ping/Pong)** — Verifique se a conexão se mantém viva e como o servidor reage à perda de sinal de um cliente.
4. **Mecânica de Pub/Sub** — Teste se clientes não inscritos numa sala específica *NÃO* recebem mensagens daquela sala (Segurança/Isolamento).
5. **Limpeza e Teardown** — Garanta o fechamento correto das conexões e sockets nos testes para não vazar handles de rede (`close()`).

## Regras e limites
- **NÃO** tente usar ferramentas síncronas HTTP padrão para testar WebSockets. Use bibliotecas clientes específicas (ex: `socket.io-client`, `ws`).
- **NUNCA** ignore o vazamento de conexões (connection leaks) ao final das suítes de teste.
- **NÃO** crie testes baseados em `sleep` fixo. Aguarde a chegada dos eventos (Promises, Channels) de forma orientada a callbacks.

## Checklist "pronta"
- [ ] Múltiplos clientes foram simulados para validar broadcast?
- [ ] O isolamento de salas (pub/sub) foi garantido?
- [ ] As conexões são limpas corretamente (teardown/close) ao fim do teste?
- [ ] O teste não depende de tempos estáticos (`sleep`), aguardando o evento emitido de forma assíncrona?
