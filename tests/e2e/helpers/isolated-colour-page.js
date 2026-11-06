// Test-owned browser context only: never enumerate physical devices or send analytics.
export async function isolateColourPage(page, baseURL) {
  let url;
  try { url = new URL(baseURL); } catch { throw new Error('Colour CI requires HTTP loopback on port 8080'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.port !== '8080' || url.username || url.password)
    throw new Error('Colour CI requires HTTP loopback on port 8080');
  const origin = url.origin;
  const errors = { origin, page: [], console: [], network: [], http: [], blockedExternal: [] };
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.console.push({ message: message.text(), url: message.location().url });
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin + '/')) errors.network.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (response.url().startsWith(origin + '/') && response.status() >= 400)
      errors.http.push({ url: response.url(), status: response.status() });
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    errors.blockedExternal.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    localStorage.setItem('64pad-tutorial-complete', '1');
    const emptyAccess = { sysexEnabled: true, inputs: new Map(), outputs: new Map(), addEventListener() {} };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => emptyAccess });
    Object.defineProperty(navigator, 'usb', { configurable: true, value: {
      getDevices: async () => [], requestDevice: async () => { throw new Error('USB disabled in browser regression'); },
    } });
  });
  return errors;
}
