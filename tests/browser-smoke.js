#!/usr/bin/env node
/* Optional real-browser smoke test (not part of `node tests/run.js`, needs Playwright):
 *   node tests/browser-smoke.js [outDir] [months]
 * Opens index.html over file://, creates a character, plays through campaigns and
 * governing by clicking the real UI, fails on any page error, and saves screenshots. */
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

(async () => {
  const outDir = process.argv[2] || path.join(__dirname, '..', 'screenshots');
  const months = Number(process.argv[3] || 60);
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = loadPlaywright();
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  const errors = [];
  async function run(viewport, tag) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.screenshot({ path: path.join(outDir, tag + '-01-title.png') });
    await page.click('text=New career');
    await page.fill('[data-bind="setup.name"]', 'Robin Castellano');
    await page.fill('[data-bind="setup.seed"]', 'browser-smoke');
    await page.selectOption('[data-bind="setup.homeState"]', 'MI');
    await page.click('[data-arg="charismatic"]');
    await page.click('[data-arg="workhorse"]');
    await page.screenshot({ path: path.join(outDir, tag + '-02-setup.png'), fullPage: true });
    await page.click('text=Begin career');
    await page.screenshot({ path: path.join(outDir, tag + '-03-career.png'), fullPage: true });
    // Declare for city council.
    const run = page.locator('tr:has-text("City Council Member") button:has-text("Run")');
    await run.click();
    let shots = 0;
    for (let i = 0; i < months; i++) {
      // Resolve blocking overlays.
      for (let k = 0; k < 6; k++) {
        if (await page.locator('.overlay.night').count()) {
          if (shots < 2) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(outDir, tag + '-night-' + shots + '.png') }); }
          await page.click('text=Skip to final results').catch(() => {});
          if (shots < 2) await page.screenshot({ path: path.join(outDir, tag + '-night-final-' + shots + '.png') });
          shots++;
          await page.click('.overlay.night button:has-text("Continue")');
          continue;
        }
        if (await page.locator('.overlay .choice').count()) { await page.locator('.overlay .choice:not([disabled])').first().click(); continue; }
        if (await page.locator('.overlay .modal').count()) { await page.keyboard.press('Escape'); continue; }
        break;
      }
      const phase = await page.evaluate(() => PG.ui.game.phase);
      if (phase === 'gameover') break;
      if (phase === 'campaign' && i % 3 === 0) {
        await page.click('.nav button:has-text("Campaign")');
        await page.click('text=Save plan');
        if (i < 4) await page.screenshot({ path: path.join(outDir, tag + '-04-campaign.png'), fullPage: true });
        for (const t of ['The race', 'Polls', 'Money', 'Voters']) { await page.click('.nav button:has-text("' + t + '")'); }
        if (i < 10) await page.screenshot({ path: path.join(outDir, tag + '-05-voters.png'), fullPage: true });
      }
      if (phase === 'governing' && i % 2 === 0) {
        for (const t of ['Office', 'Legislat', 'Budget', 'Groups', 'World', 'Profile', 'Log']) {
          const b = page.locator('.nav button:has-text("' + t + '")').first();
          if (await b.count()) await b.click();
        }
        await page.click('.nav button:has-text("Office")');
        if (shots >= 1 && i % 10 === 0) await page.screenshot({ path: path.join(outDir, tag + '-06-office-' + i + '.png'), fullPage: true });
        const leg = page.locator('.nav button:has-text("Legislat")').first();
        await leg.click();
        const det = page.locator('button:has-text("Details & whip count")').first();
        if (await det.count()) { await det.click(); if (i % 10 === 0) await page.screenshot({ path: path.join(outDir, tag + '-07-whip-' + i + '.png'), fullPage: true }); await page.keyboard.press('Escape'); }
        const sub = page.locator('button:has-text("Submit to the legislature")');
        if (await sub.count()) await sub.click();
        const sign = page.locator('button:has-text("Sign")').first();
        if (await page.locator('h3:has-text("On your desk")').count()) await sign.click();
        const reelect = page.locator('button:has-text("Seek reelection")').first();
        await page.click('.nav button:has-text("Office")');
        if (await reelect.count()) await reelect.click();
      }
      const btn = page.locator('.actionbar button.primary').first();
      if (await btn.isDisabled()) continue;
      await btn.click();
    }
    await page.screenshot({ path: path.join(outDir, tag + '-99-end.png'), fullPage: true });
    const state = await page.evaluate(() => ({ date: PG.ui.game.date, phase: PG.ui.game.phase, offices: PG.ui.game.player.history.map((h) => h.officeId), errors: PG.ui.game.log.filter((l) => l.type === 'error').map((l) => l.text) }));
    console.log(tag, JSON.stringify(state));
    errors.push(...state.errors.map((e) => tag + ' engine: ' + e));
    await page.close();
  }
  await run({ width: 1360, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'phone');
  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('Browser smoke test passed. Screenshots in', outDir);
})().catch((e) => { console.error(e); process.exit(1); });
