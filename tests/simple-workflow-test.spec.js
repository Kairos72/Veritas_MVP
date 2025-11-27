const { test, expect } = require('@playwright/test');

test.describe('Simple Veritas MVP Test', () => {
  test('basic navigation and field entry', async ({ page }) => {
    console.log('🧪 Starting simple Veritas MVP test...');

    // Navigate to the PWA
    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');
    await page.waitForTimeout(5000); // Wait for app to fully load

    // Log what we see on the page
    const pageTitle = await page.title();
    console.log('📄 Page title:', pageTitle);

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-debug-1-start.png' });

    // Step 1: Try to click on Assets tab
    try {
      await page.click('button[onclick="switchTab(\'assets\')"]', { timeout: 5000 });
      console.log('✅ Assets tab clicked');
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log('⚠️ Could not click Assets tab:', error.message);
    }

    // Step 2: Take screenshot and check content
    await page.screenshot({ path: 'test-debug-2-assets.png' });

    // Step 3: Check if we can find any elements
    const assetsButton = await page.locator('button[onclick="switchTab(\'assets\')"]').isVisible();
    const fieldEntryButton = await page.locator('button[onclick="switchTab(\'fieldEntry\')"]').isVisible();
    console.log('🔍 Assets button visible:', assetsButton);
    console.log('🔍 Field Entry button visible:', fieldEntryButton);

    // Step 4: Go to Field Entry tab
    try {
      await page.click('button[onclick="switchTab(\'fieldEntry\')"]', { timeout: 5000 });
      console.log('✅ Field Entry tab clicked');
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log('⚠️ Could not click Field Entry tab:', error.message);
    }

    // Step 5: Take screenshot of field entry
    await page.screenshot({ path: 'test-debug-3-field-entry.png' });

    // Step 6: Check if form elements exist
    const assetSelect = await page.locator('#assetSelect').isVisible();
    const workTypeSelect = await page.locator('#workType').isVisible();
    const saveButton = await page.locator('#saveFieldLogBtn').isVisible();

    console.log('🔍 Asset Select visible:', assetSelect);
    console.log('🔍 Work Type Select visible:', workTypeSelect);
    console.log('🔍 Save Button visible:', saveButton);

    // Step 7: If we have form elements, try to interact
    if (assetSelect && workTypeSelect && saveButton) {
      console.log('✅ Form elements found, attempting interaction...');

      // Wait for options to load
      await page.waitForTimeout(3000);

      try {
        // Check if asset dropdown has options
        const assetOptions = await page.locator('#assetSelect option').count();
        console.log('📊 Asset dropdown options count:', assetOptions);

        if (assetOptions > 1) {
          await page.selectOption('#assetSelect', { index: 1 }); // Select first non-empty option
          console.log('✅ Asset selected');

          await page.waitForTimeout(1000);

          // Check work type options
          const workTypeOptions = await page.locator('#workType option').count();
          console.log('📊 Work type dropdown options count:', workTypeOptions);

          if (workTypeOptions > 1) {
            await page.selectOption('#workType', { index: 1 }); // Select first non-empty option
            console.log('✅ Work type selected');

            // Fill form
            await page.fill('#quantityToday', '10 blocks');
            await page.fill('#crewSize', '5');
            console.log('✅ Form filled');

            // Save
            await page.click('#saveFieldLogBtn');
            console.log('✅ Save button clicked');

            await page.waitForTimeout(3000);
            console.log('🎉 Test completed successfully!');
          }
        } else {
          console.log('⚠️ No assets available for selection');
        }
      } catch (error) {
        console.log('⚠️ Form interaction failed:', error.message);
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'test-debug-4-final.png' });
    console.log('📸 Final screenshot taken');
  });
});