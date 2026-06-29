# Templates — code-documentacao

Este arquivo fornece conteúdos estáticos e copiáveis para agilizar a documentação.

## Cartilha de Licenças (Texto para a Etapa HITL)

Quando chegar no Passo 2 do workflow, envie (ou adapte) o seguinte texto para instruir o desenvolvedor:

```text
Para gerarmos a documentação e proteger o projeto corretamente, preciso de duas definições:

1. **Autoria:** Quem devo listar como autor/proprietário do código? (Seu nome, nickname, ou empresa).
2. **Licenciamento:** Qual a licença do projeto? Se não tiver certeza, aqui está um resumo rápido das opções comuns:

   - **MIT:** A mais permissiva de todas. Permite que qualquer um use, modifique, distribua e até venda o código, desde que mantenha a nota de copyright. (Ideal para open-source irrestrito).
   - **Apache 2.0:** Parecida com a MIT, mas exige que qualquer alteração seja documentada e protege explicitamente patentes envolvidas. (Muito comum corporativamente).
   - **GPLv3:** Código livre, mas "viral". Quem usar seu código e distribuir um produto modificado é *obrigado* a abrir o código-fonte dele também sob GPLv3.
   - **Proprietária / Sem Licença Externa (All Rights Reserved):** Ninguém pode copiar, distribuir ou modificar sem a sua permissão escrita. Padrão se for um produto seu comercial e fechado.

Me diga quem é o autor e qual licença escolhemos para eu processar os arquivos.
```

## Template: CODEOWNERS

```text
# Garante que todo o código pertence ao autor listado,
# bloqueando merges de PRs automáticos/terceiros sem review dele.
*       @<NomeAutor/Username>
```

## Template: CONTRIBUTING.md

```markdown
# Contribuindo

Agradecemos o interesse em contribuir! Siga as diretrizes abaixo:

1. Crie um fork do repositório ou uma branch com sua feature: `feature/minha-feature`.
2. Certifique-se de que os testes passam e que o código segue o padrão de linters adotado (`padrao-escrita`).
3. Siga o padrão de *Conventional Commits* (ex: `feat: add nova func`, `fix: corrige bug no painel`).
4. Abra um Pull Request detalhando o que foi feito. 

Qualquer alteração estrutural pode sofrer revisão do Codeowner do projeto antes do merge.
```

## Seções Básicas Exigidas no README.md

```markdown
# Nome do Projeto

Breve descrição do propósito deste módulo ou aplicação.

## Setup e Execução

Para rodar localmente:
1. Instale dependências: `comando de install`
2. Configure o ambiente baseando-se no arquivo `.env.example`.
3. Inicie o servidor: `comando run dev`

## Estrutura do Projeto

A estrutura completa e o mapeamento dos arquivos deste projeto estão documentados na pasta `docs/`.
Por favor, veja o arquivo [docs/maps.md](docs/maps.md) para navegar pela arquitetura.

## Autoria e Licença

Criado e mantido por **<Autor>**.

Este projeto está licenciado sob os termos da licença **<Nome da Licença>**. Para mais detalhes estruturais, veja o arquivo [LICENSE](LICENSE) na raiz.
```

## Template: docs/maps.md

```markdown
# Mapa Estrutural do Repositório

```text
(Aqui a IA deve inserir a saída em árvore listando o que tem no root, src, docs, spec, etc.)
```
```
