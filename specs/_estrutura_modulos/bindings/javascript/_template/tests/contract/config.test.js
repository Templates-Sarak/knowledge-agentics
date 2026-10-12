// Prova que `checkEnvRequired` DE FATO derruba o boot quando falta variavel.
// Sob `NODE_ENV=test` (todo o resto da suite) o bypass cala a checagem de proposito: sem `.env`
// real, qualquer teste derrubaria antes do primeiro `it()`. Isso deixa "suite verde" incapaz de
// provar, sozinha, que a fiacao de ambiente esta correta — so o boot real prova. Este teste fecha
// essa lacuna chamando a funcao com `NODE_ENV` DIFERENTE de "test", de proposito.
//
// Usa `<MODULE>_API_PORT` (ja declarada em module.json:requiredEnv pelo molde) em vez de inventar
// uma chave nova: uma chave sintetica usada via `process.env[...]` seria acusada por `env-declared`
// — "usada no codigo e ausente do manifesto" — por um vazamento que nao tem nada a ver com este teste.
import { afterEach, describe, expect, it } from 'vitest';

import { checkEnvRequired } from '../../api/src/config.js';

const KEY = '<MODULE>_API_PORT';

const BASE_MANIFEST = {
  id: '<module>',
  name: '<Module>',
  version: '0.1.0',
  role: 'domain',
  basePath: '/api/v1/<module>',
  webPath: null,
  navigation: null,
  exportsSummary: false,
  data: { schema: '<scope>', prefix: '<module_snake>_', tables: [] },
  requiredEnv: [KEY],
  ports: [],
  permissions: [],
  publicRoutes: [],
  sensitiveFields: [],
};

const NODE_ENV_ORIGINAL = process.env['NODE_ENV'];
const ORIGINAL_VALUE = process.env[KEY];

afterEach(() => {
  process.env['NODE_ENV'] = NODE_ENV_ORIGINAL;
  if (ORIGINAL_VALUE === undefined) delete process.env[KEY];
  else process.env[KEY] = ORIGINAL_VALUE;
});

describe('checkEnvRequired', () => {
  it('fails the boot when a required variable is missing AND the process is NOT under NODE_ENV=test', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env[KEY];
    expect(() => checkEnvRequired(BASE_MANIFEST)).toThrow(/variables missing from the environment/);
  });

  it('does NOT fail when the variable is present, even outside NODE_ENV=test', () => {
    process.env['NODE_ENV'] = 'production';
    process.env[KEY] = '3999';
    expect(() => checkEnvRequired(BASE_MANIFEST)).not.toThrow();
  });
});
