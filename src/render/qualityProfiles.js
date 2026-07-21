export const QUALITY_PROFILES={
  low:{maxPixelRatio:1.2, shadows:false, bloom:false, bloomStrength:.05, bloomRadius:.35, bloomThreshold:.95, shadowMapSize:512},
  medium:{maxPixelRatio:1.6, shadows:true, bloom:true, bloomStrength:.16, bloomRadius:.45, bloomThreshold:.88, shadowMapSize:1024},
  high:{maxPixelRatio:2.2, shadows:true, bloom:true, bloomStrength:.24, bloomRadius:.55, bloomThreshold:.8, shadowMapSize:2048},
};

export const DEFAULT_VISUAL_SETTINGS={
  quality:"high",
  brightness:1.3,
  bloom:0.25,
};

export const ROOM_LIGHT_PROFILES=[
  {ambient:1, hemi:1, directional:.98, point:1, spot:1, exposure:1.05},
  {ambient:.94, hemi:.95, directional:.96, point:.98, spot:1, exposure:1.0},
  {ambient:1, hemi:1, directional:1, point:1.05, spot:1.03, exposure:1.08},
  {ambient:.95, hemi:.95, directional:.96, point:1, spot:1, exposure:1.02},
  {ambient:.96, hemi:.98, directional:.98, point:1, spot:1, exposure:1.03},
  {ambient:.97, hemi:.97, directional:.98, point:1, spot:1, exposure:1.04},
];
