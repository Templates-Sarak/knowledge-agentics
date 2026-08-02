---
tipo: "doutrina"
titulo: "Operação — Segurança, Log, Erro, Teste e Extração"
status: "🟢 Vigente"
tags: ["seguranca", "log", "teste", "extracao", "operacao"]
relacionados: ["[[00-arquitetura]]", "[[01-modulo]]", "[[02-contrato-e-dados]]", "[[04-regras]]"]
---

# 1. Propósito

As leis anteriores descrevem a forma. Esta descreve o comportamento em execução: como o módulo se defende,
o que ele registra, como é testado, e como se prova que ele está pronto para virar microsserviço.

# 2. Segurança

## 2.1 A cadeia da `api/`

Toda requisição atravessa a mesma cadeia, na mesma ordem, em todo módulo:

```
requestId → headers de segurança → CORS → rate limit → autenticação → autorização → rota → tratador de erro
```

1. **`requestId`** — gerado na entrada, propagado no log e devolvido no envelope de erro. É o que liga o log
   à trilha de auditoria.
2. **Headers** — HSTS, `nosniff`, `frame-deny`, `referrer-policy`, vindos de `config/seguranca.json`.
3. **CORS** — origens **declaradas**. `*` é proibido.
4. **Rate limit** — janela e limites em `config/seguranca.json`, com limites distintos para leitura, escrita
   e operações caras. Estouro devolve `LIMITE_EXCEDIDO` com `Retry-After`.
5. **Autenticação — deny by default.** Toda rota exige token, **exceto** as declaradas em
   `modulo.json:rotasPublicas`. Rota pública é **opt-in explícito**, e o método faz parte da declaração:
   abrir a leitura nunca pode abrir a escrita do mesmo caminho por descuido.
6. **Autorização** — a rota exige uma permissão nomeada (`<modulo>:ler`, `<modulo>:escrever`), verificada
   contra as claims. Autorização é da `api/` do módulo; RLS no banco é defesa em profundidade, não o controle
   primário.
7. **Validação na borda** — antes do domínio, com allowlist de campos e limite de corpo ([[02-contrato-e-dados]] §3.2).
8. **Tratador de erro** — único lugar que transforma exceção em resposta. Nenhuma rota monta erro à mão.

## 2.2 Segredo

- Segredo **só** em `.env`. Nunca em `config/*.json` (versionado), nunca no código, nunca no bundle do front.
- Variável exposta ao browser tem prefixo próprio do build (`VITE_`, `NEXT_PUBLIC_`) e **nunca** contém chave,
  token ou credencial. O que vai para o browser é público, por definição.
- Credencial de serviço externo pago só existe em módulo com `papel: "gateway"` ([[00-arquitetura]] §3.1).
- Rotação de credencial não pode exigir mudança de código.

# 3. Log

- **Estruturado**, uma linha por evento, com `requestId`, `modulo`, `nivel` e `mensagem`.
- Nível mínimo em `config/api.json`.
- **Campos de `camposSensiveis` são redigidos automaticamente** pelo logger — não é responsabilidade de quem
  chama lembrar.
- **`console.*` é proibido no módulo.** Sempre o logger.
- Mensagem de fornecedor e stack trace vão para o log, nunca para a resposta.

**Log ≠ trilha de auditoria.** O log é operacional e efêmero; a trilha é registro durável de negócio
([[02-contrato-e-dados]] §6.4).

# 4. Erro

- A taxonomia é **fechada** ([[02-contrato-e-dados]] §3.1). Código novo exige mudança na lei, não improviso.
- **Exceção nunca é engolida.** `catch` vazio é erro de gate.
- Erro de adapter é traduzido pelo adapter para a taxonomia; o domínio nunca vê o tipo de erro do fornecedor.
- Erro de gateway (outro módulo indisponível) é `DEPENDENCIA_EXTERNA`, e o módulo consumidor decide se degrada
  ou falha — mas decide **explicitamente**.

# 5. Teste

| Camada | Cobre |
|---|---|
| `tests/dominio/` | validação e regras de negócio |
| `tests/contrato/` | cada rota do `openapi.yaml`; auth negada por padrão; payload malformado rejeitado |
| `tests/web/` | os três estados de cada tela (`loading`, `empty`, `error`) |
| `tests/fixtures/` | dados compartilhados **dentro** do módulo |

**Tudo roda com adapters de memória, sem rede e sem banco.** Isso não é preferência de teste: é a prova
executável de que o desacoplamento existe. Se um teste do módulo precisa de infraestrutura, a porta está mal
desenhada ou o adapter de memória está faltando.

Módulo com `core/motor` testa **determinismo**: mesma entrada, saída idêntica. É o que garante que
`relogio` e `geradorId` estão sendo usados no lugar de `new Date()` e `Math.random()`.

**Cobertura-alvo ~80% nos caminhos críticos — e isto NÃO é regra.** Medir cobertura exige executar os testes,
e o gate é estático por contrato ([[04-regras]] §7.1). É um alvo de equipe, cobrado em revisão e pelo comando
`verificar` do projeto, nunca pelo gate. Cobertura também não é meta em si: teste que existe só para subir
número é peso morto.

O gate cobra o que **é** estruturalmente verificável: `tests/dominio/` e `tests/contrato/` existem e não estão
vazios (regra `testes`).

# 6. Extração — a prova que justifica tudo

```
node ferramentas/gate/validar.mjs --extracao modulos/<modulo>
```

O comando responde uma pergunta objetiva: **a ESTRUTURA deste módulo permite extraí-lo hoje?** Ele confere que:

- toda porta declarada tem adapter escolhido em `config/portas.json`;
- todo gateway tem entrada em `consome`, e existe env apontando a URL base do módulo consumido;
- o `.env.example` cobre exatamente o que o manifesto declara;
- nenhum import sai da pasta do módulo, e nenhum SDK de fornecedor está dentro dela;
- o contrato existe e declara os três endpoints obrigatórios.

**O que ele não faz: executar teste.** O gate é estático e sem efeito colateral por contrato — ele lê arquivo
e devolve achado, nunca roda código do módulo. A prova de que os testes passam sem rede é o `npm test` /
`pytest` do módulo, no comando `verificar` do projeto. Confundir as duas coisas foi o que, num sistema real,
fez um comando de extração "passar" sem nunca ter rodado um teste sequer.

**O procedimento de extração**, quando chegar o dia:

1. Copiar `modulos/<modulo>/` para o repositório novo.
2. Copiar os `adapters/<tec>` que ele declara e os `packages/` que ele usa.
3. Recortar as chaves `<MODULO>_*` do `.env` da raiz para o `.env` do módulo, e **apagar a linha `ENV_RAIZ`**.
4. Substituir os gateways por chamadas à URL pública dos módulos que ficaram.
5. Copiar `specs/arquitetura/`, `specs/adr/000-decisoes-do-template.md` e `ferramentas/` — a lei e a
   verificabilidade viajam junto.

Nenhum passo é refactor. Se algum for, uma regra foi violada antes e não foi pega.

# 7. Verificação

O verificador é uma **ferramenta que recebe o caminho de um módulo**. Verificação do repositório inteiro é um
laço sobre `modulos/*`, não uma capacidade separada — é isso que permite ao módulo extraído continuar
verificável no repositório novo dele.

```
node ferramentas/gate/validar.mjs <caminho-do-modulo>    um módulo
node ferramentas/gate/validar.mjs --todos                laço + as regras globais
node ferramentas/gate/validar.mjs --extracao <caminho>   pronto para virar serviço?
node ferramentas/gate/validar.mjs --json <caminho>       saída para máquina
```

Só **duas** regras são genuinamente do repositório e precisam de visão global: `import-lateral` (nenhum módulo
importa outro) e `consome-ciclo` (não há ciclo no grafo). Ambas rodam no `--todos`.

**O template não traz pipeline de CI/CD**, de propósito: config de CI é específica de provedor, e a regra não
pode morar num lugar que se perde ao trocar de provedor. O gate é agnóstico e tem contrato estável (recebe
caminho, devolve exit 0/1, opcionalmente JSON). Plugá-lo num executor é uma linha — ver `ferramentas/gate/README.md`.

O que rodar onde é decisão de **custo**, não de importância:

| Custo | Exemplos | Quando |
|---|---|---|
| Milissegundos (lê arquivo) | manifesto, nomenclatura, import lateral, prefixo de tabela, env | toda invocação |
| Segundos (compila/testa) | build, testes, tipos | sob demanda no local, obrigatório na entrega |
| Dezenas de segundos | integração, scan de dependência | só no executor de entrega |

# 8. Exceções

`config/conformidade.json` na raiz do projeto aceita exceção **nominal**: módulo + regra + motivo + o link da
decisão que a ratificou em `specs/adr/000-decisoes-do-template.md`. **Sem esse link, o gate rejeita a própria exceção** — é
o que impede a lista de virar depósito de dívida silenciosa.

A lista começa **vazia**, e esse é o estado correto.
