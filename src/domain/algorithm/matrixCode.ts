/**
 * Raíz digital mediante congruencia módulo 9.
 *
 * Tiempo: O(1)
 * Memoria: O(1)
 */
export const digitalRoot = (n: number): number => {
  if (!Number.isSafeInteger(n) || n <= 0) return 0;
  return 1 + ((n - 1) % 9);
};

const isValidDate = (day: number, month: number, year: number): boolean => {
  if (
    !Number.isSafeInteger(day)
    || !Number.isSafeInteger(month)
    || !Number.isSafeInteger(year)
    || day <= 0
    || month < 1
    || month > 12
    || year <= 0
  ) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
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
  if (!isValidDate(day, month, year)) return '';

  const m = digitalRoot(month);
  const d = digitalRoot(day);
  const y = digitalRoot(year);
  const total = digitalRoot(m + d + y);

  return `${m} ${d} ${y} ${total}`;
};
