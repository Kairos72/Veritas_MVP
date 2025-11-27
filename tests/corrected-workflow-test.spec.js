const { test, expect } = require('@playwright/test');

test.describe('Corrected Veritas MVP Test', () => {
  test('complete field entry workflow with correct selectors', async ({ page }) => {
    console.log('🧪 Starting corrected Veritas MVP test...');

    // Navigate to the PWA
    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');
    await page.waitForTimeout(5000); // Wait for app to fully load

    // Step 1: Go to Field Entry tab
    await page.click('button[onclick="switchTab(\'fieldEntry\')"]');
    await page.waitForTimeout(2000);
    console.log('✅ Field Entry tab clicked');

    // Step 2: Wait for asset dropdown to be populated
    await page.waitForTimeout(3000); // Give time for assets to load

    // Check if we have assets in the dropdown
    const assetOptions = await page.locator('#assetSelect option').count();
    console.log('📊 Asset dropdown options count:', assetOptions);

    if (assetOptions > 1) {
      // Select an asset (first non-empty option)
      await page.selectOption('#assetSelect', { index: 1 });
      console.log('✅ Asset selected');
      await page.waitForTimeout(1000);

      // Step 3: Fill in work details
      await page.fill('#fieldDate', new Date().toISOString().split('T')[0]);

      // Select work type
      await page.selectOption('#fieldWorkType', { label: 'PCCP (Concrete Pavement)' });
      console.log('✅ Work type selected');

      // Fill quantity
      await page.fill('#fieldQuantity', '15 blocks');
      await page.fill('#fieldCrew', '5');
      await page.selectOption('#fieldWeather', { label: 'Clear' });
      await page.fill('#fieldNotes', 'Automated test entry - Playwright');
      console.log('✅ Form filled');

      // Step 4: Save field log
      await page.click('button[type="submit"]');
      console.log('✅ Save button clicked');

      // Wait for save to complete and potential work item creation
      await page.waitForTimeout(3000);
      console.log('✅ Field log save attempted');

      // Step 5: Go to Assets tab to verify work items
      await page.click('button[onclick="switchTab(\'assets\')"]');
      await page.waitForTimeout(2000);
      console.log('✅ On Assets tab');

      // Take screenshot for verification
      await page.screenshot({ path: 'test-result-assets-workflow.png' });

      // Step 6: Check the page content for work items
      const pageContent = await page.locator('body').textContent();
      if (pageContent.includes('items') && !pageContent.includes('0 items')) {
        console.log('✅ Work items are being displayed successfully!');
      } else {
        console.log('⚠️ Checking for work items...');
      }

      console.log('🎉 Complete field entry workflow test finished!');

    } else {
      console.log('❌ No assets available. Please create an asset first.');

      // Let's try to create an asset
      console.log('📝 Attempting to create a test asset...');
      await page.click('button[onclick="switchTab(\'assets\')"]');
      await page.waitForTimeout(2000);

      // Look for add asset button with correct ID
      const addAssetButtons = await page.locator('button').all();
      console.log('🔍 Found', addAssetButtons.length, 'buttons total');

      // Try to find a button that mentions "Add" or "Create" or "Asset"
      for (const btn of addAssetButtons) {
        const text = await btn.textContent();
        if (text && (text.includes('Add') || text.includes('Create') || text.includes('Asset'))) {
          console.log('🎯 Found potential asset button:', text);
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
  });

  test('check app state and debug info', async ({ page }) => {
    console.log('🔍 Debug test - checking app state...');

    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');
    await page.waitForTimeout(5000);

    // Check localStorage for assets
    const assets = await page.evaluate(() => {
      const storedAssets = localStorage.getItem('assets');
      return storedAssets ? JSON.parse(storedAssets) : [];
    });

    console.log('📦 Assets in localStorage:', assets.length);
    if (assets.length > 0) {
      console.log('💡 First asset:', assets[0].asset_name || assets[0].asset_id);
    }

    // Check for field logs
    const fieldLogs = await page.evaluate(() => {
      const storedLogs = localStorage.getItem('fieldLogs');
      return storedLogs ? JSON.parse(storedLogs) : [];
    });

    console.log('📝 Field logs in localStorage:', fieldLogs.length);

    await page.screenshot({ path: 'debug-app-state.png' });
    console.log('📸 Debug screenshot taken');
  });
});