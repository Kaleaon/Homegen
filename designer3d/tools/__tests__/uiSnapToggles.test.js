import { jest } from '@jest/globals';
import {
  buildToggleViewModel,
  buildGridSettingsViewModel,
  isValidGridIncrement,
  SNAP_TOGGLE_DEFINITIONS,
} from '../uiSnapToggles.mjs';
import { InteractionLayer } from '../interactionLayer.mjs';

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

describe('buildGridSettingsViewModel', () => {
  test('reads unitSize and angleSnapDegrees from interactionLayer.gridSettings and delegates valid updates', () => {
    const mockInteractionLayer = {
      gridSettings: {
        unitSize: 6,
        angleSnapDegrees: 15,
        magneticThreshold: 14,
      },
      setGridSettings: jest.fn((partial) => ({
        unitSize: 6,
        angleSnapDegrees: 15,
        magneticThreshold: 14,
        ...partial,
      })),
    };

    const vm = buildGridSettingsViewModel(mockInteractionLayer);

    expect(vm.unitSize).toBe(6);
    expect(vm.angleSnapDegrees).toBe(15);
    expect(vm.token).toBe('--ktheme-accent');
    expect(vm.tokenHover).toBe('--ktheme-accent-hover');

    const updatedUnit = vm.onUnitSizeChange('12');
    expect(mockInteractionLayer.setGridSettings).toHaveBeenCalledWith({ unitSize: 12 });
    expect(updatedUnit.unitSize).toBe(12);

    const updatedAngle = vm.onAngleSnapDegreesChange(45);
    expect(mockInteractionLayer.setGridSettings).toHaveBeenCalledWith({ angleSnapDegrees: 45 });
    expect(updatedAngle.angleSnapDegrees).toBe(45);

    vm.onUpdate({ unitSize: '3.5', angleSnapDegrees: '22.5' });
    expect(mockInteractionLayer.setGridSettings).toHaveBeenCalledWith({
      unitSize: 3.5,
      angleSnapDegrees: 22.5,
    });
  });

  test('rejects non-positive and non-finite inputs without invoking setGridSettings', () => {
    const layer = new InteractionLayer({
      gridSettings: { unitSize: 6, angleSnapDegrees: 15 },
    });
    const setSpy = jest.spyOn(layer, 'setGridSettings');
    const vm = buildGridSettingsViewModel(layer);

    const invalidInputs = [
      0,
      -6,
      NaN,
      Infinity,
      -Infinity,
      '',
      '   ',
      'abc',
      null,
      undefined,
      true,
    ];
    for (const invalid of invalidInputs) {
      expect(isValidGridIncrement(invalid)).toBe(false);
      expect(vm.onUnitSizeChange(invalid)).toBeNull();
      expect(vm.onAngleSnapDegreesChange(invalid)).toBeNull();
    }

    expect(vm.onUpdate(null)).toBeNull();
    expect(vm.onUpdate({})).toBeNull();
    expect(vm.onUpdate({ unitSize: -1, angleSnapDegrees: 30 })).toBeNull();
    expect(vm.onUpdate({ unitSize: 12, angleSnapDegrees: 0 })).toBeNull();
    expect(setSpy).not.toHaveBeenCalled();
    expect(layer.gridSettings.unitSize).toBe(6);
    expect(layer.gridSettings.angleSnapDegrees).toBe(15);
  });

  test('updates real InteractionLayer gridSettings and downstream gizmo/roomTool settings', () => {
    const layer = new InteractionLayer({
      gridSettings: { unitSize: 6, angleSnapDegrees: 15 },
    });
    const vm = buildGridSettingsViewModel(layer);

    vm.setUnitSize(12);
    vm.setAngleSnapDegrees(30);

    expect(layer.gridSettings.unitSize).toBe(12);
    expect(layer.gridSettings.angleSnapDegrees).toBe(30);
    expect(layer.transformGizmo.settings.unitSize).toBe(12);
    expect(layer.roomTool.settings.angleSnapDegrees).toBe(30);
  });
});
