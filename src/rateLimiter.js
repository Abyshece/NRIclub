// Security: Rate limiter
export const rateLimiter = (() => {
  const attempts = {};
  return {
    check: (key, maxAttempts = 5, windowMs = 900000) => {
      const now = Date.now();
      if (!attempts[key]) attempts[key] = [];
      // Clean old attempts
      attempts[key] = attempts[key].filter(t => now - t < windowMs);
      if (attempts[key].length >= maxAttempts) {
        const waitSecs = Math.ceil((windowMs - (now - attempts[key][0])) / 1000);
        return { allowed: false, waitSecs };
      }
      attempts[key].push(now);
      return { allowed: true };
    },
    reset: (key) => { delete attempts[key]; }
  };
})();
