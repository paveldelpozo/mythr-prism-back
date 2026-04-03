const SEGMENT_LENGTH = 4;
const SEGMENT_COUNT = 3;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomChar = (): string => {
  const index = Math.floor(Math.random() * ALPHABET.length);
  return ALPHABET[index] ?? 'X';
};

export const createPairCode = (): string => {
  const segments: string[] = [];

  for (let segmentIndex = 0; segmentIndex < SEGMENT_COUNT; segmentIndex += 1) {
    let segment = '';
    for (let charIndex = 0; charIndex < SEGMENT_LENGTH; charIndex += 1) {
      segment += randomChar();
    }
    segments.push(segment);
  }

  return segments.join('-');
};

export const isValidPairCodeFormat = (pairCode: string): boolean =>
  /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(pairCode.trim().toUpperCase());
