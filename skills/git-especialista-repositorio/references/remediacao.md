# Remediação de Vazamentos no Histórico

Referência dos passos de classificação, reescrita e rotação. **Verdade-mestra:** remover um segredo do
histórico **não o torna seguro** — se já foi versionado, considere-o **comprometido** e **rotacione**.

## 1. Classificar cada achado
| Situação | O que fazer |
|---|---|
| **Segredo vivo** (no working tree **e** no histórico) | trocar por `.env`/`process.env` **+** reescrever histórico **+** rotacionar |
| **Segredo só no passado** (já saiu do código, mas está em commits antigos) | reescrever histórico **+** rotacionar |
| **Arquivo sensível no histórico** (`.env`, `*.pem`, `id_rsa`...) | expurgar o arquivo do histórico **+** rotacionar o que ele continha |
| **Alta entropia (`confianca: baixa`)** | triar manualmente — pode ser falso positivo (hash, build id) |

## 2. Cross-check opcional (ferramenta externa)
Antes de reescrever, confirme o conjunto de achados com uma ferramenta consagrada (não obrigatória):
```
gitleaks detect --source . --redact          # rápido, redige os segredos
trufflehog git file://. --only-verified      # verifica se a credencial está ativa
```
Use para **não esquecer** nenhum segredo antes do expurgo (reescrever 2x é custoso).

## 3. Reescrever o histórico (após HITL severo)
**Preferido — `git filter-repo`:**
```
git filter-repo --replace-text segredos.txt      # substitui padrões por ***REMOVED***
# ou remover um arquivo de todo o histórico:
git filter-repo --path caminho/segredo.env --invert-paths
```
**Alternativa — BFG:** `bfg --delete-files id_rsa` / `bfg --replace-text segredos.txt`.

Depois: `git push --force-with-lease` em **todas** as branches/tags afetadas — **coordenado com a equipe**
(os hashes mudam; quem tem clone antigo precisa re-clonar/rebase).

## 4. Rotacionar a credencial (obrigatório)
Para cada segredo exposto: **invalide no provedor** e **emita nova**. Depois atualize o `.env` (não versionado).
- AWS → desativar Access Key no IAM, criar nova.
- GitHub/npm/Slack/Stripe/Google → revogar o token/chave no painel, gerar novo.
- DB / connection string → trocar a senha do usuário do banco.
- Chave privada (`*.pem`/`id_rsa`) → gerar novo par, substituir a pública nos serviços.

## 5. Confirmar
Rode `scan_historico.py` de novo (e o gitleaks) — `total: 0` no conteúdo/arquivos sensíveis. Registre no relatório.
