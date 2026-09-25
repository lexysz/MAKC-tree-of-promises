/**
 * Утилиты работы с подразделениями.
 * Поле `who` может содержать несколько подразделений,
 * разделённых запятой или слэшем (кросс-функциональные обещания).
 */

const DEPARTMENT_SEPARATORS = /[,/]/;

/** Разбирает строку «Кто даёт» на список подразделений. */
export function parseDepartments(who?: string): string[] {
  if (!who) return [];
  return who
    .split(DEPARTMENT_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Проверяет, входит ли подразделение в список ответственных за обещание. */
export function matchesDepartment(who: string | undefined, department: string): boolean {
  return parseDepartments(who).includes(department);
}

/** Кросс-функциональное ли обещание (2+ подразделения). */
export function isMultiDepartment(who?: string): boolean {
  return parseDepartments(who).length > 1;
}
