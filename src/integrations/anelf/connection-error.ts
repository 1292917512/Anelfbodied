export class ConnectionFailure extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

/** Converts transport failures to actionable messages without exposing request credentials. */
export function connectionFailure(error: unknown): ConnectionFailure {
  if (error instanceof ConnectionFailure) return error;
  const codes = new Set<string>();
  const collect = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    const entry = value as { code?: string; name?: string; cause?: unknown; errors?: unknown[] };
    if (entry.code) codes.add(entry.code);
    if (entry.name) codes.add(entry.name);
    collect(entry.cause, depth + 1);
    if (Array.isArray(entry.errors)) entry.errors.forEach((item) => collect(item, depth + 1));
  };
  collect(error);
  if (codes.has('ECONNREFUSED'))
    return new ConnectionFailure('服务未启动或端口不可达，请检查频道地址和服务状态');
  if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN'))
    return new ConnectionFailure('无法解析服务地址，请检查域名和网络');
  if ([...codes].some((code) => /CERT|TLS|SSL/.test(code)))
    return new ConnectionFailure('HTTPS 证书校验失败，请检查服务证书和系统时间', false);
  if ([...codes].some((code) => /TIMEOUT|TIMEDOUT|TimeoutError/.test(code)))
    return new ConnectionFailure('连接超时，请检查服务状态和网络');
  return new ConnectionFailure('无法保持频道连接，请检查服务状态和网络');
}

export function checkStreamResponse(response: Response): void {
  if ([401, 403].includes(response.status))
    throw new ConnectionFailure('认证失败，请检查频道 API Token', false);
  if (response.status === 404)
    throw new ConnectionFailure('未找到频道接口，请填写 HTTP API 地址，而非 WebUI 地址', false);
  if (!response.ok)
    throw new ConnectionFailure(
      `服务返回 HTTP ${response.status}，请检查频道服务`,
      response.status >= 500 || response.status === 429,
    );
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream'))
    throw new ConnectionFailure('该地址未返回频道事件流，请确认是 Anelf HTTP API 地址', false);
}
