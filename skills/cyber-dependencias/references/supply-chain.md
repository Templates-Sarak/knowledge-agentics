# Supply Chain — além do `npm audit`

CVE conhecido é só parte. Estes são os vetores de cadeia de suprimentos a checar.

## Ferramentas de auditoria por ecossistema
| Stack | Comando |
|---|---|
| Node | `npm audit --json` (ou `pnpm audit` / `yarn npm audit`) |
| Python | `pip-audit` (ou `safety check`) |
| Multi/genérico | `osv-scanner -r .` (cobre vários lockfiles) |

## O que checar além do CVE
- **Lockfile presente e íntegro** — `package-lock.json`/`pnpm-lock.yaml`/`poetry.lock` versionado; sem `^`/`~` soltos em deps críticas.
- **Pacotes abandonados** — sem release há anos, sem manutenção, repo arquivado. Risco mesmo sem CVE.
- **Typosquatting** — nome parecido com um pacote popular (`reqeusts`, `expresss`, `lodahs`). Confira o nome exato e o publisher.
- **Scripts de instalação** — `postinstall`/`preinstall` em dependências que rodam código no install. Suspeite de scripts ofuscados.
- **Dependências diretas vs transitivas** — uma transitiva vulnerável pode exigir override/resolução.
- **Integridade** — `npm ci` (usa o lockfile) em vez de `npm install` no CI.

## Severidade e correção
- Ordene por `critical > high > moderate > low`.
- `npm audit fix` resolve o não-breaking; `npm audit fix --force` pode quebrar (atravessa major) — **só com HITL**.
- Sem fix disponível: avaliar override, troca de pacote, ou aceitar com justificativa documentada.

> Não ignore `critical`/`high` sem justificativa técnica registrada e aprovação (HITL).
