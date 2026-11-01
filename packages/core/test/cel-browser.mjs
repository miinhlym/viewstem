import { build } from 'esbuild';
import { chromium } from 'playwright';
import { runBrowserCases } from './cel-browser-cases.mjs';
const bundle = await build({ entryPoints: [new URL('./cel-browser-cases.mjs', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'iife', globalName: 'CelChecks', write: false });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const web = await page.evaluate(() => CelChecks.runBrowserCases());
  const node = runBrowserCases();
  const failed = [...node, ...web].filter(row => !row.passed);
  console.log(JSON.stringify({ nodeVersion: process.version, browser: browser.version(), node: { total: node.length, passed: node.filter(row => row.passed).length }, chromium: { total: web.length, passed: web.filter(row => row.passed).length }, pageErrors, failed }, null, 2));
  if (failed.length || pageErrors.length) process.exitCode = 1;
} finally { await browser.close(); }
