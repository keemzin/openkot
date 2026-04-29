const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const surah = process.argv[2];
  const ayah = process.argv[3];

  if (!surah || !ayah) {
    console.error('Usage: node fetch_verse.js <surah> <ayah>');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const url = `https://quranwbw.com/${surah}:${ayah}`;
    console.log(`Loading verse ${surah}:${ayah} from quranwbw.com...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const content = await page.content();
    const outputDir = path.join(__dirname, '..', 'fetched_verses');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `quranwbw_${surah}_${ayah}.html`);
    fs.writeFileSync(outputPath, content);
    
    console.log(`Saved: ${outputPath}`);
    console.log('Page title:', await page.title());
    console.log('SUCCESS');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
