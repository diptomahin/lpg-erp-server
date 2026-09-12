const requests = new Map();
export const rateLimit =
  (windowMs = 60000, max = 100) =>
  (req, res, next) => {
    const now = Date.now();
    const current = requests.get(req.ip);
    if (!current || now - current.start >= windowMs)
      requests.set(req.ip, { start: now, count: 1 });
    else if (++current.count > max)
      return res
        .status(429)
        .json({ success: false, message: "Too many requests" });
    next();
  };
