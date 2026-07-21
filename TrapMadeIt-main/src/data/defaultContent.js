export const defaultContent = {
  version: 1,
  brand: {
    name: "TRAP MADE IT",
    chapterTitle: "The Come Up",
    moralStatement:
      "From being trapped in survival mode to building ownership, craft, and community.",
  },
  chapters: [
    {
      id: "lvl-01",
      number: "01",
      name: "THE COME UP",
      subtitle: "Every empire starts at the bottom.",
      roomVisualKey: "abandoned-squat",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Awareness: you are not stuck forever.",
      stash: { code: "TRAP-COMEUP10", deal: "10% OFF YOUR NEXT ORDER" },
      dropId: "drop-chain-core",
      missions: [
        { id: "walk", type: "explore", title: "Case the spot", rewardCoins: 150, limit: 1, antiAbuseRule: "distance-threshold" },
        { id: "board", type: "inspect", title: "Read the board", rewardCoins: 100, limit: 1, antiAbuseRule: "single-clear" },
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" }
      ]
    },
    {
      id: "lvl-02",
      number: "02",
      name: "THE COOK UP",
      subtitle: "The kitchen is where plans get made.",
      roomVisualKey: "derelict-kitchen",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Discipline: craft over chaos.",
      stash: { code: "TRAP-COOKUP15", deal: "15% OFF YOUR NEXT ORDER" },
      dropId: "drop-star-midnight",
      missions: [
        { id: "inspect", type: "viewer_spin", title: "Inspect the drop", rewardCoins: 150, limit: 1, antiAbuseRule: "single-clear" },
        { id: "own1", type: "purchase_count", title: "First flip", rewardCoins: 250, requirement: 1, limit: 1, antiAbuseRule: "order-linked" },
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" }
      ]
    },
    {
      id: "lvl-03",
      number: "03",
      name: "THE GRAVEYARD SHIFT",
      subtitle: "Money never sleeps. Neither do you.",
      roomVisualKey: "stash-flat",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Consistency: pressure is not your identity.",
      stash: { code: "TRAP-SHIFT20", deal: "20% OFF YOUR NEXT ORDER" },
      dropId: "drop-cross-sand",
      missions: [
        { id: "own2", type: "purchase_count", title: "Stack the closet", rewardCoins: 300, requirement: 2, limit: 1, antiAbuseRule: "order-linked" },
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" }
      ]
    },
    {
      id: "lvl-04",
      number: "04",
      name: "THE FRONT",
      subtitle: "Look legit. Move different.",
      roomVisualKey: "shop-front",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Reputation: lead with standards.",
      stash: { code: "TRAP-FRONT25", deal: "25% OFF YOUR NEXT ORDER" },
      dropId: "drop-wave-teal",
      missions: [
        { id: "viewall", type: "inspect_count", title: "Know the stock", rewardCoins: 400, requirement: 4, limit: 1, antiAbuseRule: "distinct-items" },
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" }
      ]
    },
    {
      id: "lvl-05",
      number: "05",
      name: "TOP FLOOR",
      subtitle: "New heights. Same hunger.",
      roomVisualKey: "top-floor-office",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Ownership: build what lasts.",
      stash: { code: "TRAP-TOPFLOOR30", deal: "30% OFF YOUR NEXT ORDER" },
      dropId: "drop-web-storm",
      missions: [
        { id: "own3", type: "purchase_count", title: "Serious collector", rewardCoins: 300, requirement: 3, limit: 1, antiAbuseRule: "order-linked" },
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" }
      ]
    },
    {
      id: "lvl-06",
      number: "06",
      name: "THE WAREHOUSE",
      subtitle: "Your name on the label now.",
      roomVisualKey: "warehouse",
      isActive: true,
      unlockWindow: { startAt: null, endAt: null },
      moralFocus: "Legacy: create opportunity for others.",
      stash: { code: "TRAP-MADEIT40", deal: "40% OFF - YOU MADE IT" },
      dropId: "drop-flame-blood",
      missions: [
        { id: "stash", type: "stash", title: "Find the stash", rewardCoins: 500, limit: 1, antiAbuseRule: "single-clear" },
        { id: "label", type: "creator_unlock", title: "Start your label", rewardCoins: 0, limit: 1, antiAbuseRule: "single-clear" }
      ]
    }
  ],
  drops: [
    { id: "drop-chain-core", sku: "TRAP-CHAIN-BLK", name: "Chain Detail Set", color: "Black", priceCoins: 1250, demand: "HIGH", active: true, rarity: "standard", campaignMessage: "Earn your first flip.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } },
    { id: "drop-star-midnight", sku: "TRAP-STAR-NVY", name: "Star Patch Set", color: "Midnight Navy", priceCoins: 1400, demand: "HIGH", active: true, rarity: "standard", campaignMessage: "Quiet on rack, loud in movement.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } },
    { id: "drop-cross-sand", sku: "TRAP-CROSS-SND", name: "Cross Rhinestone Set", color: "Sand", priceCoins: 1350, demand: "HIGH", active: true, rarity: "limited", campaignMessage: "Clean look, heavy intent.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } },
    { id: "drop-wave-teal", sku: "TRAP-WAVE-TEL", name: "Wave Panel Set", color: "Deep Teal", priceCoins: 1500, demand: "VERY HIGH", active: true, rarity: "limited", campaignMessage: "Movement in every stitch.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } },
    { id: "drop-web-storm", sku: "TRAP-WEB-GRY", name: "Crystal Web Set", color: "Storm Grey", priceCoins: 1300, demand: "HIGH", active: true, rarity: "standard", campaignMessage: "Proof in the details.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } },
    { id: "drop-flame-blood", sku: "TRAP-FLAME-RED", name: "Flame Detail Set", color: "Blood Red", priceCoins: 1600, demand: "VERY HIGH", active: true, rarity: "hero", campaignMessage: "Built to stand out with purpose.", media: { front: "placeholder-front", back: "placeholder-back" }, unlockWindow: { startAt: null, endAt: null } }
  ]
};
