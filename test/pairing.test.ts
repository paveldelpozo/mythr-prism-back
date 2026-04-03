import { describe, expect, it } from 'vitest';
import { createPairCode, isValidPairCodeFormat } from '../src/pairing.js';

describe('pairing code', () => {
  it('creates code in XXXX-XXXX-XXXX format', () => {
    const code = createPairCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('validates expected format only', () => {
    expect(isValidPairCodeFormat('ABCD-EFGH-2345')).toBe(true);
    expect(isValidPairCodeFormat('abc-1234-TEST')).toBe(false);
    expect(isValidPairCodeFormat('AAAA-BBBB')).toBe(false);
  });
});
