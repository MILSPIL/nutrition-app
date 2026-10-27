import { pathToFileURL } from 'node:url';
export function requireIsolatedBrowser() {
  if (!process.env.AGENT_TEST_BROWSER_SESSION && !(process.env.GITHUB_ACTIONS==='true' && process.env.RUNNER_OS==='Linux'))
    throw Error('isolated_browser_required');
}
export async function browserRuntime() {
  requireIsolatedBrowser();
  return process.env.AGENT_TEST_BROWSER_SESSION
    ? import(pathToFileURL(process.env.AGENT_TEST_PLAYWRIGHT_MODULE).href)
    : import('playwright');
}
