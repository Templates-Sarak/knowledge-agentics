// Testes do dominio do modulo <modulo> — regras e validacao, sem I/O.
import { describe, expect, it } from 'vitest';

import { ErroDeValidacao, buildRecord } from '../../core/domain/index.js';
import { generateArtifact } from '../../core/engine/index.js';
import { recordExample } from '../fixtures/index.js';

const STATUS_VALIDOS = ['rascunho', 'ativo', 'encerrado'];
const INSTANTE = '2024-01-01T00:00:00.000Z';

describe('buildRecord', () => {
  it('monta com o primeiro status quando nenhum e informado', () => {
    const registro = buildRecord({ titulo: 'Exemplo' }, STATUS_VALIDOS, '10001', INSTANTE);
    expect(registro).toEqual({
      hash: '10001',
      titulo: 'Exemplo',
      status: 'rascunho',
      criadoEm: INSTANTE,
    });
  });

  it('remove espaco em volta do titulo', () => {
    const registro = buildRecord({ titulo: '  Exemplo  ' }, STATUS_VALIDOS, '10001', INSTANTE);
    expect(registro.titulo).toBe('Exemplo');
  });

  it('recusa titulo vazio', () => {
    expect(() => buildRecord({ titulo: '   ' }, STATUS_VALIDOS, '10001', INSTANTE)).toThrow(ErroDeValidacao);
  });

  it('recusa status fora do vocabulario de config/domain.json', () => {
    expect(() =>
      buildRecord({ titulo: 'X', status: 'inventado' }, STATUS_VALIDOS, '10001', INSTANTE),
    ).toThrow(ErroDeValidacao);
  });

  it('nao inventa instante nem identificador — os dois vem de fora', () => {
    const registro = buildRecord({ titulo: 'X' }, STATUS_VALIDOS, '99999', INSTANTE);
    expect(registro.hash).toBe('99999');
    expect(registro.criadoEm).toBe(INSTANTE);
  });
});

describe('generateArtifact', () => {
  const template = '<h1>{{titulo}}</h1><p>{{hash}}</p>';

  it('e DETERMINISTICO: mesma entrada, saida identica', () => {
    const registro = recordExample();
    expect(generateArtifact(registro, template)).toBe(generateArtifact(registro, template));
  });

  it('escapa o que vai para HTML', () => {
    const registro = recordExample({ titulo: '<script>alert(1)</script>' });
    expect(generateArtifact(registro, template)).not.toContain('<script>');
  });

  it('preserva marcador sem valor em vez de apagar silenciosamente', () => {
    expect(generateArtifact(recordExample(), '{{inexistente}}')).toBe('{{inexistente}}');
  });
});
