# Workflow Detalhado: Limpeza de Projeto (3 fases)

Versão expandida do workflow do `SKILL.md`. As três fases rodam em ordem; cada fase termina com um HITL
antes de qualquer remoção. A limpeza é atômica — **só deletar**, nunca refatorar nem corrigir bug.

---

## Fase 1 — Estrutural, espacial e de acesso
**Objetivo:** remover arquivos irrelevantes, reduzir o tamanho do repositório e corrigir o `.gitignore`.

### 1.0 Auditoria de pesos pesados
1. Liste os **10 maiores arquivos** (`Bash`: `ls -lhS` ou equivalente do SO).
2. Identifique binários desnecessários, dumps de banco e mídia que não deveriam estar no versionamento.
3. Se forem lixo, adicione à lista de remoção do HITL.

### 1.1 Detecção de padrões irrelevantes
Rode `python scripts/detectar_lixo.py --raiz <projeto>` para o levantamento determinístico (arquivos de
lixo, marcadores `TODO`/`console.log`, arquivos grandes — saída JSON). Confirme/localize com `Glob`:
- **Pastas de backup:** `old/`, `backup/`, `legacy/`, `_bkp/`, `v1_trash/`.
- **Scripts de debug local:** `test_api.py`, `check_connection.js`, `debug_script.ts`.
- **Logs e temporários:** `*.log`, `temp/`, `.tmp`, `.swp`.

### 1.2 Alinhamento com `.gitignore`
1. Verifique se os padrões de lixo encontrados já constam no `.gitignore`.
2. Se não, prepare a atualização para impedir que retornem ao repositório após a limpeza.

### 1.3 HITL — Fase 1
Apresente: Top-10 maiores, órfãos/backup, proposta de `.gitignore`.
⚠️ **Confirma a remoção estrutural e a atualização do ignore?**

---

## Fase 2 — Analítica e segurança (sanitização)
**Objetivo:** limpar o interior dos arquivos, remover dependências mortas e proteger segredos.

### 2.1 Automação via linter/ferramentas
1. Verifique scripts de lint (`npm run lint` ou similar) e execute para achar imports/variáveis mortas.
2. Se houver `depcheck`, rode-o para achar pacotes do `package.json` não importados em lugar nenhum.

### 2.2 Varredura de segredos
1. `Grep` por `API_KEY`, `SECRET`, `PASSWORD`, `DATABASE_URL` no código.
2. Procure `.env`/`.pem` commitados por engano.
3. Liste para o usuário confirmar a remoção ou a troca por variável de ambiente. **Sempre mascare** os segredos no relatório.

### 2.3 Código morto manual
1. `Grep` nos nomes de funções suspeitas — só remova se **não** houver referência viva.
2. Remova blocos de código comentado sem nota explicativa (o Git é o histórico).

### 2.4 HITL — Fase 2
Apresente: segredos (mascarados), dependências a remover, código morto interno.
⚠️ **Confirma a sanitização e a limpeza analítica?**

---

## Fase 3 — Verificação e registro
1. **Integridade:** rode o build (`npm run build`, `go build`, etc.) e a suíte de testes — garante que
   nenhuma dependência essencial foi removida. **Vermelho = reverta** a remoção correspondente.
2. **Registro:** documente na conclusão a lista de remoções, os segredos sanitizados, as dependências
   removidas e o espaço liberado (estimativa) — material de auditoria. Use o template de
   `assets/checklist_limpeza.md`.
