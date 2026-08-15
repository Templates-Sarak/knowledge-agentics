// Prova que `checkEnvRequired` DE FATO derruba o boot quando falta variavel.
// Sob `NODE_ENV=test` (todo o resto da suite) o bypass cala a checagem de proposito: sem `.env`
// real, qualquer teste derrubaria antes do primeiro `it()`. Isso deixa "suite verde" incapaz de
// provar, sozinha, que a fiacao de ambiente esta correta — so o boot real prova. Este teste fecha
// essa lacuna chamando a funcao com `NODE_ENV` DIFERENTE de "test", de proposito.
//
// Usa `<MODULO>_API_PORT` (ja declarada em module.json:requiredEnv pelo molde) em vez de inventar
// uma chave nova: uma chave sintetica usada via `process.env[...]` seria acusada por `env-declarado`
// — "usada no codigo e ausente do manifesto" — por um vazamento que nao tem nada a ver com este teste.
import { afterEach, describe, expect, it } from 'vitest';

import { checkEnvRequired, type Manifesto } from '../../api/src/config.js';

const CHAVE = '<MODULO>_API_PORT';

const MANIFESTO_BASE: Manifesto = {
  id: '<modulo>',
  name: '<Modulo>',
  version: '0.1.0',
  role: 'domain',
  basePath: '/api/v1/<modulo>',
  webPath: null,
  navigation: null,
  exportsSummary: false,
  data: { schema: '<escopo>', prefix: '<modulo>_', tables: [] },
  requiredEnv: [CHAVE],
  ports: [],
  permissions: [],
  publicRoutes: [],
  sensitiveFields: [],
};

const NODE_ENV_ORIGINAL = process.env['NODE_ENV'];
const VALOR_ORIGINAL = process.env[CHAVE];

afterEach(() => {
  process.env['NODE_ENV'] = NODE_ENV_ORIGINAL;
  if (VALOR_ORIGINAL === undefined) delete process.env[CHAVE];
  else process.env[CHAVE] = VALOR_ORIGINAL;
});

describe('checkEnvRequired', () => {
  it('derruba o boot quando falta variavel obrigatoria E o processo NAO esta em NODE_ENV=test', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env[CHAVE];
    expect(() => checkEnvRequired(MANIFESTO_BASE)).toThrow(/variaveis ausentes no ambiente/);
  });

  it('NAO derruba quando a variavel esta presente, mesmo fora de NODE_ENV=test', () => {
    process.env['NODE_ENV'] = 'production';
    process.env[CHAVE] = '3999';
    expect(() => checkEnvRequired(MANIFESTO_BASE)).not.toThrow();
  });
});
