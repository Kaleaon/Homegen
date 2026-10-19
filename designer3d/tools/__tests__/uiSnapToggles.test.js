import { jest } from '@jest/globals';
import { buildToggleViewModel, SNAP_TOGGLE_DEFINITIONS } from '../uiSnapToggles.mjs';

describe('uiSnapToggles view model token bindings', () => {
  test('SNAP_TOGGLE_DEFINITIONS includes token and tokenHover declarations', () => {
    SNAP_TOGGLE_DEFINITIONS.forEach((toggle) => {
      expect(toggle.token).toBe('--ktheme-accent');
      expect(toggle.tokenHover).toBe('--ktheme-accent-hover');
    });
  });

  test('buildToggleViewModel includes token and tokenHover in view model payloads', () => {
    const mockInteractionLayer = {
      getSnapModeState: () => ({
        grid: true,
        edge: false,
        midpoint: true,
        perpendicular: false,
      }),
      toggleSnapMode: jest.fn(),
    };

    const viewModels = buildToggleViewModel(mockInteractionLayer);
    expect(viewModels).toHaveLength(4);

    viewModels.forEach((vm) => {
      expect(vm).toHaveProperty('token', '--ktheme-accent');
      expect(vm).toHaveProperty('tokenHover', '--ktheme-accent-hover');
      expect(typeof vm.enabled).toBe('boolean');
    });

    expect(viewModels[0].enabled).toBe(true);
    expect(viewModels[1].enabled).toBe(false);

    viewModels[0].onToggle(false);
    expect(mockInteractionLayer.toggleSnapMode).toHaveBeenCalledWith(viewModels[0].id, false);
  });
});
