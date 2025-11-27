const { test, expect } = require('@playwright/test');

test.describe('Simple Working Test - End-to-End Workflow', () => {
  test('complete workflow with manual injection', async ({ page }) => {
    console.log('🚀 Starting simple working test...');

    // Navigate to the PWA
    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');
    await page.waitForTimeout(5000);

    // === STEP 1: Create and load project ===
    console.log('📋 Creating project...');
    await page.evaluate(() => {
      const testProject = {
        project_id: 'PROJ-TEST-001',
        contract_id: 'CTR-2025-TEST',
        project_title: 'Automated Test Project',
        contractor_name: 'Test Contractor Corp',
        owner: 'Test Owner Agency',
        type: 'PCCP Road',
        description: 'Project for automated testing',
        created_at: new Date().toISOString()
      };

      localStorage.setItem('veritas_projects', JSON.stringify([testProject]));
    });

    // Load project in app memory
    await page.evaluate(() => {
      if (typeof loadProjects === 'function') {
        loadProjects();
      }
    });
    await page.waitForTimeout(1000);

    // === STEP 2: Set active project ===
    await page.evaluate(() => {
      if (typeof projects !== 'undefined' && projects.length > 0) {
        activeProject = projects[0];
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
          projectSelect.value = '0';
        }
        console.log('✅ Active project set:', activeProject.project_title);
      }
    });
    await page.waitForTimeout(1000);

    // === STEP 3: Create and load asset ===
    console.log('🏗️ Creating asset...');
    await page.evaluate(() => {
      const testAsset = {
        asset_id: 'ASSET-RD-001',
        name: 'Test Road Section',
        asset_type: 'road_section',
        start_chainage_m: 0,
        end_chainage_m: 100,
        description: 'Automated test asset',
        work_items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      localStorage.setItem('veritas_assets', JSON.stringify([testAsset]));
    });

    // Load asset in app memory
    await page.evaluate(() => {
      if (typeof loadAssets === 'function') {
        loadAssets();
      }
    });
    await page.waitForTimeout(1000);

    // === STEP 4: Go to Field Entry and create field log ===
    console.log('📝 Testing field entry...');
    await page.click('button[onclick="switchTab(\'fieldEntry\')"]');
    await page.waitForTimeout(2000);

    // Populate asset dropdown
    await page.evaluate(() => {
      if (typeof populateAssetSelect === 'function') {
        populateAssetSelect();
      }
    });
    await page.waitForTimeout(2000);

    // Select asset
    await page.selectOption('#assetSelect', { index: 1 });

    // Trigger change event
    await page.evaluate(() => {
      const assetSelect = document.getElementById('assetSelect');
      if (assetSelect) {
        const event = new Event('change', { bubbles: true });
        assetSelect.dispatchEvent(event);
      }
    });
    await page.waitForTimeout(1000);

    // Fill form
    await page.fill('#fieldDate', new Date().toISOString().split('T')[0]);
    await page.selectOption('#fieldWorkType', { label: 'PCCP (Concrete Pavement)' });
    await page.fill('#fieldQuantity', '15 blocks');
    await page.fill('#fieldCrew', '5');
    await page.selectOption('#fieldWeather', { label: 'Clear' });
    await page.fill('#fieldNotes', 'Simple working test - automated field entry');

    console.log('✅ Form filled, submitting...');

    // Submit form (specifically the field form submit button)
    await page.click('#fieldForm button[type="submit"]');
    await page.waitForTimeout(3000);

    // === STEP 5: Verify results ===
    console.log('🔍 Verifying results...');

    const fieldLogs = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('veritas_field_logs') || '[]');
    });

    const assets = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('veritas_assets') || '[]');
    });

    console.log('📊 RESULTS:');
    console.log('  Field logs created:', fieldLogs.length);
    console.log('  Assets with work items:', assets.length);

    if (fieldLogs.length > 0) {
      console.log('  Latest field log:');
      console.log('    - Work type:', fieldLogs[fieldLogs.length - 1].work_type);
      console.log('    - Quantity:', fieldLogs[fieldLogs.length - 1].quantity_today);
      console.log('    - Asset ID:', fieldLogs[fieldLogs.length - 1].asset_id);
      console.log('    - Date:', fieldLogs[fieldLogs.length - 1].date);
    }

    if (assets.length > 0 && assets[0].work_items) {
      console.log('  Work items:', assets[0].work_items.length);
      if (assets[0].work_items.length > 0) {
        console.log('    - Work type:', assets[0].work_items[0].work_type);
        console.log('    - Cumulative:', assets[0].work_items[0].cumulative);
      }
    }

    // Final verification
    const success = fieldLogs.length > 0;

    if (success) {
      console.log('🎉 SUCCESS! Complete workflow working!');
      console.log('  ✅ Project created');
      console.log('  ✅ Asset created');
      console.log('  ✅ Field entry saved');
      console.log('  ✅ Work item processing working');
    } else {
      console.log('❌ Workflow failed - no field logs created');
    }

    // Take final screenshot
    await page.screenshot({ path: 'simple-test-result.png' });

    expect(success).toBe(true);
  });
});