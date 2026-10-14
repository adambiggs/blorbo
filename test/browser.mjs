import { chromium } from 'playwright-core';

export function launchChromium() {
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
}
