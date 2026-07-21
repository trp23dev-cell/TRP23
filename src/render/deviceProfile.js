export function detectRenderDeviceProfile(platform){
  const memory=Number(navigator.deviceMemory||0);
  const cores=Number(navigator.hardwareConcurrency||0);
  const touchPoints=Number(navigator.maxTouchPoints||0);
  const isTouch=platform?.isTouchDevice||touchPoints>0;
  const isAndroid=platform?.isAndroid||/android/i.test(navigator.userAgent);
  const isDesktop=platform?.isDesktop||(!isAndroid&&!isTouch);

  let tier="medium";
  if(isDesktop&&cores>=8&&(memory>=8||memory===0)) tier="high";
  else if(isAndroid&&(memory>0&&memory<=4||cores>0&&cores<=6)) tier="low";
  else if(isTouch&&memory>0&&memory<=3) tier="low";
  else if(isDesktop&&cores>=4) tier="high";

  return {
    tier,
    memory,
    cores,
    isTouch,
    isAndroid,
    isDesktop,
    touchPoints,
  };
}
