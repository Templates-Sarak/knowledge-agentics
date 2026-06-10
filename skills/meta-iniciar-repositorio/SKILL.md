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

1. **Gate: Coleta de Dados (HITL)**
   - **Ferramenta:** Diálogo (Pergunte ao usuário no chat antes de prosseguir)
   - **Ação:** Faça obrigatoriamente as seguintes perguntas:
     1. Qual o caminho absoluto do repositório alvo?
     2. Qual(is) a(s) linguagem(ns) principal(is) do projeto? (Ex: Python, TypeScript, Go, Java. Pode ser mais de uma).
     3. Qual o nome oficial deste sistema/projeto?
     4. Deseja configurar apontamento de horas automáticas via MCP? Se sim, escolha o provedor (clockify ou toggl).

2. **Criação Automática do Projeto de Horas (Se Aplicável)**
   - **Ferramenta:** Chamada de MCP (`call_mcp_tool`)
   - **Ação:** Se o usuário escolheu um provedor de horas na pergunta 4, acione o servidor MCP correspondente (`clockify-sarak` ou `toggl-sarak`) usando a ferramenta `create_project`. 
   - **Parâmetros:** `name`: o nome oficial do sistema (da Pergunta 3).
   - **Critério:** O servidor retornará o `project_id` recém criado na plataforma. Memorize este ID para o próximo passo.

3. **Injeção da Base Local e Arquitetura Lego**
   - **Ferramenta:** `run_command`
   - **Ação:** No diretório raiz do `knowledge-agentics`, rode o script orquestrador passando os parâmetros coletados:
     ```bash
     python skills/meta-iniciar-repositorio/scripts/init_repo.py --target "<caminho-alvo>" --name "<nome-do-sistema>" --langs <linguagens...> --time-provider "<provider>" --time-project-id "<id_retornado_do_mcp>"
     ```
     *(Omitir os parâmetros `--time-*` se não houver time tracking)*
   - **Critério:** O script deve reportar a criação da estrutura local `.agents`, a cópia da arquitetura `specs/` com os templates de linguagem escolhidos, e a configuração dos *entrypoints*.

4. **Confirmação e Homologação**
   - **Ferramenta:** Texto (Resposta ao usuário)
   - **Ação:** Informe ao usuário que o projeto alvo agora é auto-gerenciável. Explique brevemente que o hook de `pre-commit` fará a manutenção automática do índice quando ele criar novas skills locais.

5. **Handoff Arquitetural (Wizard)**
   - **Ferramenta:** Acionamento de Skill
   - **Ação:** Ao terminar a homologação física, engatilhe imediatamente a skill `spec-fundacao` no chat para iniciar a entrevista com o usuário, garantindo que o novo repositório já nasça com a sua fundação tecnológica (ADRs) documentada. (Você já pode apresentar as 5 perguntas da `spec-fundacao` na mesma mensagem para puxar o fluxo).

## Regras
- **NÃO** tente rodar o script em diretórios não confirmados ou suspeitos (ex: raiz do sistema operacional).
- **NUNCA** exclua arquivos locais pré-existentes; o script orquestrador deve apenas adicionar pastas ou mesclar configurações.

## Checklist
- [ ] O script `init_repo.py` rodou com sucesso sem erros de permissão?
- [ ] O usuário foi instruído sobre como utilizar o ambiente local recém-criado?
