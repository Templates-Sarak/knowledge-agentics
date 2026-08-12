/**
 * rules/contract.mjs — família "Contrato" do catálogo (specs/arquitetura/04-regras.md §4.5).
 * ids: contrato, rota-nomenclatura, contrato-sincronizado, projecao-contrato, payload-camelcase,
 *      saida-sensivel, sensivel-em-saida, resumo-exportado, saida-crua
 *
 * O `contract/openapi.yaml` é a FONTE. Estas regras existem para que ele não seja ficção: o que
 * está na spec existe no código, o que está no código existe na spec, e nada sensível vaza.
 *
 * A leitura da spec mora em `../spec.mjs`, compartilhada com `consome-contrato` (Isolamento).
 *
 * Os dois extratores que julgam CODIGO — `rotasDoCodigo` e `chavesDaProjecao` — leem
 * `textoDeCodigo`, nunca `arquivo.conteudo`. Sobre o texto cru, um comentario que DOCUMENTA a lei
 * ("`paraContrato` nunca deve projetar `{ cpf }`") virava a violacao que ele proibe, e uma rota
 * desativada citada em comentario virava rota fora do contrato. Quem le a SPEC continua em
 * `spec.conteudo`, de proposito: em YAML nao ha comentario a descontar do que importa aqui.
 */
import {
  leiturasFalhas, normalizar, propriedadesDaResposta, rotasDaSpec, servidorDaSpec, specDe,
} from '../spec.mjs';
import { textoDeCodigo } from '../text.mjs';
import { CHAMADA_DE_LOG_VERBOS } from './operation.mjs';

const OBRIGATORIAS = ['/health', '/meta', '/resumo'];

/**
 * A forma que o leitor de bloco aceita, por seção. É o que falta numa mensagem que só diz
 * "não verifiquei": o autor precisa saber o que editar, e citar só *flow style* manda quem já
 * está em bloco refazer o que já fez.
 */
const FORMA_ACEITA = {
  paths: 'em "paths:", cada rota e uma chave de recuo EXATAMENTE 2 na propria linha '
    + '("  /registros:") e cada metodo, uma chave de recuo EXATAMENTE 4 ("    get:") — recuo '
    + 'diferente disso e bloco valido que o leitor nao alcanca',
  servers: 'em "servers:", o PRIMEIRO item declara "url:" — na linha do traco '
    + '("  - url: /api/v1/<modulo>") ou em qualquer outra linha do mesmo item; aspas simples ou '
    + 'duplas sao aceitas',
};

/**
 * A mensagem de spec ilegível, e o único lugar que a escreve. Dona: a regra `contract`.
 *
 * Nomeia a seção que falhou, e não uma causa: a detecção é agnóstica de propósito, e a mensagem
 * tem de ser fiel a isso. *Flow style* entra como a causa mais provável, não como a única —
 * `paths:` indentado com 4 espaços é bloco válido e chega aqui pelo mesmo caminho, e o autor que
 * lesse "reescreva em bloco" ficaria sem saída, exatamente o que esta mensagem existe para evitar.
 */
function mensagemIlegivel(falhas) {
  return `contract/openapi.yaml presente mas ILEGIVEL para o gate: a leitura de "${falhas.join(':" e "')}:" `
    + 'nao extraiu nada. O gate le YAML em BLOCO, sem dependencia externa — e o que permite ele viajar '
    + 'com o modulo extraido e rodar sem instalar nada. A causa mais comum e flow style ({...} numa linha '
    + `so), mas nao e a unica. O leitor aceita assim: ${falhas.map((f) => FORMA_ACEITA[f]).join('; ')}.`;
}

/**
 * Verbos que não podem ser SEGMENTO de path — a ação é o método HTTP (02-contrato-e-dados §2).
 * Inline como `SDKS_FORNECEDOR`: é vocabulário NORMATIVO fechado, parte da regra, não tunable de
 * projeto — mudá-lo é mudar a lei, e a lei não mora em config.
 *
 * Critério de inclusão: a palavra nomeia uma AÇÃO que o método HTTP já expressa. Substantivo de
 * recurso fica de fora, mesmo quando parece verbo — por isso `busca`, `lista` e `resumo` não
 * estão aqui, e `buscar`, `listar` estão. Os dois idiomas entram porque a doutrina manda rota em
 * português (§3.1 "Idioma") e a comparação é por segmento inteiro, nunca substring.
 */
const VERBOS_PROIBIDOS = new Set([
  // inglês
  'get', 'post', 'put', 'patch', 'delete', 'create', 'update', 'remove', 'list',
  'fetch', 'find', 'search', 'add', 'edit', 'new', 'save', 'send',
  // português
  'criar', 'atualizar', 'remover', 'deletar', 'apagar', 'excluir', 'listar', 'buscar',
  'procurar', 'pesquisar', 'adicionar', 'editar', 'novo', 'nova', 'obter', 'consultar',
  'salvar', 'gravar', 'alterar', 'cadastrar', 'inserir', 'enviar', 'gerar',
]);

/**
 * `saida-crua` (plan-2.md N.1) — duas metades, duas âncoras. Uma primeira formulação invertia as
 * DUAS ("qualquer identificador em `return`, em qualquer lugar") e falhou o próprio critério de
 * reversão do bloco: medida contra o molde de referência SEM MUTAÇÃO NENHUMA, produziu 14
 * identificadores exigindo isenção — muito acima do teto de ~6. A causa é a âncora, não o raio:
 * `return <id>` sem escopo casa qualquer função que devolve uma variável, não só resposta HTTP.
 *
 * MAPEADOR — vocabulário fechado, INTACTO desde antes do N.1. Nunca teve queixa; não muda.
 */
const PADRAO_MAPEADOR_RETURN = /return\s+(linha|linhas|row|rows)\s*$/;

/**
 * BORDA, TS/JS — `.json(<identificador>)` acusa SEMPRE, sem lista de isentos. Seguro por
 * construção: só existe onde uma resposta HTTP está de fato sendo montada, e a captura exige um
 * identificador PURO — `res.json({ total })` (objeto literal) e `res.json(paraContrato(x))`
 * (chamada de projeção) não casam porque o próximo caractere não é `)`.
 */
const PADRAO_BORDA_JSON = /\.json\(\s*([A-Za-z_]\w*)\s*\)/;

/** BORDA, Python — só dentro de handler decorado (`@router.<verbo>`). Python não tem `.json(...)`:
 * a borda É o `return` do handler, e só a indentação separa "dentro do handler" de "fora dele"
 * (`return router`, ao fim de `criar_rotas`, está no MESMO recuo do decorator — precisa calar). */
const PADRAO_DECORATOR_ROUTER = /^(\s*)@router\.(get|post|put|patch|delete)\(/;
const PADRAO_RETURN_IDENTIFICADOR = /^\s*return\s+([A-Za-z_][\w.]*)\s*$/;

function achadosDeBordaPython(arquivo) {
  const linhas = arquivo.linhasCodigo;
  const achados = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const decorador = PADRAO_DECORATOR_ROUTER.exec(linhas[i].texto);
    if (decorador === null) continue;
    const recuoDecorador = decorador[1].length;
    // a linha seguinte nao-branca e a assinatura (`async def ...:`), no MESMO recuo do decorator —
    // o corpo do handler so comeca depois dela.
    let inicioCorpo = i + 1;
    while (inicioCorpo < linhas.length && linhas[inicioCorpo].texto.trim() === '') inicioCorpo += 1;
    inicioCorpo += 1;
    for (let j = inicioCorpo; j < linhas.length; j += 1) {
      const { numero, texto } = linhas[j];
      if (texto.trim() === '') continue;
      const recuo = texto.length - texto.trimStart().length;
      if (recuo <= recuoDecorador) break; // dedent: saiu do corpo do handler
      if (PADRAO_MAPEADOR_RETURN.test(texto)) continue; // ja contado pelo mapeador, nao duplicar
      const retorno = PADRAO_RETURN_IDENTIFICADOR.exec(texto);
      if (retorno === null) continue;
      achados.push(`${arquivo.rel}:${numero}: devolve "${retorno[1]}" cru na resposta — monte a `
        + 'saida no mapeador, por allowlist (objeto literal ou chamada de projecao)');
    }
  }
  return achados;
}

function achadosSaidaCruaDoArquivo(arquivo) {
  const achados = [];
  for (const { numero, texto } of arquivo.linhasCodigo) {
    const borda = PADRAO_BORDA_JSON.exec(texto);
    if (borda !== null) {
      achados.push(`${arquivo.rel}:${numero}: devolve "${borda[1]}" cru na resposta — monte a `
        + 'saida no mapeador, por allowlist (objeto literal ou chamada de projecao)');
      continue;
    }
    if (PADRAO_MAPEADOR_RETURN.test(texto)) {
      achados.push(`${arquivo.rel}:${numero}: devolve registro cru — monte a saida no mapeador, por allowlist`);
    }
  }
  if (arquivo.rel.endsWith('.py')) achados.push(...achadosDeBordaPython(arquivo));
  return achados;
}

/** Rotas registradas no código, em qualquer binding. Normaliza `:hash` e `{hash}` para `{}`. */
function rotasDoCodigo(ctx) {
  const padroes = [
    /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /@\w*router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
  ];
  const rotas = new Set();
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !/^api\//.test(arquivo.rel)) continue;
    const texto = textoDeCodigo(arquivo);
    for (const padrao of padroes) {
      for (const achado of texto.matchAll(padrao)) rotas.add(normalizar(achado[2]));
    }
  }
  return rotas;
}

/** Recorta um bloco YAML por nome de chave, devolvendo o texto indentado sob ela. */
function blocoDe(yaml, padraoChave) {
  const trechos = [];
  let dentro = false;
  let recuoBase = 0;

  for (const linha of yaml.split(/\r?\n/)) {
    const recuo = linha.length - linha.trimStart().length;
    if (padraoChave.test(linha)) {
      dentro = true;
      recuoBase = recuo;
      continue;
    }
    if (dentro && linha.trim() !== '' && recuo <= recuoBase) dentro = false;
    if (dentro) trechos.push(linha);
  }
  return trechos.join('\n');
}

/**
 * Texto de tudo que sai numa RESPOSTA — incluindo os schemas de `components` alcançados por
 * `$ref` de dentro de `responses:`. Sem seguir o `$ref`, um campo sensível descrito num schema
 * compartilhado passava despercebido, que é o caso mais comum num contrato bem escrito.
 */
function trechosDeResposta(yaml) {
  const direto = blocoDe(yaml, /^\s*responses:\s*$/);
  const componentes = blocoDe(yaml, /^\s*schemas:\s*$/);
  const referenciados = new Set(
    [...direto.matchAll(/#\/components\/schemas\/(\w+)/g)].map((achado) => achado[1]),
  );

  const partes = [direto];
  for (const nome of referenciados) {
    partes.push(blocoDe(componentes, new RegExp(`^\\s*${nome}:\\s*$`)));
  }
  return partes.join('\n');
}

/**
 * Nomes de propriedade declarados em schema de RESPOSTA — as chaves filhas de cada `properties:`.
 *
 * Reusa `trechosDeResposta`, então schema de REQUISIÇÃO fica de fora de graça: `NovoRegistro` é
 * alcançado por `$ref` de dentro de `requestBody:`, nunca de `responses:`, e não entra no texto.
 *
 * A pilha de recuos existe para o aninhamento (`Erro.erro.codigo`): sem ela, entrar num
 * `properties:` interno perdia o escopo externo, e propriedade legítima ficava fora do conjunto —
 * o que viraria falso positivo, a direção de erro que esta regra não pode ter.
 */
function propriedadesDeResposta(yaml) {
  const nomes = new Set();
  const pilha = [];

  for (const linha of trechosDeResposta(yaml).split(/\r?\n/)) {
    if (linha.trim() === '') continue;
    const recuo = linha.length - linha.trimStart().length;
    while (pilha.length > 0 && recuo <= pilha[pilha.length - 1]) pilha.pop();
    const chave = linha.match(/^\s*([A-Za-z_]\w*)\s*:/);
    if (chave !== null && pilha.length > 0 && recuo === pilha[pilha.length - 1] + 2) {
      nomes.add(chave[1]);
    }
    if (/^\s*properties:\s*$/.test(linha)) pilha.push(recuo);
  }
  return nomes;
}

/** `servers[0].url` da spec confere com o `rotaBase` do manifesto. */
function conferirServidor(ctx, yaml) {
  const esperado = ctx.manifesto?.rotaBase ?? null;
  // Manifesto ausente ou sem rotaBase e do `manifesto`/`schema-manifesto` — nao acusamos duas vezes.
  if (esperado === null) return [];
  const declarado = servidorDaSpec(yaml);
  if (declarado === null) return ['contract/openapi.yaml nao declara servers[0].url — o prefixo do modulo fica implicito'];
  if (declarado !== esperado) {
    return [`contract/openapi.yaml: servers[0].url "${declarado}" diverge do rotaBase "${esperado}" do manifesto`];
  }
  return [];
}

/**
 * O verbo do segmento, ou `null`. Compara **palavra inteira** do kebab, nunca substring: por isso
 * `criar-item` e `listar-registros` caem (a palavra `criar` é um token), e `postagens` e
 * `novidades` NÃO caem (`post` e `new` não são token nenhum ali). Substring pegaria os dois.
 */
function verboNoSegmento(segmento) {
  return segmento.toLowerCase().split('-').find((palavra) => VERBOS_PROIBIDOS.has(palavra)) ?? null;
}

/** Cada segmento de um path: verbo proibido, kebab-case, e camelCase dentro de `{}`. */
function conferirSegmentos(rota) {
  const achados = [];
  for (const segmento of rota.split('/').filter((s) => s !== '')) {
    const parametro = segmento.match(/^\{(.*)\}$/);
    const verbo = parametro === null ? verboNoSegmento(segmento) : null;
    if (parametro !== null && !/^[a-z][A-Za-z0-9]*$/.test(parametro[1])) {
      achados.push(`rota "${rota}": parametro "{${parametro[1]}}" nao e camelCase`);
    } else if (verbo !== null) {
      achados.push(`rota "${rota}": segmento "${segmento}" carrega o verbo "${verbo}" — a acao e o metodo HTTP, nao o path`);
    } else if (parametro === null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segmento)) {
      achados.push(`rota "${rota}": segmento "${segmento}" nao e kebab-case minusculo`);
    }
  }
  return achados;
}

/**
 * Fim (exclusivo) do trecho que abre em `inicio`, contando profundidade de chaves.
 * `-1` quando o texto acaba sem fechar.
 */
function fimBalanceado(texto, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidade += 1;
    else if (texto[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Palavras que têm a FORMA de um sítio de definição sem definir nada — controle de fluxo (JS/PY) e
 * o próprio `return`. A exclusão mora aqui, dentro do reconhecedor único (plan-2.md N.2.2): antes só
 * o fechador precisava dela — o sítio nomeado nunca busca controle de fluxo, porque nenhuma dessas
 * palavras casa `PADRAO_NOME_PROJECAO`. Com os dois lados lendo a MESMA lista de candidatos, ela só
 * precisa existir uma vez.
 */
const PALAVRAS_DE_CONTROLE = new Set([
  'if', 'for', 'while', 'switch', 'case', 'default', 'catch', 'do', 'else', 'elif', 'try',
  'except', 'finally', 'with', 'return',
]);

/**
 * UM reconhecedor de "sítio de definição" — plan-2.md N.2.2. Antes existiam DOIS: o SÍTIO nomeado
 * (confirmar que um nome casado, `paraGama`, é definição e não referência) e o FECHADOR (achar
 * QUALQUER definição vizinha para fechar a janela). Os dois quase concordavam, e "quase" já rendeu
 * três defeitos — um por forma de sintaxe nova: função de topo (N.2), método de classe (N.2.1),
 * propriedade-arrow (N.2.2). O sítio era LARGO (identificador no início de linha lógica, sem olhar o
 * que vem depois) e o fechador ESTREITO (exigia `identificador(` depois) — toda forma que o primeiro
 * aceitava e o segundo não virava falso positivo sobre código correto. Consumido nos dois lados
 * agora, a divergência deixa de ser possível por CONSTRUÇÃO, em vez de precisar ser notada de novo a
 * cada sintaxe nova.
 *
 * Um candidato casa de duas formas, sem olhar o que vem DEPOIS do nome:
 *   - precedido de palavra-chave (`function`/`def`/`const`/`let`/`var`/`class`, com `export`/
 *     `default`/`async` opcionais antes dela);
 *   - identificador no INÍCIO da linha lógica (nada antes dele na linha, além de espaço).
 * A segunda forma é a LARGA: aceita, da mesma maneira, método de objeto/classe (`nome(...)`),
 * propriedade-arrow (`nome: (...) => ({…})`) e atribuição de módulo em Python
 * (`nome = lambda r: {...}`) — é o que agora fecha a janela num `nome: (...)` que antes só o sítio
 * enxergava. `class` entra na lista de palavras-chave: sem ela, `export class X { … }` era invisível
 * ao reconhecedor, e a janela de uma função de topo ANTES da classe atravessava a declaração inteira
 * sem nada em recuo zero para fechá-la (N.2.1).
 *
 * O guarda de RECUO (na chamadora, `proximaDefinicaoNoRecuo`) é o que torna a largura segura: uma
 * chave de objeto devolvido em várias linhas (`hash: registro.hash,`) também casa a forma larga, mas
 * está SEMPRE mais indentada que o sítio que abriu a janela — nunca fecha nada.
 */
const PADRAO_SITIO_DEFINICAO =
  /^([ \t]*)(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|def|const|let|var|class)\s+)?([A-Za-z_]\w*)/gm;

/** Todo candidato a sítio de definição do arquivo, na ordem em que aparece — a fonte única que
 * `sitiosDeDefinicao` (filtra por NOME) e `proximaDefinicaoNoRecuo` (filtra por RECUO) consomem. */
function candidatosDeDefinicao(conteudo) {
  const candidatos = [];
  for (const m of conteudo.matchAll(PADRAO_SITIO_DEFINICAO)) {
    const nome = m[2];
    if (PALAVRAS_DE_CONTROLE.has(nome)) continue;
    candidatos.push({ indice: m.index + m[1].length, recuo: m[1].length, nome });
  }
  return candidatos;
}

/** Só os candidatos cujo NOME casa `padraoNome` (ex.: `PADRAO_NOME_PROJECAO`) — os sítios de
 * DEFINIÇÃO da projeção, nunca uma referência: `registros.map(paraContrato)` nunca é candidato,
 * porque o nome não está no início da linha lógica ali. */
function sitiosDeDefinicao(conteudo, padraoNome) {
  const casaNome = new RegExp(padraoNome.source);
  return candidatosDeDefinicao(conteudo).filter((c) => casaNome.test(c.nome));
}

/** `return {`, `return ({` (TS/JS/Python), `=> ({` (arrow com retorno implícito de objeto) ou
 * `lambda ...: {` — o mesmo retorno implícito, forma Python (plan-2.md N.2.2). */
const PADRAO_RETORNO_OBJETO = /\breturn\s*\(?\s*\{|=>\s*\(\s*\{|\blambda\b[^:{}]*:\s*\{/g;

/** A próxima definição (qualquer nome) de recuo `<= recuoMaximo`, estritamente depois de
 * `apartirDe`, ou fim do arquivo. */
function proximaDefinicaoNoRecuo(conteudo, apartirDe, recuoMaximo) {
  for (const candidato of candidatosDeDefinicao(conteudo)) {
    if (candidato.indice <= apartirDe) continue;
    if (candidato.recuo <= recuoMaximo) return candidato.indice;
  }
  return conteudo.length;
}

/**
 * O texto de cada projeção, por JANELA + BALANCEAMENTO — não mais "a primeira `{` depois do nome".
 *
 * Para cada sítio de definição, a janela de busca vai do nome até a PRÓXIMA definição de recuo igual
 * ou menor (ou fim do arquivo): não é preciso saber onde a função termina, só que a busca pare antes
 * da definição vizinha — de topo para função de módulo, de método para método de classe. Dentro da
 * janela, cada `return {`/`return ({`/`=> ({` abre uma região balanceada — uma função de projeção com
 * dois `return` (detalhe e resumo) rende DUAS regiões, de propósito.
 *
 * Mata de graça o falso positivo do objeto intermediário (`const interno = { … }` dentro da função):
 * não está em posição de `return` nem de `=>`, então nunca casa `PADRAO_RETORNO_OBJETO` — nenhuma
 * guarda nova precisou ser escrita para isso.
 */
function regioesDeProjecao(conteudo, padraoNome) {
  const regioes = [];
  for (const { indice: inicioJanela, recuo: recuoSitio } of sitiosDeDefinicao(conteudo, padraoNome)) {
    const fimJanela = proximaDefinicaoNoRecuo(conteudo, inicioJanela, recuoSitio);
    const janela = conteudo.slice(inicioJanela, fimJanela);
    for (const ocorrencia of janela.matchAll(PADRAO_RETORNO_OBJETO)) {
      const abertura = inicioJanela + ocorrencia.index + ocorrencia[0].length - 1;
      const fim = fimBalanceado(conteudo, abertura);
      if (fim !== -1) regioes.push(conteudo.slice(abertura, fim));
    }
  }
  return regioes;
}

/**
 * Chaves de objeto literal devolvidas pela projeção de saída do mapeador, **sem repetir o par
 * (arquivo, chave)**.
 *
 * A mensagem das três consumidoras nomeia arquivo e campo, e mais nada — a região não guarda número
 * de linha. Duas regiões que projetam o mesmo campo produziam, então, a MESMA frase duas vezes, e a
 * segunda não dizia ao autor nada que a primeira já não dissesse: um defeito, uma mensagem. Um
 * mapeador com projeção de detalhe e de resumo publicando o mesmo campo é o caso ordinário disso.
 *
 * Aqui, e não em cada regra: `divergenciasDaProjecao` já tinha o `vistos` dela, e as outras duas
 * teriam de ganhar cópias — três guardas para um dado que nasce duplicado num lugar só.
 */
/** O laco de `achado` isolado do de `chavesDaProjecao` — so por isso o aninhamento cabe no limiar
 * que esta propria regra cobra do codigo do usuario (04-regras.md §4.7). */
function chavesDaRegiao(arquivo, regiao, vistos) {
  const chaves = [];
  // Chave apos `{` ou `,` — nao apenas no inicio da linha. Objeto escrito numa linha so
  // (`{ hash: x, criado_em: y }`) escapava inteiro quando a extracao exigia inicio de linha.
  // A regiao COMECA na `{`, entao a primeira chave tem o mesmo delimitador que as demais.
  for (const achado of regiao.matchAll(/[{,]\s*["']?([A-Za-z_]\w*)["']?\s*:/g)) {
    const par = `${arquivo.rel}|${achado[1]}`;
    if (vistos.has(par)) continue;
    vistos.add(par);
    chaves.push({ chave: achado[1], arquivo: arquivo.rel });
  }
  return chaves;
}

/**
 * O nome de uma função de PROJEÇÃO DE SAÍDA, pela convenção que a doutrina agora exige
 * (02-contrato-e-dados.md §3): começa com `para` seguido de maiúscula (`paraContrato`, `paraMeta`,
 * `paraColecao`) em TS/JS, ou `para_` em Python. Direção BANCO fica de fora por CONSTRUÇÃO, não por
 * lista: `linhaParaDominio`/`dominioParaLinha` têm "Para"/"para" no MEIO do nome, nunca no início —
 * `\b` garante que o casador não pare no meio de um identificador maior.
 */
const PADRAO_NOME_PROJECAO = /\bpara[A-Z]\w*|\bpara_\w+/g;

function chavesDaProjecao(ctx) {
  const vistos = new Set();
  const chaves = [];
  for (const arquivo of ctx.codigo) {
    if (arquivo.eTeste || !/mapper/i.test(arquivo.rel)) continue;
    for (const regiao of regioesDeProjecao(textoDeCodigo(arquivo), PADRAO_NOME_PROJECAO)) {
      chaves.push(...chavesDaRegiao(arquivo, regiao, vistos));
    }
  }
  return chaves;
}

/**
 * Chaves projetadas que nenhum schema de resposta declara. UMA direção só, de propósito.
 *
 * A inversa (propriedade declarada e nunca projetada) parece simétrica e não é: `/health`,
 * `/meta` e `/resumo` são montadas pela própria `api/`, e o schema `Erro` pelo tratador de erro —
 * nenhum deles passa pelo mapeador. Cobrá-la daria falso positivo garantido nos três moldes.
 */
function divergenciasDaProjecao(projetadas, declaradas) {
  const vistos = new Set();
  const achados = [];
  for (const { chave, arquivo } of projetadas) {
    // Chave fora de camelCase e do `payload-camelcase`. Ela JAMAIS estara no contrato (que fala
    // camelCase por regra), entao acusa-la aqui daria dois erros para um defeito so — e o segundo
    // apontaria para o conserto errado ("declare no contrato" em vez de "renomeie o campo").
    if (!/^[a-z][A-Za-z0-9]*$/.test(chave)) continue;
    if (declaradas.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    achados.push(`${arquivo}: campo "${chave}" e projetado na saida e NAO esta declarado em nenhum schema de RESPOSTA do openapi.yaml`);
  }
  return achados;
}

/** O laco de `campo` isolado do de `sensivel-em-saida.verificar` — mesma tecnica de
 * `chavesDaRegiao`, para o aninhamento caber no limiar (04-regras.md §4.7). */
function achadosDeCampoSensivelNaLinha(arquivo, numero, texto, sensiveis) {
  const achados = [];
  for (const campo of sensiveis) {
    if (new RegExp(`\\b${campo}\\b`).test(texto)) {
      achados.push(`${arquivo.rel}:${numero}: campo sensivel "${campo}" citado em chamada de log`);
    }
  }
  return achados;
}

export default [
  {
    id: 'contrato',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      if (spec === null) return ['contract/openapi.yaml ausente'];
      // DONA de "spec ilegivel": esta regra ja e a dona de o contrato existir e servir de fonte.
      // Ilegivel e da mesma classe que ausente — o arquivo esta la e nao pode ser usado.
      // UMA mensagem mesmo quando as duas leituras falham: e um defeito so, com um conserto so.
      const falhas = leiturasFalhas(spec.conteudo);
      if (falhas.length > 0) return [mensagemIlegivel(falhas)];
      return OBRIGATORIAS
        .filter((rota) => !spec.conteudo.includes(`${rota}:`))
        .map((rota) => `contract/openapi.yaml nao declara a rota obrigatoria "${rota}"`);
    },
  },
  {
    id: 'rota-nomenclatura',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU ilegivel e do `contract`; acusar aqui tambem so duplica o mesmo defeito.
      if (spec === null) return [];

      // Silencio SEPARADO por secao: `servers:` ilegivel nao cega a checagem de nome das rotas,
      // que so depende de `paths:`. Silenciar as duas juntas jogaria fora verificacao que da para
      // fazer — e o gate so deve deixar de verificar o que realmente nao conseguiu ler.
      const falhas = leiturasFalhas(spec.conteudo);
      const achados = falhas.includes('servers') ? [] : conferirServidor(ctx, spec.conteudo);
      if (falhas.includes('paths')) return achados;
      return achados.concat([...rotasDaSpec(spec.conteudo)].flatMap(conferirSegmentos));
    },
  },
  {
    id: 'contrato-sincronizado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`. Sem este silencio, uma spec que o
      // leitor nao alcanca faria esta regra AFIRMAR que toda rota do codigo falta no contrato —
      // falsidade, nao cegueira. So `paths:` importa aqui: `servers:` nao entra na comparacao.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];
      const naSpec = new Set([...rotasDaSpec(spec.conteudo)].map(normalizar));
      const noCodigo = rotasDoCodigo(ctx);

      // Nao achar rota nenhuma nao e conformidade — e cegueira. Dizer isso em voz alta e o que
      // impede a regra de "passar" num framework cujo registro de rota ela nao sabe ler.
      if (noCodigo.size === 0) {
        const temApi = ctx.codigo.some((a) => !a.eTeste && /^api\//.test(a.rel));
        return temApi
          ? ['nao foi possivel extrair rota do codigo — esta regra NAO verificou nada neste modulo']
          : [];
      }

      const achados = [];
      for (const rota of noCodigo) {
        if (!naSpec.has(rota)) achados.push(`rota "${rota}" existe no codigo e NAO no contract/openapi.yaml`);
      }
      for (const rota of naSpec) {
        if (!noCodigo.has(rota)) achados.push(`rota "${rota}" existe no contract/openapi.yaml e NAO no codigo`);
      }
      return achados;
    },
  },
  {
    id: 'projecao-contrato',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`; acusar aqui so duplica o defeito.
      // Sem isto, spec que o leitor nao alcanca zera `declaradas` e a regra acusaria TODO campo
      // projetado. Os schemas de resposta vivem dentro de `paths:`; `servers:` nao afeta isto.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];

      const projetadas = chavesDaProjecao(ctx);
      const temMapeador = ctx.codigo.some((a) => !a.eTeste && /mapper/i.test(a.rel));
      if (projetadas.length === 0) {
        return temMapeador
          ? ['nao foi possivel extrair projecao do mapeador — esta regra NAO verificou nada neste modulo']
          : [];
      }

      const declaradas = propriedadesDeResposta(spec.conteudo);
      if (declaradas.size === 0) {
        return ['nao foi possivel extrair propriedade de schema de RESPOSTA do openapi.yaml — esta regra NAO verificou nada neste modulo'];
      }
      return divergenciasDaProjecao(projetadas, declaradas);
    },
  },
  {
    id: 'payload-camelcase',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const { chave, arquivo } of chavesDaProjecao(ctx)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(chave)) {
          achados.push(`${arquivo}: campo "${chave}" na projecao nao e camelCase — o contrato fala camelCase`);
        }
      }
      const spec = specDe(ctx);
      if (spec === null) return achados;
      for (const achado of trechosDeResposta(spec.conteudo).matchAll(/^\s{6,}([a-z_][\w]*)\s*:\s*\{\s*type:/gm)) {
        if (/_/.test(achado[1])) {
          achados.push(`contract/openapi.yaml: propriedade de resposta "${achado[1]}" em snake_case — use camelCase`);
        }
      }
      return achados;
    },
  },
  {
    id: 'saida-sensivel',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const sensiveis = ctx.manifesto?.camposSensiveis ?? [];
      const spec = specDe(ctx);
      if (sensiveis.length === 0 || spec === null) return [];
      const resposta = trechosDeResposta(spec.conteudo);
      return sensiveis
        .filter((campo) => new RegExp(`\\b${campo}\\b`).test(resposta))
        .map((campo) => `campo sensivel "${campo}" aparece em schema de RESPOSTA do openapi.yaml`);
    },
  },
  {
    id: 'sensivel-em-saida',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const sensiveis = new Set(ctx.manifesto?.camposSensiveis ?? []);
      if (sensiveis.size === 0) return [];
      const achados = [];

      for (const { chave, arquivo } of chavesDaProjecao(ctx)) {
        if (sensiveis.has(chave)) {
          achados.push(`${arquivo}: campo sensivel "${chave}" na projecao de saida — mantenha fora, ou publique mascarado`);
        }
      }
      // O logger REDIGE por nome; citar o campo direto numa chamada de log burla a redacao.
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (!CHAMADA_DE_LOG_VERBOS.test(texto)) continue;
          achados.push(...achadosDeCampoSensivelNaLinha(arquivo, numero, texto, sensiveis));
        }
      }
      return achados;
    },
  },
  {
    id: 'resumo-exportado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // UMA direcao so, como `projecao-contrato`: `false` nao proibe nada. O modulo que nao entra
      // no dashboard pode ter `total` no `/resumo` dele sem que isso seja defeito de coisa alguma.
      if (ctx.manifesto?.exportaResumo !== true) return [];

      const spec = specDe(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`. Sem este silencio, "nao consegui ler"
      // viraria "nao declara" — afirmar ausencia do que nao se leu manda apagar o que esta certo.
      if (spec === null || leiturasFalhas(spec.conteudo).includes('paths')) return [];

      const declaradas = propriedadesDaResposta(spec.conteudo, '/resumo', 'get', '200');
      // `/resumo` ausente da spec e do `contract`, que ja a cobra como rota obrigatoria.
      if (declaradas === null || declaradas.has('total')) return [];
      return ['exportaResumo: true mas o schema 200 de GET /resumo nao declara "total" — o agregador '
        + 'cross-modulo compoe SEM lista fixa e so conhece a forma minima; sem ela, agregar exigiria '
        + 'um caso por modulo dentro do conector. Declare "total" (inteiro) na resposta de /resumo, '
        + 'ou exportaResumo: false'];
    },
  },
  {
    id: 'entrada-allowlist',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // A simetrica da `saida-crua`, na direcao da ENTRADA (02-contrato-e-dados §3.2: "allowlist de
      // campos — payload com campo desconhecido e rejeitado, nao ignorado").
      //
      // NAO proibe o corpo de ser passado adiante: o molde faz `criar(req.body as unknown, ...)`, e
      // a funcao chamada e justamente quem aplica a allowlist. Proibir a passagem acusaria o codigo
      // CORRETO. O que se proibe e o corpo virar entidade sem passar por ninguem — as tres formas
      // em que isso acontece.
      const padroes = [
        // 1. Espalhar o corpo dentro de um objeto/entidade: `{ ...req.body }`, `{**corpo}`.
        /\{\s*\*{2}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b|\.{3}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
        // 2. Corpo direto ao repositorio: `repositorio.inserir(req.body)`.
        /\b(?:repositorio|repository|repo)\.\w+\(\s*(?:req(?:uest)?\.)?(?:body|corpo)\s*[,)]/,
        // 3. Atribuicao em massa sobre uma entidade ja existente.
        /Object\.assign\([^,)]+,\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
      ];
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (padroes.some((padrao) => padrao.test(texto))) {
            achados.push(`${arquivo.rel}:${numero}: corpo da requisicao vira entidade sem allowlist`
              + ' — monte a entrada campo a campo, e rejeite campo desconhecido em vez de ignora-lo');
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'saida-crua',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        achados.push(...achadosSaidaCruaDoArquivo(arquivo));
      }
      return achados;
    },
  },
];
