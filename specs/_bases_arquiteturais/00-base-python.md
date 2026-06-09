# Arquitetura Base: Python

> **Contexto:** Esta é a fundação arquitetural do projeto. Todo o desenvolvimento Python dentro deste repositório deve obedecer às diretrizes aqui definidas.

## 1. Regras do Ecossistema Sarak (Obrigatório)
A IA deve **obrigatoriamente** submeter todo código gerado às seguintes skills globais:
- `padrao-escrita`: Padrão limiar global de Clean Code, Modularidade (compatível com microservices) e Nomenclatura.
- `padrao-python`: Idiomas específicos, Type Hints rigorosos e estruturação em Python.

## 2. Stack Tecnológico e Arquitetura
- **Linguagem**: Python 3.11+
- **Paradigma**: Priorize funções puras e injeção de dependências. Design domain-driven e desacoplado.
- **Gerenciador de Dependências**: Ambiente virtual local (`.venv`) isolado.

## 3. Qualidade e Tooling (Via Sarak Global)
Não instale ferramentas de auditoria localmente no repositório. O tooling de IA roda via contexto global:
- **Testes**: `<SARAK_PYTHON_VENV> -m pytest` (Cobertura-alvo ~80% conforme padrao-escrita §9).
- **Auditoria de Código**: Validação feita via validador próprio do Sarak (`scripts/validate.py`).

## 4. Segurança
- Tolerância ZERO para segredos hardcoded (A skill `cyber-segredos` fará o gate de commit).
- Variáveis sensíveis sempre via `.env` ou gerenciador de segredos.
