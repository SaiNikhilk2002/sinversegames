/**
 * Reads a response body that may be empty or not JSON, as can happen when a
 * server, proxy or platform error page answers instead of our API. Never throws.
 */
export async function readJson<T extends object = Record<string, unknown>>(
  response: Response,
): Promise<Partial<T> & { error?: string }> {
  try {
    const text = await response.text();
    if (!text) return {};
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<T> & { error?: string })
      : {};
  } catch {
    return {};
  }
}

/** The JSON body of a successful response. Otherwise throws the server's message, or the fallback. */
export async function expectJson<T extends object>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = await readJson<T>(response);
  if (!response.ok || Object.keys(body).length === 0)
    throw new Error(typeof body.error === "string" && body.error ? body.error : fallback);
  return body as T;
}
