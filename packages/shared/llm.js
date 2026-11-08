const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 30_000;
const DEFAULT_MAX_RETRIES = Math.max(0, Math.min(4, Number(process.env.LLM_MAX_RETRIES) || 2));
const RETRY_BASE_MS = Math.max(50, Number(process.env.LLM_RETRY_BASE_MS) || 350);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function chatCompletion(apiKey, apiUrl, messages, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxRetries = Number.isFinite(Number(opts.maxRetries))
    ? Math.max(0, Math.min(4, Number(opts.maxRetries)))
    : DEFAULT_MAX_RETRIES;
  const body = JSON.stringify({
    model: opts.model || 'deepseek-chat',
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 800,
    ...(opts.response_format ? { response_format: opts.response_format } : {}),
  });

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let res;
    try {
      res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      }, timeoutMs);
    } catch (e) {
      lastError = e?.name === 'AbortError'
        ? new Error(`DeepSeek request timed out after ${timeoutMs}ms`)
        : e;
      if (attempt >= maxRetries) break;
      await sleep(RETRY_BASE_MS * (attempt + 1));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      lastError = new Error(`DeepSeek ${res.status}: ${text.slice(0, 200)}`);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) throw lastError;
      await sleep(RETRY_BASE_MS * (attempt + 1));
      continue;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
  throw lastError || new Error('DeepSeek request failed');
}

function parseJsonFromLlm(text) {
  if (!text) throw new Error('empty LLM response');
  try {
    return JSON.parse(text);
  } catch (_) {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1].trim());
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('no JSON in LLM response');
  }
}

module.exports = { chatCompletion, parseJsonFromLlm };
