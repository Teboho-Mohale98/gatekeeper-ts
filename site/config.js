/**
 * Landing-page configuration.
 *
 * Point `apiBaseUrl` at the deployed GateKeeper TS API project on Vercel
 * (project gatekeeper-ts-api). HTTP and `wss://…/realtime` are served from the
 * same origin. If the URL is unreachable, visitors can still paste their own
 * API URL into the playground and it is remembered in localStorage.
 */
window.GATEKEEPER_CONFIG = {
  apiBaseUrl: 'https://gatekeeper-ts-api.vercel.app',
};
