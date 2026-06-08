---
name: test-unitario
description: Escreve testes unitários e de integração para código novo — caminhos críticos pela borda pública, mocks só de I/O externo, com cobertura (~80%). Operacionaliza a norma de testes do padrao-escrita §9 (back e front). Use ao implementar/cobrir uma funcionalidade com testes; ≠ caracterização de legado (code-adequacao).
---

# Skill: Testes Unitários & Integração

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Garante que **código novo nasça testado**: cobre os caminhos críticos do comportamento pela **borda
pública**, com testes rápidos, determinísticos e significativos. Operacionaliza a norma `padrao-escrita`
§9. Aditiva (cria testes; não altera produção) → sem HITL pesado.

> A norma (testar com cada entrega, ~80%, pela borda) vive em `padrao-escrita` §9 — aqui é o **como**. A
> ferramenta de cada stack vem de `padrao-python`/`padrao-typescript` (ver `references/ferramentas.md`).
> Congelar **legado** sem testes é da `code-adequacao` (caracterização); aqui é teste de **código novo**.

## Quando usar
- Ao implementar uma funcionalidade nova (testes **na mesma entrega**), ao achar código sem testes, ou para elevar a cobertura.
- Back e front. Aditiva (adiciona arquivos de teste) — confirme só o escopo (o que cobrir).

## Workflow
Trate **um módulo/funcionalidade por vez**. Estratégia em `references/estrategia.md`; ferramenta em `references/ferramentas.md`.

1. **Definir o que testar** — caminhos **críticos**: caminho feliz + erros/limites relevantes. Teste pela **borda pública** (`api/`/funções públicas), **não** internals. Priorize lógica de negócio; ignore getters triviais e libs de terceiros.
2. **Escolher a ferramenta** — pytest (Python) ou vitest/jest (TS/JS); localização `tests/` do módulo (`padrao-escrita` §9). Ver `references/ferramentas.md`.
3. **Escrever os testes** — padrão **AAA** (arrange-act-assert); **um comportamento por teste**; nome descritivo do caso; **mock só de I/O externo** (rede/DB/relógio) — nunca do sistema sob teste.
4. **Rodar + cobertura** — execute a suíte; meça cobertura do módulo (meta **~80%**, sinal de saúde — não inflar com teste vazio). Caminhos críticos cobertos são obrigatórios. O **mínimo do gate** vem de `hooks/config.json → cobertura.minima` (default 80); o hook `test-cobertura` o cobra **no push** (ver `references/ferramentas.md`).
5. **Reportar** — o que foi coberto, % do módulo, e lacunas que exigem refator para testar (acoplamento).

> **Gate de cobertura (no push):** o hook `test-cobertura` mede a cobertura na fronteira do `git push` e, abaixo
> do mínimo, **pede aprovação do usuário** (modo `ask`, default) — ou bloqueia/avisa conforme `cobertura.modo`.
> A **mecânica do gate vive no `hooks/`** (config + hook); aqui é o **como elevar** a cobertura. Esta skill não
> dispara o gate — ela é o caminho para passar nele.

## Regras e limites
- **NÃO** teste internals/implementação — teste **comportamento** pela borda pública (sobrevive a refator).
- **NUNCA** mocke o **sistema sob teste** — mocke só dependências de I/O externo (DB, rede, hora, fs).
- **NÃO** persiga o número de cobertura com testes triviais/vazios — poucos testes significativos > muitos inúteis.
- **NÃO** escreva teste **flaky** — sem depender de rede real, ordem de execução ou `sleep`; controle tempo/aleatório.
- **NÃO** teste um comportamento por arquivo gigante — um caso por teste, nome claro.
- **NÃO** saia do escopo: fluxo ponta-a-ponta → `test-e2e`; legado sem testes → `code-adequacao` (caracterização).

## Checklist "pronta"
- [ ] Caminhos críticos (feliz + erros/limites) cobertos pela borda pública?
- [ ] Testes em `tests/` do módulo, na ferramenta da stack?
- [ ] AAA, um comportamento por teste, nomes descritivos?
- [ ] Mock só de I/O externo (não do alvo); testes determinísticos (sem flaky)?
- [ ] Cobertura medida (~80% do módulo, sem inflar) e ≥ `cobertura.minima` (ou aprovação consciente no push)?
- [ ] Cobertura e lacunas reportadas?

## Referências (Camada 3 — leia sob demanda)
- `references/estrategia.md` — pirâmide de testes, o que (não) testar, AAA, test doubles, determinismo.
- `references/ferramentas.md` — pytest / vitest-jest por stack (referencia `padrao-python`/`padrao-typescript`) + comandos de cobertura.
