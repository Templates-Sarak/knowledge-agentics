---
name: cyber-segredos
description: Detecção e remediação de segredos vazados — hardcoded no código, no bundle do front e em logs (scan_segredos.py). Dona do catálogo canônico de padrões (git-* referenciam). Use ao auditar segredos ou ao detectar chave fora do .env. NÃO acione proativamente.
---

# Skill: Segurança — Segredos

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Caça **segredos expostos** no projeto e conduz a remediação (mover para `.env` + **rotacionar**). É a
**fonte única** dos padrões de segredo do ecossistema: o catálogo em `scripts/config.json` é o mesmo que a
`git-verificacao-commit` e a `git-especialista-repositorio` usam. Mutativa → HITL antes de alterar.

> Cyber **audita** a norma "segredo no `.env`" do `padrao-escrita` — não a redefine. Histórico do git é da
> `git-especialista-repositorio`; o gate por commit é da `git-verificacao-commit`. Globais em `CLAUDE.md`.

## Quando usar
- Sob demanda, em auditoria de segredos, antes de publicar, ou ao encontrar chave fora do `.env`.
- Mutativa → HITL obrigatório antes de mover/alterar.

## Workflow
Trate **um projeto por vez**. Onde segredos se escondem em `references/onde-escondem.md`.

1. **Varrer** — `python scripts/scan_segredos.py --raiz <projeto>` (código). Repita apontando para o **bundle do front** (`--raiz dist`/`build`/`.next`) e para **logs** (`--raiz logs`) — ali vazam chaves que o scan de código ignora.
2. **Triar** — separe achados reais de falsos positivos (genéricos/hash). Mantenha tudo **mascarado**.
3. **HITL — plano** — para cada segredo: mover para `.env` (var prefixada por módulo) + `.gitignore` + `.env.example`; trocar o literal por `process.env`/`os.getenv`; e **rotacionar** a credencial se já foi exposta/commitada. → "⚠️ Confirma?". **Aguarde.**
4. **Aplicar** — mover, ajustar `.env`/`.gitignore`, substituir no código.
5. **Histórico** — se o segredo **já foi commitado**, mover do código atual **não basta** → acione a `git-especialista-repositorio` (reescrita + rotação).
6. **Re-scan** — rode de novo até `total: 0`. Reporte (mascarado).

## Regras e limites
- **NUNCA** escreva o segredo por extenso em relatório/log — o script mascara; mantenha mascarado.
- **NUNCA** considere um segredo seguro só por tirá-lo do código atual — se foi versionado, **rotacione** (e veja a `git-especialista-repositorio`).
- **NUNCA** deixe chave **secreta** chegar ao **bundle do front** — `NEXT_PUBLIC_`/`VITE_` são públicas, só para valores não-secretos; segredo vive no servidor.
- **NÃO** use random inseguro (`Math.random`) para gerar token/segredo — use CSPRNG (`crypto`).
- **NÃO** aplique sem o HITL do passo 3; **NÃO** trate genéricos/entropia como verdade — triar.
- **NÃO** saia do escopo: histórico → `git-especialista-repositorio`; deps/CVE → `cyber-dependencias`; código inseguro → `cyber-codigo`.

## Checklist "pronta"
- [ ] Código, **bundle do front** e **logs** varridos (não só o código-fonte)?
- [ ] Achados triados (reais × falsos positivos), tudo mascarado?
- [ ] HITL feito; segredos movidos p/ `.env` (+ `.gitignore`/`.env.example`)?
- [ ] Credenciais expostas/commitadas **rotacionadas** (e histórico encaminhado ao git, se aplicável)?
- [ ] Re-scan `total: 0`?

## Referências (Camada 3 — leia sob demanda)
- `scripts/scan_segredos.py` + `scripts/config.json` — scanner + **catálogo canônico** de padrões (fonte única; git-* derivam daqui).
- `references/onde-escondem.md` — onde segredos vazam além do código (bundle, logs, env público, CI, config).
