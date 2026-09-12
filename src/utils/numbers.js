export const round = (value, places = 2) =>
  Math.round((Number(value) + Number.EPSILON) * 10 ** places) / 10 ** places;
export const tonToKg = (ton) => round(Number(ton) * 1000, 3);
