# Arquitetura Base: Java

> **Contexto:** Esta é a fundação arquitetural do projeto. Todo o desenvolvimento Java dentro deste repositório deve obedecer às diretrizes aqui definidas.

## 1. Regras do Ecossistema Sarak (Obrigatório)
A IA deve **obrigatoriamente** submeter todo código gerado às seguintes skills globais:
- `padrao-escrita`: Padrão limiar global de Clean Code, Modularidade e Nomenclatura.
- `padrao-java`: Idiomas Java modernos, imutabilidade, injeção de dependência e Spring Boot (se aplicável).

## 2. Stack Tecnológico e Arquitetura
- **Linguagem**: Java 17+
- **Paradigma**: Orientação a Objetos forte, princípios SOLID, uso obrigatório de DTOs para fronteiras externas.
- **Build Tool**: Maven (`pom.xml`) ou Gradle (`build.gradle`).

## 3. Qualidade e Tooling (Via Sarak Global)
- **Testes**: JUnit 5 + Mockito (Cobertura-alvo ~80% via plugin Jacoco).
- **Auditoria**: Validação de estilo via Checkstyle (regras definidas globalmente em `assets/checkstyle.xml`).

## 4. Segurança
- Nunca exponha entidades de banco de dados (`@Entity`) diretamente em APIs. O tráfego deve ocorrer via DTOs/Records.
- Injeção de dependências deve ser feita exclusivamente via construtor (evitar `@Autowired` em campos).
- Tolerância zero a segredos expostos (`cyber-segredos`).
