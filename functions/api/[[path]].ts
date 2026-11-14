// Proxy /api/* to the Worker so the app only needs one origin (works where *.workers.dev is blocked).
const UPSTREAM = 'https://darsnegar-api.mohammadjavadsharifi98.workers.dev';

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const url = new URL(request.url);
  const target = UPSTREAM + url.pathname + url.search;

  const res = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
};
