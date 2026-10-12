// Testes dos rotulos do front do modulo <module>: valor armazenado e codigo de erro viram texto em portugues.
import { describe, expect, it } from 'vitest';

import texts from '../../config/texts.json';
import { errorCodeOf, errorText, statusLabel } from '../../web/src/api-client/labels.js';

describe('statusLabel', () => {
  it('returns the label declared in config/texts.json for a stored value', () => {
    expect(statusLabel(texts.statusLabels, 'active')).toBe(texts.statusLabels.active);
  });

  it('returns the value as it came when it has no label', () => {
    expect(statusLabel(texts.statusLabels, 'archived')).toBe('archived');
  });
});

describe('errorCodeOf', () => {
  it('reads the code an error carries', () => {
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 'NOT_FOUND' }))).toBe('NOT_FOUND');
  });

  it('returns null for an error without a string code', () => {
    expect(errorCodeOf(new Error('x'))).toBeNull();
    expect(errorCodeOf(Object.assign(new Error('x'), { code: 404 }))).toBeNull();
    expect(errorCodeOf('text')).toBeNull();
  });
});

describe('errorText', () => {
  it('translates a known code', () => {
    expect(errorText(texts.errorLabels, 'FORBIDDEN', texts.genericError)).toBe(texts.errorLabels.FORBIDDEN);
  });

  it('falls back to the generic text for no code or an unknown code', () => {
    expect(errorText(texts.errorLabels, null, texts.genericError)).toBe(texts.genericError);
    expect(errorText(texts.errorLabels, 'ECONNREFUSED', texts.genericError)).toBe(texts.genericError);
  });
});
