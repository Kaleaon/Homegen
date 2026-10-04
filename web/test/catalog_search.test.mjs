import test from 'node:test';
import assert from 'node:assert/strict';
import { filterItems, ITEMS } from '../js/catalog.js';

test('filterItems substring name matching', () => {
  const result = filterItems(ITEMS, { query: 'bed' });
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.name.toLowerCase().includes('bed')));

  // Case insensitivity
  const uppercaseResult = filterItems(ITEMS, { query: 'SOFA' });
  assert.ok(uppercaseResult.length > 0);
  assert.ok(uppercaseResult.every((item) => item.name.toLowerCase().includes('sofa')));

  // Whitespace trimming
  const trimmedResult = filterItems(ITEMS, { query: '  chair  ' });
  assert.ok(trimmedResult.length > 0);
  assert.ok(trimmedResult.every((item) => item.name.toLowerCase().includes('chair')));
});

test('filterItems category filtering', () => {
  const bedroomItems = filterItems(ITEMS, { cat: 'bedroom' });
  assert.ok(bedroomItems.length > 0);
  assert.ok(bedroomItems.every((item) => item.cat === 'bedroom'));

  const kitchenItems = filterItems(ITEMS, { category: 'kitchen' });
  assert.ok(kitchenItems.length > 0);
  assert.ok(kitchenItems.every((item) => item.cat === 'kitchen'));

  // 'all' category should not filter out items
  const allItems = filterItems(ITEMS, { cat: 'all' });
  assert.equal(allItems.length, ITEMS.length);
});

test('filterItems width threshold filtering', () => {
  const maxW = 36;
  const filtered = filterItems(ITEMS, { maxW });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((item) => item.w <= maxW));

  // Verify an item wider than maxW is excluded
  const wideItem = ITEMS.find((i) => i.w > maxW);
  if (wideItem) {
    assert.ok(!filtered.some((i) => i.id === wideItem.id));
  }
});

test('filterItems depth threshold filtering', () => {
  const maxD = 24;
  const filtered = filterItems(ITEMS, { maxD });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((item) => item.d <= maxD));

  // Verify an item deeper than maxD is excluded
  const deepItem = ITEMS.find((i) => i.d > maxD);
  if (deepItem) {
    assert.ok(!filtered.some((i) => i.id === deepItem.id));
  }
});

test('filterItems combined criteria filtering', () => {
  const result = filterItems(ITEMS, {
    query: 'bed',
    cat: 'bedroom',
    maxW: 60,
    maxD: 80,
  });

  assert.ok(result.length > 0);
  assert.ok(
    result.every(
      (item) =>
        item.name.toLowerCase().includes('bed') &&
        item.cat === 'bedroom' &&
        item.w <= 60 &&
        item.d <= 80
    )
  );
});

test('filterItems edge cases and fallback behavior', () => {
  // Empty query or whitespace should return all items
  assert.equal(filterItems(ITEMS, { query: '' }).length, ITEMS.length);
  assert.equal(filterItems(ITEMS, { query: '   ' }).length, ITEMS.length);

  // Non-numeric, zero, or negative dimension values are unbounded
  assert.equal(filterItems(ITEMS, { maxW: 0 }).length, ITEMS.length);
  assert.equal(filterItems(ITEMS, { maxW: -10 }).length, ITEMS.length);
  assert.equal(filterItems(ITEMS, { maxW: 'abc' }).length, ITEMS.length);

  assert.equal(filterItems(ITEMS, { maxD: 0 }).length, ITEMS.length);
  assert.equal(filterItems(ITEMS, { maxD: -5 }).length, ITEMS.length);
  assert.equal(filterItems(ITEMS, { maxD: 'invalid' }).length, ITEMS.length);

  // Non-matching query returns empty array
  const noMatches = filterItems(ITEMS, { query: 'nonexistentfurnitureitem12345' });
  assert.equal(noMatches.length, 0);

  // Safe fallback for null or empty items
  assert.deepEqual(filterItems(null), []);
  assert.deepEqual(filterItems([]), []);
});
