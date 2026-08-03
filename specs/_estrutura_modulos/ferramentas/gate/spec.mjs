/**
 * spec.mjs — leitura do `contrato/openapi.yaml`. Lei dona: specs/arquitetura/04-regras.md
 *
 * Vive fora de `regras/` porque DUAS famílias precisam dela: `Contrato` verifica a spec contra o
 * código do próprio módulo, e `Isolamento` (`consome-contrato`) verifica a spec do módulo DONO
 * contra o `consome` de quem depende dele. Copiar o leitor para o segundo lugar faria a família
 * Isolamento divergir da Contrato sem ninguém notar — exatamente o defeito que o gate existe
 * para impedir.
 *
 * Como contexto.mjs, não toca o disco: recebe o texto (ou o contexto já montado) e devolve dado.
 */

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

/** Equipara `:hash`, `{hash}` e `{id}` — a spec e o código nomeiam o parâmetro de jeitos diferentes. */
export function normalizar(caminho) {
  return caminho.replace(/:[A-Za-z_]\w*/g, '{}').replace(/\{[^}]+\}/g, '{}');
}

/** O arquivo de contrato do módulo, ou `null` se ele não tiver. */
export function specDe(ctx) {
  return ctx.arquivos.find((a) => a.rel === 'contrato/openapi.yaml') ?? null;
}

/**
 * Mapa `caminho -> Set(MÉTODO)` do bloco `paths:`. Caminho é chave de recuo 2; método, de recuo 4.
 * Guardamos o caminho CRU (não normalizado) porque a mensagem de erro precisa citar o que está
 * escrito na spec, não uma forma canônica que o autor nunca digitou.
 */
export function operacoesDaSpec(yaml) {
  const operacoes = new Map();
  let atual = null;

  for (const linha of dentroDe(yaml, /^paths:\s*$/)) {
    const rota = linha.match(/^\s{2}(\/[^:\s]*):\s*$/);
    if (rota !== null) {
      atual = rota[1];
      operacoes.set(atual, new Set());
      continue;
    }
    const metodo = linha.match(/^\s{4}([a-z]+):\s*$/);
    if (metodo !== null && atual !== null && METODOS.includes(metodo[1])) {
      operacoes.get(atual).add(metodo[1].toUpperCase());
    }
  }
  return operacoes;
}

/** Caminhos declarados sob `paths:`. */
export function rotasDaSpec(yaml) {
  return new Set(operacoesDaSpec(yaml).keys());
}

/**
 * `servers[0].url` — o prefixo em que o módulo atende. `null` se a spec não declarar.
 *
 * É aqui que o prefixo mora, e NÃO nas chaves de `paths:`: a spec declara `/api/v1/<modulo>` em
 * `servers` e os paths saem dele relativos (`/health`). Procurar `/api/v1/` no path reprovaria
 * todo contrato conforme.
 */
export function servidorDaSpec(yaml) {
  let dentroDoPrimeiro = false;

  for (const linha of dentroDe(yaml, /^servers:\s*$/)) {
    const abreItem = /^\s*-(\s|$)/.test(linha);
    // Só o PRIMEIRO item: `servers[0]` é o que a regra compara. Ao ver o segundo traço, para —
    // senão um servidor alternativo (staging, mock) responderia pelo prefixo do módulo.
    if (abreItem && dentroDoPrimeiro) return null;
    if (abreItem) dentroDoPrimeiro = true;
    if (!dentroDoPrimeiro) continue;

    // `url:` em QUALQUER linha do item, não só na do traço: `- description: local` seguido de
    // `  url: …` é bloco YAML ordinário, e exigir a URL no traço reprovava contrato correto.
    const casado = linha.match(/^\s*(?:-\s*)?url:\s*(.+?)\s*$/);
    if (casado !== null) return semAspas(casado[1]);
  }
  return null;
}

/** `"/api/v1/x"` e `'/api/v1/x'` são o mesmo valor que `/api/v1/x` — a aspa é sintaxe, não dado. */
function semAspas(valor) {
  return valor.replace(/^(['"])([\s\S]*)\1$/, '$2');
}

/**
 * Quais leituras a spec declara e o leitor de bloco NÃO conseguiu fazer: `['paths']`,
 * `['servers']`, as duas, ou `[]` quando está tudo legível.
 *
 * O critério é verificável, não adivinhado: a seção existe no texto e a extração devolveu nada.
 * Não tentamos reconhecer *flow style* por sintaxe — tentamos ler, e concluímos pelo resultado.
 * Assim qualquer forma que o leitor não alcance cai aqui, não só a que previmos.
 *
 * Devolve QUAIS, e não um booleano, por duas razões: a mensagem precisa nomear a seção certa
 * (dizer "reescreva em bloco" para quem já está em bloco deixa o autor sem saída), e a regra que
 * só depende de `paths:` pode continuar verificando quando o ilegível é o `servers:`.
 *
 * Existe para que as regras parem de afirmar AUSÊNCIA quando a verdade é "não consegui ler".
 * Afirmar falsidade é pior que declarar cegueira: manda o autor apagar o que está certo.
 */
export function leiturasFalhas(yaml) {
  const falhas = [];
  if (/^\s*paths\s*:/m.test(yaml) && operacoesDaSpec(yaml).size === 0) falhas.push('paths');
  if (/^\s*servers\s*:/m.test(yaml) && servidorDaSpec(yaml) === null) falhas.push('servers');
  return falhas;
}

/** As linhas do bloco de uma chave de recuo zero — dela até a próxima chave de recuo zero. */
function dentroDe(yaml, padraoChave) {
  const linhas = [];
  let dentro = false;

  for (const linha of yaml.split(/\r?\n/)) {
    if (padraoChave.test(linha)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^\S/.test(linha)) break;
    linhas.push(linha);
  }
  return linhas;
}
