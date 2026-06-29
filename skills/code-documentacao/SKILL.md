---
name: code-documentacao
description: Gera e padroniza a documentação de um repositório (README, diretório docs/, autoria, licença, CODEOWNERS, changelog). Use APENAS quando o usuário solicitar explicitamente a documentação do projeto. NÃO acione proativamente.
---

# Skill: code-documentacao

> **Dependência:** Esta skill baseia-se na criação de projetos padronizados pelo ecossistema Sarak. Consulte `padrao-escrita` se precisar de diretrizes de linguagem específicas durante a documentação.

Atua como a central de padronização documental de um projeto, complementando as especificações técnicas (`spec/`). Ela garante que o repositório tenha os arquivos essenciais para entendimento, uso, colaboração, licenciamento correto e segurança de autoria.

## Quando usar
- Quando o projeto acabou de ser inicializado e carece de README e licença.
- Ao final de um ciclo de desenvolvimento, para gerar os manuais, changelogs e guia de contribuição.
- Quando o usuário pede para revisar a autoria e a licença ("limpar assinaturas de IA").
- Acionada sob demanda. Não dispara sozinha.

## Workflow

1. **Auditoria e Varredura (Grep)**
   - Utilize a ferramenta `grep_search` para varrer o projeto procurando termos como `author`, `copyright`, `license`, ou nomes de agentes de IA nos arquivos de configuração (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.) e em cabeçalhos de arquivos.
   - Analise se o arquivo `LICENSE`, o `.github/CODEOWNERS` e a pasta `docs/` já existem no projeto.

2. **Entrevista de Documentação (HITL - Obrigatório)**
   - Paralise a execução.
   - Envie ao usuário o conteúdo explicativo sobre licenças encontrado em `references/templates.md` (sob "Cartilha de Licenças").
   - Pergunte explicitamente:
     1. "Quem é o autor oficial do projeto ou a empresa proprietária?" (para fins de copyright e assinaturas).
     2. "Qual licença listada acima você deseja adotar para este projeto?"

3. **Aplicação de Autoria e Licenciamento**
   - **Licença:** Gere o arquivo `LICENSE` na raiz com o texto oficial da licença escolhida pelo usuário. Insira o trecho de copyright padrão da licença com o nome fornecido no passo 2 e o ano atual.
   - **Metadados:** Utilize a ferramenta de edição (`replace_file_content` / comandos nativos) para remover coautorias indesejadas dos metadados e adicionar apenas o(s) autor(es) autorizado(s).
   - **CODEOWNERS:** Crie o arquivo `.github/CODEOWNERS` na raiz do projeto contendo `* @<Autor>` (ou aspas se não for username de github, mas use o nome informado para selar a propriedade).

4. **Geração Estrutural e Guias**
   - **README.md:** Crie ou atualize o `README.md` raiz. Insira um guia de Setup rápido e as seções obrigatórias de Autoria e Licença. O README deve apontar de forma clara para o diretório `docs/` para as informações estruturais.
   - **docs/ e Complementos:** Garanta a criação da pasta `docs/` na raiz e crie dentro dela:
     - `maps.md`: Onde você deve listar a estrutura de diretórios atualizada em formato de árvore (root, src, docs, spec).
     - `CONTRIBUTING.md`: O guia de contribuição usando o template correspondente.
   - **CHANGELOG.md:** Deve ser gerado na raiz do projeto para versionamento semântico (iniciado em v0.1.0 ou a versão atual).

## Regras e limites

- **NUNCA** assuma ou adivinhe a licença de um projeto sem perguntar ao usuário. Projetos não licenciados não são *open-source*, logo, possuem copyright fechado por padrão.
- **NÃO** mantenha assinaturas de IA (ex: "Criado por ChatGPT/Claude/Antigravity") no código final se o usuário exigiu apenas a própria autoria. Você deve ser rigoroso na etapa de varredura.
- **NÃO** destrua a documentação estrutural existente (`spec/`); esta skill *complementa* a documentação técnica agregando usabilidade, regras de negócio e on-boarding, não substituindo decisões técnicas.
- **NUNCA** acione a geração documental de forma proativa durante uma sessão de código. Documentação estrutural pesada pausa o desenvolvimento; faça apenas sob demanda explícita.

## Checklist "pronta"
- [ ] Rodou o `grep` antes de modificar os arquivos para caçar autores ocultos?
- [ ] O Passo 2 (HITL) bloqueou a IA até o usuário responder sobre a Licença e a Autoria?
- [ ] O `LICENSE` foi criado corretamente na raiz?
- [ ] O `CODEOWNERS` reflete as permissões de revisão do autor listado?
- [ ] O `README.md` possui a árvore do repositório, o guia de start e a licença apontada?
- [ ] Limpou assinaturas velhas de IAs?

## Referências
- `references/templates.md` — Templates e excertos copiáveis (Cartilha de Licenças, README, CODEOWNERS, CONTRIBUTING).
