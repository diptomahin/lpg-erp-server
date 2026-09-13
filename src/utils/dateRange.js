const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

export const parseDate = (value) =>
  typeof value === "string" && dateOnly.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);

export const dateRange = (from, to) => {
  const start = from ? parseDate(from) : undefined;
  const end = to ? parseDate(to) : undefined;
  if (end && typeof to === "string" && dateOnly.test(to)) {
    end.setUTCHours(23, 59, 59, 999);
  }
  if (!start && !end) return {};
  return {
    ...(start ? { $gte: start } : {}),
    ...(end ? { $lte: end } : {}),
  };
};
