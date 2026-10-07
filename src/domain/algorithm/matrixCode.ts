/**
 * Raíz digital mediante congruencia módulo 9.
 *
 * Tiempo: O(1)
 * Memoria: O(1)
 */
export const digitalRoot = (n: number): number => {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return 1 + ((n - 1) % 9);
};

/**
 * Código:
 * Mes | Día | Año | Suma total reducida
 */
export const calculateMatrixCode = (
  day: number,
  month: number,
  year: number,
): string => {
  if (!day || !month || !year) return '';

  const m = digitalRoot(month);
  const d = digitalRoot(day);
  const y = digitalRoot(year);
  const total = digitalRoot(m + d + y);

  return `${m} ${d} ${y} ${total}`;
};
