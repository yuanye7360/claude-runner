import { describe, expect, it } from 'vitest';

import { LABEL_COLORS, labelColor } from '../labelColor';

describe('labelColor', () => {
  it('returns a color class string from LABEL_COLORS', () => {
    const result = labelColor('test');
    expect(LABEL_COLORS).toContain(result);
  });

  it('returns consistent results for same input', () => {
    expect(labelColor('frontend')).toBe(labelColor('frontend'));
    expect(labelColor('backend')).toBe(labelColor('backend'));
  });

  it('distributes different labels across colors', () => {
    const labels = [
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
      'eta',
      'theta',
    ];
    const colors = new Set(labels.map((l) => labelColor(l)));
    // With 8 labels and 8 colors, expect at least 3 distinct colors
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });

  it('handles empty string', () => {
    const result = labelColor('');
    expect(LABEL_COLORS).toContain(result);
  });
});
