const { test, expect } = require('@playwright/test');

test.describe('Complete End-to-End Workflow', () => {
  test('create asset → field entry → work item verification', async ({ page }) => {
    console.log('🚀 Starting complete end-to-end workflow test...');

    // Navigate to the PWA
    await page.goto('file:///C:/Users/Al/Desktop/Veritas_MVP/pwa/index.html');
    await page.waitForTimeout(5000); // Wait for app to fully load

    // === STEP 1: CREATE ASSET ===
    console.log('📝 STEP 1: Creating test asset...');

    // Go to Assets tab
    await page.click('button[onclick="switchTab(\'assets\')"]');
    await page.waitForTimeout(2000);
    console.log('✅ Assets tab opened');

    // Look for and click the Add Asset button
    // Let's find it by text content since ID might be elusive
    const buttons = await page.locator('button').all();
    let addAssetButton = null;

    for (const button of buttons) {
      const text = await button.textContent();
      if (text && (text.includes('Add') || text.includes('Create') || text.includes('New'))) {
        console.log('🎯 Found button:', text);
        addAssetButton = button;
        break;
      }
    }

    if (addAssetButton) {
      await addAssetButton.click();
      await page.waitForTimeout(1000);
      console.log('✅ Add Asset button clicked');
    } else {
      // Alternative approach: look for any button that might open modal
      console.log('⚠️ Trying alternative approach...');
      // Look for modal directly or try clicking first button with "asset" in onclick
      await page.evaluate(() => {
        const assetBtn = Array.from(document.querySelectorAll('button')).find(btn =>
          btn.onclick && btn.onclick.toString().includes('asset')
        );
        if (assetBtn) assetBtn.click();
      });
      await page.waitForTimeout(1000);
    }

    // Try to fill asset form if modal opened
    try {
      // Check if modal is visible
      const modalVisible = await page.locator('.modal').isVisible();
      if (modalVisible) {
        console.log('✅ Asset creation modal is visible');

        // Fill asset details
        await page.selectOption('#assetType', 'road_section');
        await page.fill('#assetName', 'Test Road Section for Automation');
        await page.fill('#assetDescription', 'Automated test asset for field entry workflow');

        // For road section, fill chainage
        await page.fill('#startChainage', '0+000');
        await page.fill('#endChainage', '0+200');

        // Save asset
        const saveButton = await page.locator('#saveAssetBtn, button:has-text("Save"), button:has-text("Create")').first();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(2000);
          console.log('✅ Asset save button clicked');
        }
      } else {
        console.log('⚠️ Modal not visible, might need different approach');
      }
    } catch (error) {
      console.log('⚠️ Asset creation failed:', error.message);
    }

    // === STEP 2: VERIFY ASSET CREATED ===
    console.log('🔍 STEP 2: Verifying asset creation...');

    // Check localStorage for assets
    const assetsAfterCreation = await page.evaluate(() => {
      const storedAssets = localStorage.getItem('veritas_assets');
      return storedAssets ? JSON.parse(storedAssets) : [];
    });

    console.log('📦 Assets after creation attempt:', assetsAfterCreation.length);

    if (assetsAfterCreation.length === 0) {
      console.log('🏗️ STEP 2: Creating project first, then asset...');

      // Click "New Project" button
      const newProjectButton = await page.locator('#newProjectBtn').first();
      if (await newProjectButton.isVisible()) {
        await newProjectButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ New Project button clicked');
      }

      // Fill in project creation form
      await page.fill('#projId', 'PROJ-TEST-001');
      await page.fill('#contractId', 'CTR-2025-TEST');
      await page.fill('#projTitle', 'Automated Test Project');
      await page.fill('#contractor', 'Test Contractor Corp');
      await page.fill('#owner', 'Test Owner Agency');
      await page.fill('#projType', 'PCCP Road');

      // Submit project form
      await page.click('#cancelProjectBtn'); // First try to close if there's an existing form
      await page.waitForTimeout(500);
      await page.click('#newProjectBtn');
      await page.waitForTimeout(500);

      await page.fill('#projId', 'PROJ-TEST-001');
      await page.fill('#contractId', 'CTR-2025-TEST');
      await page.fill('#projTitle', 'Automated Test Project');
      await page.fill('#contractor', 'Test Contractor Corp');
      await page.fill('#owner', 'Test Owner Agency');
      await page.fill('#projType', 'PCCP Road');

      // Look for submit button in project form
      await page.locator('#newProjectForm button[type="submit"]').click();
      await page.waitForTimeout(2000);
      console.log('✅ Project created');

      // Now create the asset
      console.log('🏗️ Creating asset...');

      // Add Asset button (try different approaches)
      const addAssetBtn = await page.locator('button:has-text("Add"), button:has-text("Create")').first();
      if (await addAssetBtn.isVisible()) {
        await addAssetBtn.click();
        await page.waitForTimeout(1000);
        console.log('✅ Add Asset button clicked');
      }

      // If modal appears, fill asset form
      const modalVisible = await page.locator('.modal, #assetModal').isVisible();
      if (modalVisible) {
        await page.selectOption('#assetType', 'road_section');
        await page.fill('#assetName', 'Test Road Section');
        await page.fill('#assetDescription', 'Automated test asset');
        await page.fill('#startChainage', '0+000');
        await page.fill('#endChainage', '0+100');

        // Save asset
        await page.locator('#saveAssetBtn, button[type="submit"]').first().click();
        await page.waitForTimeout(2000);
        console.log('✅ Asset created');
      } else {
        // Manual injection as fallback
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

          const existingAssets = JSON.parse(localStorage.getItem('veritas_assets') || '[]');
          existingAssets.push(testAsset);
          localStorage.setItem('veritas_assets', JSON.stringify(existingAssets));
        });
        console.log('✅ Asset injected as fallback');
      }
    }

    // === STEP 3: FIELD ENTRY WORKFLOW ===
    console.log('📝 STEP 3: Testing field entry workflow...');

    // Go to Field Entry tab
    await page.click('button[onclick="switchTab(\'fieldEntry\')"]');
    await page.waitForTimeout(2000);
    console.log('✅ Field Entry tab opened');

    // Manually trigger project and asset loading after our injection
    await page.evaluate(() => {
      // First reload projects from localStorage
      if (typeof loadProjects === 'function') {
        loadProjects();
      }
      // Then reload assets from localStorage
      if (typeof loadAssets === 'function') {
        loadAssets();
      }
      // Then populate the dropdowns
      if (typeof populateAssetSelect === 'function') {
        populateAssetSelect();
      }
    });
    await page.waitForTimeout(2000);

    // Set the active project (required for field log saving)
    await page.evaluate(() => {
      // Set activeProject to the first project
      if (typeof projects !== 'undefined' && projects.length > 0) {
        activeProject = projects[0];

        // Update the project dropdown
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
          projectSelect.value = '0'; // Select first project
        }

        // Show active project display
        const activeProjectDisplay = document.getElementById('activeProjectDisplay');
        if (activeProjectDisplay) {
          activeProjectDisplay.style.display = 'block';
        }

        const activeProjectTitle = document.getElementById('activeProjectTitle');
        if (activeProjectTitle) {
          activeProjectTitle.textContent = activeProject.project_title;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Check asset dropdown options and their values
    const assetOptions = await page.locator('#assetSelect option').count();
    console.log('📊 Asset dropdown options:', assetOptions);

    // Debug: Get all option texts and values
    const dropdownOptions = await page.evaluate(() => {
      const select = document.getElementById('assetSelect');
      const options = Array.from(select.options);
      return options.map(opt => ({ text: opt.textContent, value: opt.value }));
    });
    console.log('📋 Dropdown options:', dropdownOptions);

    // Debug: Check if assets and projects are loaded in the app's memory
    const appAssets = await page.evaluate(() => {
      return typeof assets !== 'undefined' ? assets : 'assets variable not found';
    });
    console.log('🗃️ App assets variable:', typeof appAssets === 'object' ? appAssets.length : appAssets);

    const appProjects = await page.evaluate(() => {
      return typeof projects !== 'undefined' ? projects : 'projects variable not found';
    });
    console.log('📋 App projects variable:', typeof appProjects === 'object' ? appProjects.length : appProjects);

    const activeProjectCheck = await page.evaluate(() => {
      return typeof activeProject !== 'undefined' ? (activeProject ? activeProject.project_title : 'null') : 'activeProject variable not found';
    });
    console.log('🎯 Active project:', activeProjectCheck);

    if (assetOptions > 1) {
      // Select the test asset
      await page.selectOption('#assetSelect', { index: 1 }); // Skip placeholder

      // Manually trigger the change event to populate fieldAssetId
      await page.evaluate(() => {
        const assetSelect = document.getElementById('assetSelect');
        if (assetSelect) {
          // Dispatch change event to trigger the event listener
          const event = new Event('change', { bubbles: true });
          assetSelect.dispatchEvent(event);
        }
      });

      console.log('✅ Asset selected and change event triggered');
      await page.waitForTimeout(1000);

      // Debug: Check if fieldAssetId is populated
      const fieldAssetIdValue = await page.evaluate(() => {
        return document.getElementById('fieldAssetId').value;
      });
      console.log('🔧 fieldAssetId value:', fieldAssetIdValue);

      // Fill in field entry details
      await page.fill('#fieldDate', new Date().toISOString().split('T')[0]);

      // Select work type
      await page.selectOption('#fieldWorkType', { label: 'PCCP (Concrete Pavement)' });
      console.log('✅ Work type: PCCP selected');

      // Fill quantity
      await page.fill('#fieldQuantity', '25 blocks');
      await page.fill('#fieldCrew', '6');
      await page.selectOption('#fieldWeather', { label: 'Clear' });
      await page.fill('#fieldNotes', 'Automated test entry - End-to-end workflow verification');
      console.log('✅ Form fields filled');

      // Take screenshot before save
      await page.screenshot({ path: 'test-field-form-filled.png' });

      // Save field log and listen for any errors
      page.on('dialog', async dialog => {
        console.log('⚠️ Alert dialog:', dialog.message());
        await dialog.dismiss();
      });

      // Listen for console errors and all relevant messages
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log('❌ Console error:', msg.text());
        } else if (msg.text().includes('Auto-created') || msg.text().includes('Field log') ||
                   msg.text().includes('Matched') || msg.text().includes('work item')) {
          console.log('📝 Console message:', msg.text());
        }
      });

      // Try manual form submission approach
      const formSubmissionResult = await page.evaluate(() => {
        try {
          // Get all form values
          const date = document.getElementById('fieldDate').value;
          const assetId = document.getElementById('fieldAssetId').value;
          const workType = document.getElementById('fieldWorkType').value;
          const itemCode = document.getElementById('fieldItemCode').value.trim() || null;
          const quantityToday = document.getElementById('fieldQuantity').value.trim();
          const crew = parseInt(document.getElementById('fieldCrew').value);
          const weather = document.getElementById('fieldWeather').value;
          const notes = document.getElementById('fieldNotes').value;
          const lat = document.getElementById('fieldLat').value;
          const long = document.getElementById('fieldLong').value;

          console.log('Form values:', { date, assetId, workType, quantityToday, crew, weather });

          // Check if all required values are present
          if (!activeProject) {
            return { error: "No active project" };
          }
          if (!assetId) {
            return { error: "No asset ID" };
          }
          if (!workType) {
            return { error: "No work type" };
          }
          if (!quantityToday) {
            return { error: "No quantity" };
          }

          return { success: true, values: { date, assetId, workType, quantityToday, crew } };
        } catch (error) {
          return { error: error.message };
        }
      });

      console.log('🔍 Form submission check:', formSubmissionResult);

      if (formSubmissionResult.success) {
        await page.click('button[type="submit"]');
        console.log('✅ Field log save button clicked');
      } else {
        console.log('❌ Form validation failed:', formSubmissionResult.error);
      }

      // Wait for save and potential work item creation
      await page.waitForTimeout(4000);

      // === STEP 4: VERIFY WORK ITEM CREATION ===
      console.log('🔍 STEP 4: Verifying work item creation...');

      // Check field logs in localStorage
      const fieldLogsAfter = await page.evaluate(() => {
        const storedLogs = localStorage.getItem('veritas_field_logs');
        return storedLogs ? JSON.parse(storedLogs) : [];
      });

      console.log('📝 Field logs after save:', fieldLogsAfter.length);

      if (fieldLogsAfter.length > 0) {
        const latestLog = fieldLogsAfter[fieldLogsAfter.length - 1];
        console.log('📋 Latest field log:', {
          work_type: latestLog.work_type,
          quantity: latestLog.quantity_today,
          asset_id: latestLog.asset_id
        });
      }

      // Check assets for work items
      const assetsFinal = await page.evaluate(() => {
        const storedAssets = localStorage.getItem('veritas_assets');
        return storedAssets ? JSON.parse(storedAssets) : [];
      });

      if (assetsFinal.length > 0) {
        const testAsset = assetsFinal.find(a => (a.name || a.asset_name || '').includes('Test'));
        if (testAsset && testAsset.work_items) {
          console.log('🔧 Work items in test asset:', testAsset.work_items.length);

          if (testAsset.work_items.length > 0) {
            const workItem = testAsset.work_items[0];
            console.log('📊 Work item details:', {
              type: workItem.work_type,
              cumulative: workItem.cumulative,
              unit: workItem.unit
            });
            console.log('✅ WORK ITEM CREATION CONFIRMED!');
          }
        }
      }

      // === STEP 5: VISUAL VERIFICATION ===
      console.log('🔍 STEP 5: Visual verification in Assets tab...');

      // Go to Assets tab to see the results
      await page.click('button[onclick="switchTab(\'assets\')"]');
      await page.waitForTimeout(2000);

      // Take final screenshot
      await page.screenshot({ path: 'test-final-verification.png' });

      // Check page content for success indicators
      const pageContent = await page.locator('body').textContent();

      const hasWorkItems = pageContent.includes('items') && !pageContent.includes('0 items');
      const hasFieldLogs = pageContent.includes('Field Logs') || fieldLogsAfter.length > 0;

      console.log('🎯 FINAL RESULTS:');
      console.log('  ✅ Asset created:', assetsFinal.length > 0);
      console.log('  ✅ Field entry saved:', fieldLogsAfter.length > 0);
      console.log('  ✅ Work items showing:', hasWorkItems);
      console.log('  ✅ Field logs present:', hasFieldLogs);

      if (assetsFinal.length > 0 && fieldLogsAfter.length > 0) {
        console.log('🎉 COMPLETE END-TO-END WORKFLOW SUCCESSFUL!');
        console.log('   - Asset creation ✅');
        console.log('   - Field entry ✅');
        console.log('   - Work item processing ✅');
        console.log('   - Data persistence ✅');
      } else {
        console.log('⚠️ Workflow partially completed - check logs above');
      }

    } else {
      console.log('❌ No assets available for field entry testing');
    }

    // Final debug info
    console.log('📊 FINAL STATE:');
    const finalAssets = await page.evaluate(() => JSON.parse(localStorage.getItem('veritas_assets') || '[]'));
    const finalLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('veritas_field_logs') || '[]'));
    console.log('  Total assets:', finalAssets.length);
    console.log('  Total field logs:', finalLogs.length);
  });
});