/**
 * LexoRank — lexicographic ranking for ordered collections.
 *
 * Pure functions using base-26 alphabet (a-z). Mirrors the backend
 * implementation in services/api/app/shared/lexorank.py.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length; // 26
const MID_IDX = BASE >> 1; // 13 → 'n'
const MIN_CHAR = ALPHABET[0]; // 'a'

function charIndex(c: string): number {
  return c.charCodeAt(0) - 97;
}

function indexChar(i: number): string {
  return ALPHABET[i];
}

/**
 * Computes floor((a + b) / 2) for two base-26 digit arrays of equal length.
 * Returns the midpoint digits and whether the result equals a (adjacent case).
 */
function midpointDigits(
  aDigits: number[],
  bDigits: number[],
): { mid: number[]; adjacentToA: boolean } {
  const L = aDigits.length;

  // Sum a + b into an (L+1)-digit array to absorb overflow.
  const sum = new Array<number>(L + 1).fill(0);
  let carry = 0;
  for (let i = L - 1; i >= 0; i--) {
    const s = aDigits[i] + bDigits[i] + carry;
    sum[i + 1] = s % BASE;
    carry = Math.floor(s / BASE);
  }
  sum[0] = carry;

  // Divide sum by 2 via long division.
  const midFull = new Array<number>(L + 1).fill(0);
  let rem = 0;
  for (let i = 0; i <= L; i++) {
    const val = rem * BASE + sum[i];
    midFull[i] = Math.floor(val / 2);
    rem = val % 2;
  }

  // Result fits in L digits (a < b, so (a+b)/2 < 26^L).
  const mid = midFull.slice(1);
  const adjacentToA = mid.every((d, i) => d === aDigits[i]);
  return { mid, adjacentToA };
}

export function rankBetween(before: string, after: string): string {
  if (before >= after) {
    throw new Error(`before (${before}) must be < after (${after})`);
  }

  const maxLen = Math.max(before.length, after.length);
  const aDigits = Array.from(before.padEnd(maxLen, MIN_CHAR), charIndex);
  const bDigits = Array.from(after.padEnd(maxLen, MIN_CHAR), charIndex);

  const { mid, adjacentToA } = midpointDigits(aDigits, bDigits);

  if (adjacentToA) {
    // Adjacent at this length — extend by appending midpoint char.
    return before + indexChar(MID_IDX);
  }

  const result = mid.map(indexChar).join("").replace(/a+$/, "");
  return result || indexChar(0);
}

export function rankBefore(existing: string): string {
  if (existing <= MIN_CHAR) {
    return MIN_CHAR + indexChar(MID_IDX);
  }
  return rankBetween(MIN_CHAR, existing);
}

export function rankAfter(existing: string): string {
  return existing + indexChar(MID_IDX);
}
