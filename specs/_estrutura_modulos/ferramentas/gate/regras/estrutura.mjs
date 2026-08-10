/**
 * regras/estrutura.mjs — família "Estrutura" do catálogo (specs/arquitetura/04-regras.md §4.1).
 * ids: manifesto, schema-manifesto, estrutura, estrutura-estrita, web-declarado, artefato-declarado,
 *      navegacao-declarada, testes, testes-web, testes-gateway, manifesto-raiz
 *
 * `manifesto-raiz` é de escopo `raiz` e mora aqui porque a FAMÍLIA é a mesma — o manifesto é o
 * item estrutural que declara a unidade. Escopo e família são eixos independentes.
 */
import { carregarEsquema, validar } from '../esquema.mjs';

const CAMPOS_OBRIGATORIOS = [
  'id', 'nome', 'versao', 'descricao', 'papel', 'binding', 'rotaBase', 'rotaWeb',
  'dados', 'envRequerido', 'portas', 'consome', 'ui', 'permissoes',
  'rotasPublicas', 'camposSensiveis', 'navegacao', 'exportaResumo', 'geraArtefato',
];

const PAPEIS = ['dominio', 'gateway', 'conector'];
const BINDINGS = ['typescript', 'javascript', 'python'];

const ENTRADAS_PERMITIDAS = new Set([
  'modulo.json', 'package.json', 'pyproject.toml', 'requirements.txt', 'README.md',
  '.env', '.env.example', '.gitignore', 'package-lock.json', 'node_modules',
  'tsconfig.json', 'tsconfig.build.json', 'jsconfig.json', 'vitest.config.ts', 'vitest.config.js',
  'eslint.config.mjs', 'eslint.config.js',
  // `relatorios/` e onde `npm run cobertura`/`pytest --cov` escrevem lcov+junit — ela so existe
  // depois de rodada, nunca escrita a mao, e e SEMPRE `relatorios/`, nos tres bindings (a config
  // dita isso, nao o nome do pacote — diferente do `.egg-info`, que carrega o nome do pacote e por
  // isso e tolerado por FORMA, nao por lista). `.gitignore` a cobre; aqui e so a arvore fechada.
  // `.coverage` e o banco SQLite que o `coverage.py` (por baixo do pytest-cov) escreve na RAIZ do
  // modulo, fora de `relatorios/` — nao e escolha nossa, e onde a ferramenta grava por padrao.
  // As DUAS travadas por maquina: `gate/testes/casos.mjs`, caso "schema-manifesto — CHAMARIZ" —
  // regride a tolerancia de qualquer uma e `estrutura-estrita` acusa um id nao declarado ali.
  'relatorios', '.coverage',
  // `dist/` NAO esta aqui, de proposito — medido (nao presumido) que a entrada seria
  // INALCANCAVEL: `gate/contexto.mjs:NAO_PERCORRER` (FORA de escopo) ja contem `'dist'`, e
  // `entradasRaiz` filtra tudo que esta em `NAO_PERCORRER` ANTES desta lista ser consultada
  // (unica excecao e `'gerados'`, via `CONTEUDO_IGNORADO_MAS_ENTRADA`) — `dist` nunca chega a
  // `ctx.entradasRaiz`, entao uma entrada aqui nunca teria efeito nenhum. Lista normativa com
  // item inalcancavel e declaracao sem efeito (o mesmo defeito que `'gerados'` teve nesta MESMA
  // lista, antes de `CONTEUDO_IGNORADO_MAS_ENTRADA` existir — lá a saída foi TORNAR alcançável
  // porque uma regra precisava; aqui nada precisa, entao a saída é não declarar).
  'contrato', 'config', 'core', 'api', 'web', 'database', 'tests', 'gerados',
]);

const CONFIGS = ['api', 'dominio', 'seguranca', 'portas', 'textos'];

/**
 * As três pastas que `geraArtefato` declara (01-modulo.md §2, "só se geraArtefato").
 *
 * `database/` fica DE FORA de propósito, embora o `criar-modulo.mjs --sem-artefato` também a
 * descarte: quem declara banco é `dados.tabelas`, não `geraArtefato`. Módulo sem artefato COM
 * tabela própria é o caso ordinário de domínio — cobrar `database/` aqui seria falso positivo
 * garantido nele.
 */
const PASTAS_DE_ARTEFATO = ['core/motor/', 'core/templates/', 'gerados/'];

/**
 * O conjunto obrigatório do molde que hoje NÃO TEM DONO — plan-2.md Bloco M. A árvore era fechada
 * por CIMA (`estrutura-estrita` reprova entrada não prevista) e aberta por BAIXO: um módulo podia
 * perder o domínio inteiro, as portas, o banco e a config de tipos, e o gate dizia "conforme".
 *
 * A fronteira com quem já cobra, para não haver duas mensagens para um defeito: `contrato/` é do
 * `contrato`; `web/` é do `web-declarado`; `core/motor`, `core/templates` e `gerados/` são do
 * `artefato-declarado`; `database/` é do `migrations`; `modulo.json` é do `manifesto`
 * (`ctx.manifestoErro`). Nada disso se repete aqui. `core/gateways/` também fica de fora, de
 * propósito: módulo sem `consome` legitimamente não tem gateway nenhum, e cobrá-lo seria falso
 * positivo garantido.
 */
const PASTAS_OBRIGATORIAS = ['core/dominio/', 'core/portas/'];

/**
 * O arquivo de manifesto/tipos que só o binding declarado exige (a tabela do plan-2.md Bloco M).
 * `requirements.txt` fica de fora: `pyproject.toml` já é o manifesto de dependência do binding
 * Python, e exigir os dois seria redundância sem verificador que a justifique.
 */
const ARQUIVOS_OBRIGATORIOS_POR_BINDING = {
  typescript: ['tsconfig.json', 'package.json'],
  javascript: ['package.json'],
  python: ['pyproject.toml'],
};

/** Existe ao menos um arquivo sob o prefixo informado? */
export function temArquivoEm(ctx, prefixo) {
  return ctx.arquivos.some((a) => a.rel.startsWith(prefixo));
}

/**
 * Barril da pasta — `index` em TS/JS, `__init__` em Python. Ele DOCUMENTA o slot e não é um gateway:
 * no molde ele exporta só `ErroDeGateway` e traz o gateway de verdade como exemplo comentado.
 */
const BARRIS_DE_PASTA = ['index', '__init__'];

/**
 * Os gateways REAIS do módulo, pelo nome do arquivo e sem os barris.
 *
 * UMA implementação, e as duas regras que a usam são as duas pontas do mesmo triângulo:
 * `gateway-declarado` casa este nome com `modulo.json:consome`, e `testes-gateway` o casa com o
 * teste que o espelha. Duas listas divergiriam no primeiro barril novo que alguém acrescentasse de
 * um lado só — e a exclusão de barril é justamente a parte fácil de esquecer.
 */
export function gatewaysDe(ctx) {
  return ctx.codigo
    .filter((a) => a.rel.startsWith('core/gateways/'))
    .map((a) => a.rel.split('/').pop().replace(/\.[^.]+$/, ''))
    .filter((nome) => !BARRIS_DE_PASTA.includes(nome));
}

/**
 * Existe teste que ESPELHA este alvo? A convenção é a da tabela canônica (§3.1, "Teste | espelha o
 * alvo + `.test`"), e a leitura é liberal de propósito nas quatro formas que as três linguagens
 * usam: a pergunta é se o teste EXISTE, não se o nome dele está canônico — nomenclatura de teste é
 * assunto do §3.1 e não tem verificador. Ser liberal aqui só reduz falso positivo.
 */
function temTesteDe(ctx, nome) {
  const formas = [`${nome}.test`, `${nome}.spec`, `test_${nome}`, `${nome}_test`];
  return ctx.arquivos.some((a) => {
    if (!a.eTeste) return false;
    return formas.includes(a.rel.split('/').pop().replace(/\.[^.]+$/, ''));
  });
}

/**
 * A pasta de artefato está presente?
 *
 * `gerados/` se detecta pela ENTRADA da raiz, não por arquivo: o conteúdo dela é saída de máquina e
 * fica fora de `ctx.arquivos` de propósito (varrê-lo faria as regras de código julgar HTML gerado).
 * As outras duas são fonte escrita à mão, e ali o arquivo é a prova — pasta vazia não é `core/motor`.
 */
function temPastaDeArtefato(ctx, pasta) {
  if (pasta !== 'gerados/') return temArquivoEm(ctx, pasta);
  return ctx.entradasRaiz.includes('gerados');
}

function conferirIdentidade(manifesto, ctx) {
  const achados = [];
  if (manifesto.id !== ctx.idPasta) {
    achados.push(`id "${manifesto.id}" difere do nome da pasta "${ctx.idPasta}"`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(manifesto.id ?? '')) {
    achados.push(`id "${manifesto.id}" nao e kebab-case minusculo`);
  }
  const rotaEsperada = `/api/v1/${manifesto.id}`;
  if (manifesto.rotaBase !== rotaEsperada) {
    achados.push(`rotaBase "${manifesto.rotaBase}" deveria ser "${rotaEsperada}"`);
  }
  return achados;
}

function conferirVocabulario(manifesto) {
  const achados = [];
  if (!PAPEIS.includes(manifesto.papel)) {
    achados.push(`papel "${manifesto.papel}" fora do vocabulario (${PAPEIS.join(', ')})`);
  }
  if (!BINDINGS.includes(manifesto.binding)) {
    achados.push(`binding "${manifesto.binding}" fora do vocabulario (${BINDINGS.join(', ')})`);
  }
  return achados;
}

export default [
  {
    id: 'manifesto',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifestoErro !== null) return [ctx.manifestoErro];
      const manifesto = ctx.manifesto;
      const faltando = CAMPOS_OBRIGATORIOS.filter((campo) => manifesto[campo] === undefined);
      if (faltando.length > 0) return [`campos ausentes no manifesto: ${faltando.join(', ')}`];
      return [...conferirIdentidade(manifesto, ctx), ...conferirVocabulario(manifesto)];
    },
  },
  {
    id: 'schema-manifesto',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // Sem manifesto legivel, a regra `manifesto` ja reprovou — nao empilhamos ruido em cima.
      if (ctx.manifesto === null) return [];
      return validar(ctx.manifesto, carregarEsquema('modulo'), 'modulo.json');
    },
  },
  {
    /**
     * O manifesto da RAIZ — existência, JSON válido e forma, sob UM id só.
     *
     * O módulo tem dois ids para isto (`manifesto` e `schema-manifesto`), e a fronteira entre eles é
     * dívida registrada: o `papel` inválido acusa nos dois. Aqui não se repete o erro, porque não há
     * o que separar — tudo que o `projeto.json` afirma é FORMA, e forma é exatamente o que o schema
     * expressa. O `manifesto` do módulo só existe além do schema por causa das cláusulas
     * relacionais (`id` = nome da pasta, `rotaBase` derivada do `id`), e a raiz não tem nenhuma:
     * ela não tem nome de pasta a casar nem rota a derivar.
     */
    id: 'manifesto-raiz',
    nivel: 'erro',
    escopo: 'raiz',
    verificar(projeto) {
      // Modulo solto (extraido e ainda nao religado) nao e projeto e nao tem raiz a declarar — a
      // mesma guarda de `verificacao-declarada` e `lint-derivado`.
      if (!projeto.ehProjeto) return [];
      const { presente, valor, erro } = projeto.manifesto;
      if (!presente) {
        return ['projeto.json ausente na raiz do projeto — a raiz declara o que exige do ambiente'
          + ' (schema em ferramentas/gate/schemas/projeto.schema.json). Sem ele, o segredo da'
          + ' fiacao (JWT, banco, provedor) nasce fora do .env.example e ninguem o cobra'];
      }
      if (valor === null) return [`projeto.json nao e JSON valido — ${erro}`];
      return validar(valor, carregarEsquema('projeto'), 'projeto.json');
    },
  },
  {
    id: 'estrutura',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      // `contrato/openapi.yaml` NAO entra aqui: a regra `contrato` e a dona do arquivo de ponta a
      // ponta (ausente, ilegivel, sem rota obrigatoria) e emite a mesma frase. Duas regras dizendo
      // "contrato/openapi.yaml ausente" e um defeito com duas mensagens — e a segunda nao acrescenta
      // conserto nenhum. Um defeito, uma mensagem, um conserto.
      if (!temArquivoEm(ctx, 'api/')) achados.push('api/ ausente');
      if (!temArquivoEm(ctx, 'tests/')) achados.push('tests/ ausente');
      for (const assunto of CONFIGS) {
        if (!ctx.configs[assunto].presente) achados.push(`config/${assunto}.json ausente`);
      }
      for (const pasta of PASTAS_OBRIGATORIAS) {
        if (!temArquivoEm(ctx, pasta)) achados.push(`${pasta} vazia ou ausente`);
      }
      if (!ctx.entradasRaiz.includes('README.md')) achados.push('README.md ausente');
      // Manifesto ilegivel e do `manifesto` (`ctx.manifestoErro`) — sem binding para consultar, o
      // conjunto por binding fica de fora, nao acusado duas vezes pelo mesmo defeito.
      const binding = ctx.manifesto?.binding;
      for (const nome of ARQUIVOS_OBRIGATORIOS_POR_BINDING[binding] ?? []) {
        if (!ctx.entradasRaiz.includes(nome)) {
          achados.push(`${nome} ausente — arquivo obrigatorio do binding "${binding}"`);
        }
      }
      return achados;
    },
  },
  {
    /**
     * `*.egg-info/` é o análogo Python de `node_modules` — artefato de INSTALAÇÃO, não entrada
     * escrita à mão —, e pelo mesmo motivo tolerado por forma em vez de nome fixo: o nome carrega
     * o `name` do `pyproject.toml` (`acme-registros` → `acme_registros.egg-info`), então não cabe
     * num `Set` de literais como `node_modules` cabe. `setuptools` grava esta pasta na ÁRVORE FONTE
     * — editável ou não — sempre que o pacote é instalado a partir do próprio diretório; é
     * comportamento do backend de build, não escolha deste template. É também o caso ORDINÁRIO do
     * módulo extraído (§1.1): sem projeto ao redor para instalar as dependências pela raiz, instalar
     * a partir da própria pasta do módulo é a única forma, e gera o mesmo artefato.
     */
    id: 'estrutura-estrita',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return ctx.entradasRaiz
        .filter((nome) => !ENTRADAS_PERMITIDAS.has(nome) && !nome.endsWith('.egg-info'))
        .map((nome) => `entrada nao prevista na raiz do modulo: "${nome}" — a arvore e fechada`);
    },
  },
  {
    id: 'web-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifesto?.rotaWeb == null) return [];
      const paginas = ctx.arquivos.filter((a) => a.rel.startsWith('web/src/pages/') && !a.eTeste);
      if (paginas.length === 0) return ['rotaWeb declarada mas web/src/pages nao tem pagina real'];
      return [];
    },
  },
  {
    /**
     * `navegacao` não-nulo significa que o conector monta uma entrada de menu para este módulo
     * (01-modulo.md §3.2, "o conector monta o menu a partir de `navegacao`"). Menu leva a uma tela,
     * e quem declara a tela é `rotaWeb`: `navegacao` com `rotaWeb: null` é entrada apontando para o
     * nada.
     *
     * UMA direção só, e a inversa é legítima de propósito: `rotaWeb` sem `navegacao` é a página
     * alcançável por URL direta e fora do menu. A doutrina em lugar nenhum exige que toda tela
     * esteja no menu — cobrar isso proibiria a tela de detalhe, que é o caso ordinário.
     *
     * `icone` não é verificável e não é tentado: não existe conjunto de ícones conhecido pelo
     * template (§7.2).
     */
    id: 'navegacao-declarada',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const navegacao = ctx.manifesto?.navegacao;
      // Forma do objeto e do `schema-manifesto`; aqui so importa a declaracao existir.
      if (navegacao == null) return [];
      if (ctx.manifesto?.rotaWeb != null) return [];
      return ['navegacao declarada mas rotaWeb e null — o conector monta o menu a partir de'
        + ' navegacao, e a entrada apontaria para o nada. Declare rotaWeb, ou zere navegacao'];
    },
  },
  {
    id: 'artefato-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // BIDIRECIONAL: `true` exige as tres, `false` proibe as tres. A doutrina autoriza os DOIS
      // consertos ("Descartar e permitido; renomear, nao"), entao a mensagem nomeia os dois — dizer
      // so um manda o autor criar pasta que ele decidiu, com razao, nao ter.
      //
      // Guarda de aplicabilidade primeiro: manifesto ausente ou ilegivel e do `manifesto`, e campo
      // ausente ou de tipo errado e do `schema-manifesto`. So declaracao booleana de verdade entra.
      if (typeof ctx.manifesto?.geraArtefato !== 'boolean') return [];

      const divergentes = PASTAS_DE_ARTEFATO
        .filter((pasta) => temPastaDeArtefato(ctx, pasta) !== ctx.manifesto.geraArtefato);
      if (divergentes.length === 0) return [];

      const todas = PASTAS_DE_ARTEFATO.join(', ');
      if (ctx.manifesto.geraArtefato) {
        return [`geraArtefato: true mas ${divergentes.join(', ')} ausente no modulo — crie o que falta, `
          + `ou declare geraArtefato: false e descarte as tres (${todas}). Descartar e permitido; renomear, nao`];
      }
      return [`geraArtefato: false mas ${divergentes.join(', ')} presente no modulo — descarte o que sobra, `
        + `ou declare geraArtefato: true e tenha as tres (${todas}). Descartar e permitido; renomear, nao`];
    },
  },
  {
    id: 'testes',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      if (!temArquivoEm(ctx, 'tests/dominio/')) achados.push('tests/dominio/ vazio ou ausente');
      if (!temArquivoEm(ctx, 'tests/contrato/')) achados.push('tests/contrato/ vazio ou ausente');
      return achados;
    },
  },
  {
    /**
     * A terceira camada de teste do §5, com a MESMA guarda de `web-declarado`: quem declara a tela
     * é `rotaWeb`, e módulo sem tela não tem o que testar. `criar-modulo.mjs --sem-web` remove
     * `tests/web` E zera `rotaWeb`, então a condicional casa sozinha — a regra não cobra nada de
     * quem decidiu, com razão, não ter tela.
     *
     * Verifica PRESENÇA, nunca conteúdo: o §5 pede os três estados (`loading`, `empty`, `error`) e
     * isso não é decidível por máquina. A mensagem os cita para o conserto ser o certo, e a regra
     * afirma só o que checa.
     */
    id: 'testes-web',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifesto?.rotaWeb == null) return [];
      if (temArquivoEm(ctx, 'tests/web/')) return [];
      return ['rotaWeb declarada mas tests/web/ vazio ou ausente — a tela declarada precisa de teste'
        + ' (§5 pede os tres estados: loading, empty, error). Ou crie o teste, ou descarte a tela'
        + ' zerando rotaWeb'];
    },
  },
  {
    /**
     * O terceiro lado do triângulo `gateway ⟷ consome ⟷ teste`. Os outros dois já existiam:
     * `gateway-declarado` liga o arquivo ao `consome`, e `consome-contrato` liga o `consome` ao
     * contrato do dono. Faltava o teste — e sem ele uma dependência entre módulos podia existir,
     * declarada e conforme, sem uma linha que a exercitasse.
     *
     * NÃO é "tem arquivo na pasta" com outro nome: `testes` cobra a PASTA (`tests/dominio/`,
     * `tests/contrato/` não-vazias), e esta cobra UM teste POR gateway. Um módulo com três gateways
     * e um teste passa naquela e cai nesta.
     *
     * A pasta do teste não é imposta: o §5 não tem camada `tests/gateways/`, então o teste vive onde
     * couber (`tests/contrato/`, `tests/dominio/`) e o que se cobra é o NOME que espelha o gateway.
     */
    id: 'testes-gateway',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return gatewaysDe(ctx)
        .filter((nome) => !temTesteDe(ctx, nome))
        .map((nome) => `core/gateways/${nome}: gateway sem teste — ele e uma dependencia de OUTRO`
          + ' modulo, e dependencia entre modulos nao existe sem teste que a exercite. Crie um teste'
          + ` que espelhe o nome (${nome}.test.* ou test_${nome}.*)`);
    },
  },
];
