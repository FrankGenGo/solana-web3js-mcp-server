/**
 * Transaction Tools Test Suite
 * 
 * This module is the entry point for all transaction tool tests.
 * It imports and runs the individual test files for each transaction tool.
 */

import './create.test.js';
import './sign.test.js';
import './send.test.js';
import './status.test.js';
import './simulate.test.js';

describe('Transaction Tools Suite', () => {
  it('should load all transaction tests', () => {
    // This is just a placeholder test to ensure the test suite loads properly
    expect(true).toBe(true);
  });
});