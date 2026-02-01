const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok || (!RETRYABLE_STATUS.has(response.status) && response.status < 500)) {
        return response;
      }

      // Retryable status — fall through to retry logic
      if (attempt === maxRetries) return response;

      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      // Network error — retryable
      if (attempt === maxRetries) throw err;
      lastError = err;
    }

    // Exponential backoff: 1s, 2s
    const delay = 1000 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError;
}
