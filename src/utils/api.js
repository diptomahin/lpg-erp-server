export const ok = (res, message, data = {}, status = 200) =>
  res.status(status).json({ success: true, message, data });
export const fail = (res, message, errors = [], status = 400) =>
  res
    .status(status)
    .json({ success: false, message, ...(errors.length ? { errors } : {}) });
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export const paginate = (req) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
});
export const listResponse = (res, message, rows, total, page, limit) =>
  ok(res, message, {
    rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
