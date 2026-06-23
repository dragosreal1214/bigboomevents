// Bani: stocăm în „cents" (întregi). Helperi de formatare/transformare.

export const toCents = (lei) => Math.round(Number(lei) * 100);
export const toLei = (cents) => Math.round(cents) / 100;

// "149 lei", "1.250 lei" — formatare RO.
export const formatLei = (cents) =>
  new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toLei(cents));
