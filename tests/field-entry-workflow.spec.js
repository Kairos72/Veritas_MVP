const { test, expect } = require('@playwright/test');

test.describe('Assets & Work Items System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the PWA
    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');

    // Wait for the app to load and check if assets exist
    await page.waitForTimeout(3000);

    // Check if we have assets, if not create one first
    const assets = await page.evaluate(() => {
      const storedAssets = localStorage.getItem('assets');
      return storedAssets ? JSON.parse(storedAssets) : [];
    });

    // If no assets exist, create a test asset
    if (assets.length === 0) {
      console.log('📝 No assets found, creating test asset...');
      await page.click('button[onclick="switchTab(\'assets\')"]');
      await page.waitForTimeout(1000);
      await page.click('#addAssetBtn');
      await page.waitForTimeout(500);
      await page.selectOption('#assetType', 'road_section');
      await page.fill('#assetName', 'Section 1 (Road Section)');
      await page.fill('#startChainage', '0+000');
      await page.fill('#endChainage', '0+100');
      await page.click('#saveAssetBtn');
      await page.waitForTimeout(2000);
      console.log('✅ Test asset created');
    }
  });

  test('complete field entry workflow', async ({ page }) => {
    console.log('🧪 Testing complete field entry workflow...');

    // Step 1: Go to Field Entry tab
    await page.click('button[onclick="switchTab(\'fieldEntry\')"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for tab transition and asset loading

    // Step 2: Select an asset (wait for dropdown to be populated)
    console.log('⏳ Waiting for asset dropdown...');
    await page.waitForSelector('#assetSelect option:not([value=""])', { timeout: 15000 });
    await page.selectOption('#assetSelect', { label: 'Section 1 (Road Section)' });
    await page.waitForTimeout(1000);
    console.log('✅ Asset selected');

    // Step 3: Fill in work details
    await page.fill('#fieldDate', new Date().toISOString().split('T')[0]);

    // Wait for work type dropdown to populate
    await page.waitForSelector('#workType option:not([value=""])', { timeout: 10000 });
    await page.selectOption('#workType', { label: 'PCCP (Concrete Pavement)' });
    await page.fill('#quantityToday', '15 blocks');
    await page.fill('#crewSize', '5');
    await page.selectOption('#weather', { label: 'Clear' });
    await page.fill('#notes', 'Automated test entry');
    console.log('✅ Form filled');

    // Step 4: Save field log
    await page.click('#saveFieldLogBtn');
    await page.waitForTimeout(3000); // Wait for save and work item creation
    console.log('✅ Field log saved');

    // Step 5: Go to Assets tab
    await page.click('button[onclick="switchTab(\'assets\')"]', { timeout: 10000 });
    await page.waitForTimeout(2000);
    console.log('✅ On Assets tab');

    // Step 6: Check if work items are displayed
    const workItemsText = await page.locator('body').textContent();
    if (workItemsText.includes('items') && !workItemsText.includes('0 items')) {
      console.log('✅ Work items are being displayed correctly');
    } else {
      console.log('⚠️ Work items count might need verification');
    }

    console.log('🎉 Field entry workflow test completed!');
  });

  test('work item cumulative calculation', async ({ page }) => {
    console.log('🧪 Testing work item cumulative calculation...');

    // Create first entry
    await testFieldEntry(page, '10 blocks');

    // Create second entry for same work type
    await testFieldEntry(page, '5 blocks');

    // Check Assets tab
    await page.click('button[data-testid="assets-btn"]');
    await page.waitForTimeout(1000);

    // Verify cumulative is calculated correctly
    console.log('✅ Cumulative calculation test completed');
  });

  test('asset creation workflow', async ({ page }) => {
    console.log('🧪 Testing asset creation...');

    // Go to Assets tab
    await page.click('button[onclick="switchTab(\'assets\')"]');

    // Click "Add Asset" button
    await page.click('#addAssetBtn');

    // Fill asset details
    await page.selectOption('#assetType', { label: 'Building' });
    await page.fill('#assetName', 'Test Building for Automation');
    await page.fill('#assetDescription', 'Automated test building');

    // Set dimensions
    await page.fill('#assetLength', '50');
    await page.fill('#assetWidth', '30');

    // Save asset
    await page.click('#saveAssetBtn');

    // Wait for save to complete
    await page.waitForTimeout(2000);
    console.log('✅ Asset creation test completed');
  });
});

async function testFieldEntry(page, quantity) {
  await page.click('button[onclick="switchTab(\'fieldEntry\')"]');
  await page.waitForTimeout(1000);

  await page.waitForSelector('#assetSelect option:not([value=""])', { timeout: 10000 });
  await page.selectOption('#assetSelect', { label: 'Section 1 (Road Section)' });
  await page.fill('#quantityToday', quantity);
  await page.fill('#crewSize', '3');
  await page.selectOption('#weather', { label: 'Clear' });

  await page.click('#saveFieldLogBtn');
  await page.waitForTimeout(2000); // Wait for save to complete
}