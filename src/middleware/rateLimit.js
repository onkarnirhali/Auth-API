// Simple in-memory fixed-window rate limiter
// Not for multi-instance/production use without a shared store (Redis/etc.)

function rateLimit({ windowMs, max, keyGenerator, message = 'Too many requests' }) {
  const store = new Map(); // key -> { count, resetAt }

  function cleanup(now) {
    // Lightweight cleanup to prevent unbounded growth
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    const key = (keyGenerator ? keyGenerator(req) : req.ip) + '|' + req.method + '|' + req.baseUrl + req.path;
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
      // opportunistic cleanup sometimes
      if (store.size > 1000) cleanup(now);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message, retryAfter: retryAfterSec });
    }

    next();
  };
}

module.exports = { rateLimit };

