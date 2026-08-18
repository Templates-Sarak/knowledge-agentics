# Esqueleto de script de carga — k6 e Artillery

Molde copiável para o passo 3 do `SKILL.md` (escrever o script), depois do HITL do passo 1 já ter
aprovado VUs, duração e ramp-up com o humano. **Todo `<PLACEHOLDER>` abaixo é gritante de propósito** —
nenhum valor de estresse sai desta skill sem passar pelo gate HITL primeiro (regra absoluta do `SKILL.md`).

## k6 — as três fases (ramp-up / plateau / ramp-down)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '<RAMP_UP_APROVADO_NO_HITL>', target: <VUS_PLATEAU_APROVADO_NO_HITL> },  // ramp-up
    { duration: '<PLATEAU_APROVADO_NO_HITL>', target: <VUS_PLATEAU_APROVADO_NO_HITL> },  // plateau
    { duration: '<RAMP_DOWN_APROVADO_NO_HITL>', target: 0 },                             // ramp-down
  ],
  thresholds: {
    // os dois limiares que o passo 4 do SKILL.md exige declarar — sem eles o teste "passa" sem provar nada
    http_req_duration: ['p(95)<<LATENCIA_P95_MS_APROVADA_NO_HITL>'],
    http_req_failed: ['rate<<TAXA_DE_ERRO_MAXIMA_APROVADA_NO_HITL>'],
  },
};

export default function () {
  const resposta = http.get('<URL_DO_ENDPOINT_CRITICO>');
  check(resposta, { 'status 200': (r) => r.status === 200 });
  sleep(1); // pense no "sleep" como o intervalo entre ações de UM usuário, não como sincronização de teste
}
```

```bash
k6 run script.js                                  # local
k6 run --out json=resultado.json script.js         # saída para análise posterior
```

## Artillery — o equivalente

```yaml
config:
  target: "<URL_BASE_DO_ALVO>"
  phases:
    - duration: <RAMP_UP_SEGUNDOS_APROVADO_NO_HITL>
      arrivalRate: 1
      rampTo: <TAXA_PLATEAU_APROVADA_NO_HITL>
      name: "ramp-up"
    - duration: <PLATEAU_SEGUNDOS_APROVADO_NO_HITL>
      arrivalRate: <TAXA_PLATEAU_APROVADA_NO_HITL>
      name: "plateau"
    - duration: <RAMP_DOWN_SEGUNDOS_APROVADO_NO_HITL>
      arrivalRate: <TAXA_PLATEAU_APROVADA_NO_HITL>
      rampTo: 0
      name: "ramp-down"
  ensure:
    p95: <LATENCIA_P95_MS_APROVADA_NO_HITL>
    maxErrorRate: <TAXA_DE_ERRO_MAXIMA_APROVADA_NO_HITL>

scenarios:
  - flow:
      - get:
          url: "<CAMINHO_DO_ENDPOINT_CRITICO>"
```

```bash
npx artillery run script.yml
npx artillery run --output resultado.json script.yml
```

## Lendo a saída — separar gargalo de aplicação de gargalo de banco

1. **Latência sobe, taxa de erro continua baixa** → aplicação está processando, mas devagar. Suspeite de
   CPU do processo, GC, ou query sem índice (correlacione com `EXPLAIN ANALYZE` da query do endpoint).
2. **Taxa de erro sobe junto com o número de VUs, latência quase estável** → algo está **rejeitando**
   conexão antes de processar: pool de conexão do banco esgotado, rate limit da própria API, ou limite de
   file descriptors do processo.
3. **Erros concentrados num endpoint só** → N+1 ou tabela sem índice — correlacione o endpoint que mais
   falha com `EXPLAIN ANALYZE` antes de escalar infraestrutura; é o mesmo diagnóstico que a
   `otimizacao-nivel-1` já resolve sem gastar nada.
4. **Erros distribuídos por todos os endpoints ao mesmo tempo** → limite de infraestrutura (CPU/memória do
   host, não de uma query específica) — aqui sim é candidato a `otimizacao-nivel-3`.

## Onde isto mora num projeto do template modular

Um script de carga **não** entra em `modules/<modulo>/tests/` — essa árvore (`domain/`, `contract/`,
`web/`, `fixtures/`) roda inteira com adapters de memória, sem rede (`specs/arquitetura/03-operacao.md`
§5); um script k6/Artillery faz o oposto por natureza — martela HTTP contra uma instância **de verdade**
rodando em algum lugar. Trate-o como script de **operação**, ao lado de `node scripts/migrations.mjs ciclo <modulo>`
(`03-operacao.md` §9.3) — por exemplo `scripts/carga/<endpoint>.js` na raiz do projeto — nunca dentro da
pasta de um módulo. Fora do template, o lugar convencional é uma pasta própria na raiz (`load/`,
`tests/carga/`), fora da suíte que roda em CI comum a cada commit.
