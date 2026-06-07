import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LegendIcons } from '@core/sde/svgSanitize.js';

export function loadLegendIcons(srcRoot: string): LegendIcons {
  const i = (rel: string) =>
    'data:image/png;base64,' +
    readFileSync(join(srcRoot, rel)).toString('base64');
  return {
    Keepstar:         i('src/assets/map-icons/citadelExtraLarge.png'),
    Fortizar:         i('src/assets/map-icons/citadelLarge.png'),
    Astrahus:         i('src/assets/map-icons/citadelMedium.png'),
    Sotiyo:           i('src/assets/map-icons/engineeringComplexExtraLarge.png'),
    Azbel:            i('src/assets/map-icons/engineeringComplexLarge.png'),
    Raitaru:          i('src/assets/map-icons/engineeringComplexMedium.png'),
    Tatara:           i('src/assets/map-icons/refineryLarge.png'),
    Athanor:          i('src/assets/map-icons/refineryMedium.png'),
    jumpPortal:       i('src/assets/map-icons/jumpPortalArray.png'),
    cynoBeacon:       i('src/assets/map-icons/cynosuralBeacon.png'),
    cynoJammer:       i('src/assets/map-icons/cynosuralSystemJammer.png'),
    relicSite:        i('src/assets/map-icons/relic_Site_16.png'),
    effectElectric:   i('src/assets/map-icons/systemEffects/Electric.png'),
    effectExotic:     i('src/assets/map-icons/systemEffects/Exotic.png'),
    effectGamma:      i('src/assets/map-icons/systemEffects/Gamma.png'),
    effectPlasma:     i('src/assets/map-icons/systemEffects/Plasma.png'),
  };
}
