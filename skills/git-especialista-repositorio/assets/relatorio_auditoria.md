# Relatório de Auditoria de Repositório

**Repositório:** [NOME/CAMINHO]
**Data:** [AAAA-MM-DD]
**Branches/tags auditadas:** [ex: main, develop, v1.0.0 — total N]
**Cross-check externo:** [gitleaks / trufflehog / nenhum]

---

## 1. Segredos no histórico (conteúdo)
| Commit | Branch(es) | Arquivo | Tipo | Classificação |
|---|---|---|---|---|
| [hash] | [main/develop] | [arquivo] | [tipo] | [vivo \| só no passado] |

## 2. Arquivos sensíveis no histórico
| Commit | Arquivo | Ação |
|---|---|---|
| [hash] | [.env / id_rsa / *.pem] | [expurgar + rotacionar o conteúdo] |

## 3. Alta entropia (confiança baixa — triar)
| Commit | Arquivo | Trecho (mascarado) | Veredito |
|---|---|---|---|
| [hash] | [arquivo] | [ab12...yz] | [segredo real \| falso positivo] |

> Fonte: `scan_historico.py` (+ cross-check, se usado).

## 4. Plano de remediação (ver references/remediacao.md)
- [ ] Working tree: mover segredos vivos para `.env`/`process.env`.
- [ ] Histórico: `git filter-repo`/BFG para expurgar [segredos/arquivos] — **com HITL**.
- [ ] **Rotacionar** no provedor TODA credencial exposta: [lista].
- [ ] `push --force-with-lease` coordenado nas branches/tags afetadas.

## 5. Métricas e status final
- Segredos no histórico: [N] → [0 após reescrita]
- Arquivos sensíveis: [N] → [0]
- Credenciais rotacionadas: [N]
- [ ] Histórico expurgado · [ ] Credenciais rotacionadas · [ ] Re-scan limpo (`total: 0`)
