---
name: meta-iniciar-repositorio
description: Inicializa a arquitetura de inteligência local (Sarak) num repositório-alvo. Cria a estrutura .agents/, os entrypoints para as IDEs, copia a skill de meta-criação e cria o hook de auto-indexação. Use APENAS quando pedirem para preparar um repositório para receber regras de negócio locais. NÃO acione proativamente.
---

# Skill: Iniciar Repositório (Local Sarak Base)

Transforma um repositório vazio ou existente em um ambiente Sarak-ready, instalando nativamente a capacidade de criar, indexar e gerenciar skills de negócio locais (`.agents/`).

## Quando usar
- Quando o usuário pedir para iniciar um repositório, instalar o sarak num cliente, ou preparar um projeto para IA.
- Use APENAS quando o usuário solicitar explicitamente apontando um repositório-alvo. NÃO acione proativamente.

## Workflow

1. **Gate: Definir Caminho Alvo**
   - **Ferramenta:** Diálogo
   - **Ação:** Confirme com o usuário o caminho absoluto do repositório alvo (onde a pasta `.agents` será instalada).

2. **Injeção da Base Local**
   - **Ferramenta:** `run_command`
   - **Ação:** No diretório raiz do `knowledge-agentics`, rode o script orquestrador apontando para o alvo:
     ```bash
     python skills/meta-iniciar-repositorio/scripts/init_repo.py --target <caminho-alvo>
     ```
   - **Critério:** O script deve reportar criação das pastas, cópia da `meta-create-skill`, injeção do gerador de índice e configuração dos *entrypoints* (incluindo o hook de git `pre-commit`).

3. **Confirmação e Homologação**
   - **Ferramenta:** Texto (Resposta ao usuário)
   - **Ação:** Informe ao usuário que o projeto alvo agora é auto-gerenciável. Explique brevemente que o hook de `pre-commit` fará a manutenção automática do índice quando ele criar novas skills locais.

## Regras
- **NÃO** tente rodar o script em diretórios não confirmados ou suspeitos (ex: raiz do sistema operacional).
- **NUNCA** exclua arquivos locais pré-existentes; o script orquestrador deve apenas adicionar pastas ou mesclar configurações.

## Checklist
- [ ] O script `init_repo.py` rodou com sucesso sem erros de permissão?
- [ ] O usuário foi instruído sobre como utilizar o ambiente local recém-criado?
