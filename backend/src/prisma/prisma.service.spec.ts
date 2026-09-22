import { resolveDatabasePoolMax } from './prisma.service';

describe('resolveDatabasePoolMax', () => {
  it('defaults to 3 so Cloud Run scale-out stays under Cloud SQL f1-micro max_connections', () => {
    expect(resolveDatabasePoolMax(undefined)).toBe(3);
    expect(resolveDatabasePoolMax('')).toBe(3);
    expect(resolveDatabasePoolMax('  ')).toBe(3);
  });

  it('parses a positive integer and caps at 25', () => {
    expect(resolveDatabasePoolMax('2')).toBe(2);
    expect(resolveDatabasePoolMax('10')).toBe(10);
    expect(resolveDatabasePoolMax('99')).toBe(25);
  });

  it('rejects invalid values', () => {
    expect(resolveDatabasePoolMax('0')).toBe(3);
    expect(resolveDatabasePoolMax('-1')).toBe(3);
    expect(resolveDatabasePoolMax('abc')).toBe(3);
  });
});
