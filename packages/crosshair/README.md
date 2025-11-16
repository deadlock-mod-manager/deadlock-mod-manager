# @deadlock-mods/crosshair

Shared crosshair generation package for Deadlock Mod Manager.

## Overview

This package provides core functionality for creating, rendering, and managing Deadlock game crosshairs. It includes TypeScript types, calculation logic, canvas rendering functions, and configuration management.

## Usage Example

```typescript
import { DEFAULT_CROSSHAIR_CONFIG } from '@deadlock-mods/crosshair/types';
import { renderCrosshair } from '@deadlock-mods/crosshair/renderer';
import { generateConfigString } from '@deadlock-mods/crosshair/config-generator';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const config = { ...DEFAULT_CROSSHAIR_CONFIG, gap: 5, hero: 'Abrams' };

renderCrosshair(ctx, canvas, config);

const gameConfig = generateConfigString(config);
console.log(gameConfig);
// Output: citadel_crosshair_color_r 255; citadel_crosshair_color_g 255; ...
```

## Hero Gap Calculations

Each hero has specific gap calculations:

- **Abrams/Yamato**: Base gap 11 + 28, threshold -7
- **Shiv**: Base gap 11 + 20, threshold -3
- **Mo & Krill**: Base gap 11 + 14, threshold -3
- **Default**: Base gap 11, threshold 0
- **Static Mode**: Base gap 4, increment always 1

When the gap slider is ≤ threshold, increment is 1, otherwise 2.

Final gap = baseGap + (gapSliderValue × increment)
