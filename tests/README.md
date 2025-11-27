# Automated Testing for Veritas MVP

This directory contains Playwright automated tests for the Veritas MVP system.

## Setup Instructions

### 1. Install Node.js Dependencies
```bash
cd tests
npm install
```

### 2. Install Playwright Browsers
```bash
npx playwright install
```

### 3. Start Your Local Server
Make sure your PWA is running:
```bash
cd pwa
python -m http.server 8000
```

### 4. Run Tests

#### Run all tests (headless - fastest)
```bash
npm test
```

#### Run tests with browser window (watch them run)
```bash
npm run test:headed
```

#### Debug tests step by step
```bash
npm run test:debug
```

#### Run specific test file
```bash
npx playwright test field-entry-workflow.spec.js
```

#### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Coverage

### Current Tests:
- ✅ **Field Entry Workflow**: Complete test from field entry to work item creation
- ✅ **Work Item Cumulative**: Tests quantity accumulation across multiple entries
- ✅ **Asset Creation**: Tests creating new assets with templates

### What the Tests Verify:
- Field form submission works
- Work items are auto-created correctly
- Assets table shows correct work item counts
- Data syncs to Supabase (when authenticated)
- Cumulative calculations are accurate
- Asset creation with templates functions

## Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Debugging Failed Tests

1. Screenshots: Automatically captured on failure
2. Videos: Recorded during test execution
3. Traces: Detailed step-by-step execution logs
4. Console: All browser console messages logged

## Adding New Tests

1. Create new `.spec.js` files in this directory
2. Use the existing tests as templates
3. Follow Playwright best practices:
   - Use data-testid attributes for stable selectors
   - Include proper wait conditions
   - Add meaningful assertions
   - Log important steps with console.log