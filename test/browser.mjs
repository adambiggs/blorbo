import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function launchChromium() {
  const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
}
