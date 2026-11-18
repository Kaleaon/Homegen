import test from 'node:test';
import assert from 'node:assert/strict';
import { filterItems, ITEMS, SYNONYM_MAP } from '../js/catalog.js';

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

test('filterItems synonym lookups and query expansion', () => {
  // Verify SYNONYM_MAP structure
  assert.ok(typeof SYNONYM_MAP === 'object' && SYNONYM_MAP !== null);
  assert.ok(Array.isArray(SYNONYM_MAP.couch));
  assert.ok(Array.isArray(SYNONYM_MAP.worktable));
  assert.ok(Array.isArray(SYNONYM_MAP.commode));

  // "couch" should return Sofa and Loveseat
  const couchMatches = filterItems(ITEMS, { query: 'couch' });
  assert.ok(couchMatches.some((item) => item.id === 'sofa'));
  assert.ok(couchMatches.some((item) => item.id === 'loveseat'));

  // "worktable" should return Desk
  const worktableMatches = filterItems(ITEMS, { query: 'worktable' });
  assert.ok(worktableMatches.some((item) => item.id === 'desk'));

  // "commode" should return Toilet
  const commodeMatches = filterItems(ITEMS, { query: 'commode' });
  assert.ok(commodeMatches.some((item) => item.id === 'toilet'));

  // "fridge" should return Refrigerator
  const fridgeMatches = filterItems(ITEMS, { query: 'fridge' });
  assert.ok(fridgeMatches.some((item) => item.id === 'fridge'));

  // "stove" should return Gas range and Electric range
  const stoveMatches = filterItems(ITEMS, { query: 'stove' });
  assert.ok(stoveMatches.some((item) => item.id === 'range_gas'));
  assert.ok(stoveMatches.some((item) => item.id === 'range_electric'));

  // Multi-word synonym substitution ("gas stove" -> Gas range)
  const gasStoveMatches = filterItems(ITEMS, { query: 'gas stove' });
  assert.ok(gasStoveMatches.some((item) => item.id === 'range_gas'));
});

test('filterItems tag matching', () => {
  // "seating" tag matching
  const seatingMatches = filterItems(ITEMS, { query: 'seating' });
  assert.ok(seatingMatches.length >= 4);
  assert.ok(seatingMatches.some((item) => item.id === 'sofa'));
  assert.ok(seatingMatches.some((item) => item.id === 'armchair'));
  assert.ok(seatingMatches.some((item) => item.id === 'dining_chair'));
  assert.ok(seatingMatches.some((item) => item.id === 'office_chair'));

  // "appliance" tag matching
  const applianceMatches = filterItems(ITEMS, { query: 'appliance' });
  assert.ok(applianceMatches.length >= 5);
  assert.ok(applianceMatches.some((item) => item.id === 'fridge'));
  assert.ok(applianceMatches.some((item) => item.id === 'range_gas'));
  assert.ok(applianceMatches.some((item) => item.id === 'washer'));
  assert.ok(applianceMatches.some((item) => item.id === 'dryer'));

  // "plumbing" tag matching
  const plumbingMatches = filterItems(ITEMS, { query: 'plumbing' });
  assert.ok(plumbingMatches.length >= 4);
  assert.ok(plumbingMatches.some((item) => item.id === 'toilet'));
  assert.ok(plumbingMatches.some((item) => item.id === 'vanity'));
  assert.ok(plumbingMatches.some((item) => item.id === 'sink_kitchen'));
});

test('filterItems combined criteria with tags and synonyms', () => {
  // Searching "couch" in living category with max width 60 (Loveseat: 58", Sofa: 84")
  const compactCouches = filterItems(ITEMS, {
    query: 'couch',
    cat: 'living',
    maxW: 60,
  });
  assert.ok(compactCouches.some((item) => item.id === 'loveseat'));
  assert.ok(!compactCouches.some((item) => item.id === 'sofa'));

  // Searching "appliance" in kitchen category
  const kitchenAppliances = filterItems(ITEMS, {
    query: 'appliance',
    cat: 'kitchen',
  });
  assert.ok(kitchenAppliances.some((item) => item.id === 'fridge'));
  assert.ok(kitchenAppliances.some((item) => item.id === 'range_gas'));
  assert.ok(!kitchenAppliances.some((item) => item.id === 'washer'));
});

test('renderCatalogPanel renders Clear filters button in empty state and restores full catalog on reset', async () => {
  const { renderCatalogPanel, getCatalogFilters, setCatalogFilters, resetCatalogFilters } =
    await import('../js/app.js');

  resetCatalogFilters();

  // Populate query and dimension filters that match zero items
  setCatalogFilters({ query: 'nonexistent-sofa-xyz', maxW: '12', maxD: '10' });
  assert.deepEqual(getCatalogFilters(), {
    query: 'nonexistent-sofa-xyz',
    maxW: '12',
    maxD: '10',
  });
  assert.equal(filterItems(ITEMS, getCatalogFilters()).length, 0);

  const emptyHtml = renderCatalogPanel();
  assert.ok(
    emptyHtml.includes(
      '<div class="catalog-empty"><p>No matching items found</p><button id="catalog-reset-filters" class="btn secondary btn-sm catalog-reset-btn" type="button">Clear filters</button></div>'
    ),
    'Empty state must render paragraph and Clear filters button'
  );

  // Resetting filter state restores full catalog item results
  resetCatalogFilters();
  assert.deepEqual(getCatalogFilters(), { query: '', maxW: '', maxD: '' });

  const restoredItems = filterItems(ITEMS, getCatalogFilters());
  assert.equal(restoredItems.length, ITEMS.length);

  const restoredHtml = renderCatalogPanel();
  assert.ok(!restoredHtml.includes('catalog-empty'), 'Empty state must disappear after reset');
  assert.ok(!restoredHtml.includes('id="catalog-reset-filters"'));
  for (const item of ITEMS) {
    assert.ok(
      restoredHtml.includes(`data-id="${item.id}"`),
      `Restored catalog markup must include item ${item.id}`
    );
  }
});

test('renderPalette binds #catalog-reset-filters click to clear state, handle multiple clicks, and handle empty catalog', async () => {
  const {
    renderCatalogPanel,
    renderPalette,
    getCatalogFilters,
    setCatalogFilters,
    resetCatalogFilters,
    switchTab,
  } = await import('../js/app.js');

  const listenersById = {};
  let focusedId = null;

  const makeEl = (id) => ({
    id,
    innerHTML: '',
    dataset: id === 'tab-buy' ? { tab: 'buy' } : {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: (evt, fn) => {
      if (!listenersById[id]) listenersById[id] = {};
      listenersById[id][evt] = fn;
    },
    focus: () => {
      focusedId = id;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  });

  const elements = {
    palette: makeEl('palette'),
    'tab-buy': makeEl('tab-buy'),
  };

  const prevDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      const id = sel.replace(/^#/, '');
      if (id === 'palette') return elements.palette;
      if (id === 'tab-buy') return elements['tab-buy'];
      if (elements.palette.innerHTML.includes(`id="${id}"`)) {
        if (!elements[id]) elements[id] = makeEl(id);
        return elements[id];
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  try {
    // Verify empty catalog edge case on renderCatalogPanel([])
    resetCatalogFilters();
    setCatalogFilters({ query: 'impossible-item', maxW: '5', maxD: '5' });
    const emptyCatalogHtml = renderCatalogPanel([]);
    assert.ok(emptyCatalogHtml.includes('id="catalog-reset-filters"'));

    // Switch active tab to Buy (which invokes renderPalette) while restrictive filters are active
    setCatalogFilters({ query: 'no-match-query', maxW: '8', maxD: '9' });
    switchTab(elements['tab-buy']);

    assert.ok(
      elements.palette.innerHTML.includes('id="catalog-reset-filters"'),
      'Buy palette should render #catalog-reset-filters when no items match'
    );
    assert.ok(
      typeof listenersById['catalog-reset-filters']?.click === 'function',
      'renderPalette must bind a click listener to #catalog-reset-filters'
    );

    // Click reset button (and simulate rapid multiple clicks)
    const clickHandler = listenersById['catalog-reset-filters'].click;
    clickHandler();
    clickHandler();

    assert.deepEqual(getCatalogFilters(), {
      query: '',
      maxW: '',
      maxD: '',
    });
    assert.ok(
      !elements.palette.innerHTML.includes('catalog-empty'),
      'Palette should re-render full catalog and remove empty state after click'
    );
    assert.ok(
      elements.palette.innerHTML.includes('value="" aria-label="Search furniture catalog"'),
      'Search input value should be cleared after reset'
    );
    assert.equal(focusedId, 'catalog-search', 'Focus should move to #catalog-search after reset');

    // Re-running renderPalette directly remains idempotent
    renderPalette();
    assert.ok(!elements.palette.innerHTML.includes('catalog-empty'));
  } finally {
    resetCatalogFilters();
    globalThis.document = prevDocument;
  }
});
