export async function request(method, payload = {}) {
  if (!window.simplyos?.request) throw new Error('API SimplyOS недоступно. Запустите проект через SDK или установите приложение на SimplyOS.');
  return window.simplyos.request(method, payload);
}
export const service = (method, params = {}) => request('services.call', {method, params});
