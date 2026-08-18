# Harness de dois-ou-mais clientes — WebSocket e realtime

Molde copiável para os passos 2–5 do `SKILL.md`. O fio condutor: um cliente sozinho nunca prova
broadcast nem isolamento — é preciso **dois ou mais**, e a asserção certa é sempre orientada a evento,
nunca a `sleep` fixo.

## Dois clientes simultâneos — a base de tudo

```typescript
import { io as conectar, Socket } from 'socket.io-client';

function aguardarEvento<T>(cliente: Socket, evento: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cronometro = setTimeout(() => reject(new Error(`timeout esperando "${evento}"`)), timeoutMs);
    cliente.once(evento, (dado: T) => { clearTimeout(cronometro); resolve(dado); });
  });
}

let clienteA: Socket, clienteB: Socket;

beforeEach(async () => {
  clienteA = conectar(URL_DO_SERVIDOR);
  clienteB = conectar(URL_DO_SERVIDOR);
  await Promise.all([aguardarEvento(clienteA, 'connect'), aguardarEvento(clienteB, 'connect')]);
});

afterEach(() => {
  clienteA.close();                               // teardown explícito — handle de rede não é GC automático
  clienteB.close();
});
```

## Broadcast — A envia, B recebe

```typescript
test('mensagem enviada por A chega em B', async () => {
  const promessa = aguardarEvento<{ texto: string }>(clienteB, 'mensagem-nova');
  clienteA.emit('enviar-mensagem', { sala: 'geral', texto: 'oi' });
  const recebido = await promessa;                 // nunca `sleep(500)` + checar variável
  expect(recebido.texto).toBe('oi');
});
```

## Heartbeat — ping/pong e perda de sinal

```typescript
test('servidor detecta cliente que parou de responder pong', async () => {
  const promessaDesconexao = aguardarEvento(clienteB_no_servidor, 'disconnect');
  clienteB.io.engine.close();                       // simula perda de sinal sem fechar "educadamente"
  const motivo = await promessaDesconexao;
  expect(motivo).toBe('transport close');
});
```

Para SSE (sem ping/pong nativo), o equivalente é: pare de consumir o stream do lado do cliente e verifique
que o servidor libera o handler/conexão dentro do timeout configurado — vazamento aqui é o handler ficar
vivo indefinidamente depois que ninguém mais lê.

## Isolamento de sala — quem não está inscrito NÃO recebe

```typescript
test('cliente fora da sala nao recebe mensagem da sala', async () => {
  clienteA.emit('entrar-sala', 'privada');
  // clienteB nunca entra em "privada"

  const recebeuIndevido = Promise.race([
    aguardarEvento(clienteB, 'mensagem-nova', 500).then(() => true),
    new Promise((r) => setTimeout(() => r(false), 600)),          // única exceção legítima ao "nunca sleep":
  ]);                                                              // provar AUSÊNCIA de evento exige um teto

  clienteA.emit('enviar-mensagem', { sala: 'privada', texto: 'segredo' });
  expect(await recebeuIndevido).toBe(false);
});
```

Provar que um evento **não** chega é a única situação em que um timeout curto é aceitável — a diferença
para o `sleep` proibido pelo `SKILL.md` é que aqui o teste não confia no tempo para *sincronizar*, só usa
um teto como critério de "não chegou a tempo de importar".

## Onde isto mora num projeto do template modular

Ao contrário de `test-integracao-api`, este harness **cabe** dentro de `modules/<modulo>/tests/contract/`
— exercitar o endpoint WS/SSE do módulo é a mesma categoria de "exercitar a app fiada com adapters de
memória" que os testes de contrato REST já fazem (`04-regras.md` §7.1: *"o `tests/contract/` já exercita
a app fiada com adapters de memória"*). Um socket local, em processo de teste, não é a infraestrutura
externa que a doutrina proíbe — é a própria borda pública do módulo (`api/`) respondendo, do mesmo jeito
que uma chamada REST responderia. Não crie uma pasta nova; o par cliente-servidor desta página é só mais
um teste dentro de `tests/contract/`, ao lado dos de REST.
