import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCandidate, scoreLocator } from '../src/locator.js';

test('semantic fields can recover from id changes', () => {
  const expected = { id: 'submit-739', role: 'button', name: 'Send message', text: 'Send' };
  const changed = { id: 'submit-104', role: 'button', name: 'Send message', text: 'Send' };
  const unrelated = { id: 'submit-739', role: 'button', name: 'Delete account', text: 'Delete' };

  assert.ok(scoreLocator(expected, changed) > scoreLocator(expected, unrelated));
  assert.equal(chooseCandidate(expected, [unrelated, changed]).match, changed);
});
