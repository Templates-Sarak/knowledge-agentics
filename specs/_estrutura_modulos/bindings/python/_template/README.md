# Módulo `<modulo>` — binding Python

Fatia vertical autossuficiente do domínio **<Modulo>**, em Python. A **anatomia, o manifesto, o contrato e o
catálogo de regras são idênticos** ao binding TypeScript — só a materialização muda.

> **Não copie esta pasta à mão.** Use `node ferramentas/criar-modulo.mjs <id> --binding python`.

**Leis donas:** `specs/arquitetura/01-modulo.md` ·
`specs/arquitetura/02-contrato-e-dados.md` ·
`specs/arquitetura/03-operacao.md` ·
`specs/arquitetura/04-regras.md` (**a única fonte normativa**).

## O que muda em relação ao binding TypeScript

| Assunto | TypeScript | Python |
|---|---|---|
| Manifesto de pacote | `package.json` | `pyproject.toml` |
| Framework de API | Express | FastAPI |
| Barril de pasta | `index.ts` | `__init__.py` |
| Testes | Vitest, `tests/**/*.test.ts` | pytest, `tests/**/test_*.py` |
| Linter de limiares | ESLint | Ruff (`[tool.ruff]` no `pyproject.toml`) |
| Tipos | `tsc --noEmit` | `mypy --strict` |

O que **não** muda: `modulo.json`, `contrato/openapi.yaml`, `config/*.json`, `database/`, a árvore de pastas,
as fronteiras e todas as regras do gate.

## Módulo Python é backend

O front deste ecossistema é sempre TypeScript, então o molde Python nasce com `rotaWeb: null` e **sem `web/`**.
Se um módulo Python precisar de tela, ela é o `web/` do binding TypeScript — mesma anatomia, mesmo
`api-client` relativo, consumindo a `api/` deste módulo. Nada na doutrina muda.

## Anatomia

```
modulo.json      identidade + contrato — o sistema DESCOBRE o módulo por aqui
pyproject.toml   dependências, pytest, ruff e mypy
contrato/        openapi.yaml — a FONTE do contrato; o código segue
config/          5 arquivos, um por assunto. Zero valor literal no código
core/            engine interna, sem I/O
  dominio/       tipos (dataclass) + validação
  portas/        Protocols do que preciso de INFRAESTRUTURA
  gateways/      o que preciso de OUTROS MÓDULOS — só HTTP
  motor/         geração determinística do artefato
api/src/         a única superfície pública (FastAPI)
database/        schema.sql + migrations das tabelas <modulo>_*
tests/           dominio/ contrato/ fixtures/ — sem rede, sem banco
```

## As regras que este molde já cabeia

Idênticas ao binding TypeScript, com a sintaxe da linguagem:

- **Zero hardcoded** — segredo no `.env`, tunable em `config/`, texto em `config/textos.json`.
- **Falha rápida** — `os.getenv("X", "http://localhost")` é violação; falta de env **derruba o boot**.
- **Infraestrutura desacoplada** — `core/portas` define `Protocol`; o provedor só aparece em `config/portas.json`.
- **Módulo alheio desacoplado** — `core/gateways/`, só HTTP, declarado em `consome`.
- **Saída por allowlist** — `para_contrato()` é a projeção; devolver a linha crua é proibido.
- **Deny by default** — toda rota exige token, exceto as de `rotasPublicas`.
- **Log estruturado** — `print()` é proibido; o logger emite JSON com `requestId` e redige campo sensível.
- **Determinismo** — `datetime.now()` e `random` proibidos em `core/`; use `relogio` e `geradorId`.

## Comandos

```
pip install -e ".[dev]"      instala o módulo e as ferramentas de dev
pytest                       testes, sem rede e sem banco
mypy .                       tipos em modo estrito
ruff check .                 limiares de escrita
node ../../ferramentas/gate/validar.mjs .              gate de conformidade
node ../../ferramentas/gate/validar.mjs --extracao .   vira microsserviço hoje?
```
