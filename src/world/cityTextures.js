// ============================================================================
// CITY TEXTURES — the surfaces of the block.
//
// Everything is drawn to a canvas at load rather than shipped as image files:
// it costs a few milliseconds, keeps the download small, and lets the whole
// palette stay tied to the game's gold-and-soot look in one place.
//
// The UV convention is set by buildingMesh.js: one texture tile is 6m wide and
// one storey (3.2m) tall, so every building on a street lines up floor for
// floor no matter how wide it is.
//
// Each facade comes with a matching emissive map holding only the lit windows.
// That is what lets the windows burn at dusk and fade out as the sky comes up —
// the same arc the sky and the door lights are already carrying.
// ============================================================================

const TILE_W = 256;
const TILE_H = 137; // 256 * (3.2 / 6), so the drawing is not stretched

// Lincoln is brick with limestone dressings, weathered dark. Kept deliberately
// desaturated so the gold signage stays the brightest thing on the street.
const BRICKS = ["#3a2f28", "#413229", "#352b25", "#463527", "#31282300"];
const STONE = "#4a463d";
const WINDOW_DARK = "rgba(18,17,20,.92)";
const WINDOW_LIT = "#c9a06a";

function rand(seed) {
  // Deterministic noise, so the city looks the same on every load.
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- facades

function drawBrick(g, w, h, seed) {
  const r = rand(seed);
  g.fillStyle = "#372c25";
  g.fillRect(0, 0, w, h);
  const bh = 9;
  const bw = 22;
  for (let y = 0; y < h; y += bh) {
    const offset = ((y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < w + bw; x += bw) {
      g.fillStyle = BRICKS[(r() * BRICKS.length) | 0];
      g.fillRect(x + offset + 0.6, y + 0.6, bw - 1.2, bh - 1.2);
    }
  }
  // Soot and damp streaking. Cities are not clean.
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(12,11,10,${r() * 0.16})`;
    const x = r() * w;
    g.fillRect(x, 0, 2 + r() * 10, h);
  }
}

/** A sash window with its reveal, drawn into the given box. */
function drawWindow(g, x, y, w, h, lit, r, sill = true) {
  g.fillStyle = "rgba(10,9,8,.55)";
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (sill) {
    g.fillStyle = STONE;
    g.fillRect(x - 3, y - 5, w + 6, 4); // lintel
    g.fillRect(x - 3, y + h + 1, w + 6, 3); // sill
  }

  g.fillStyle = lit ? WINDOW_LIT : WINDOW_DARK;
  g.globalAlpha = lit ? 0.5 + r() * 0.4 : 1;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;

  // Glazing bars.
  g.strokeStyle = "rgba(20,18,16,.85)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2);
  g.stroke();
}

/** Which windows are lit, decided once so albedo and emissive agree. */
function windowPlan(seed, count) {
  const r = rand(seed);
  const plan = [];
  for (let i = 0; i < count; i += 1) plan.push(r() < 0.34);
  return plan;
}

const WINDOWS_PER_TILE = 3;

// ---------------------------------------------------------------- styles
//
// Lincoln is not one material, and the split is geographic rather than
// decorative. Uphill — Bailgate, Castle Hill, Minster Yard — is Lincoln
// limestone, the pale honey-grey stone the Cathedral is built from. Downhill is
// overwhelmingly Victorian red brick. The High Street mixes in painted render,
// and the post-war edges are panel and concrete.

/** Coursed limestone ashlar: uphill Lincoln, and every civic building. */
function drawLimestone(g, w, h, seed) {
  const r = rand(seed);
  g.fillStyle = "#6d6857";
  g.fillRect(0, 0, w, h);
  const bh = 17;
  const bw = 46;
  for (let y = 0; y < h; y += bh) {
    const offset = ((y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < w + bw; x += bw) {
      const v = 118 + r() * 30;
      g.fillStyle = `rgb(${v},${v - 6},${v - 26})`;
      g.fillRect(x + offset + 0.7, y + 0.7, bw - 1.4, bh - 1.4);
    }
  }
  // Weathering runs down the stone rather than sitting on it.
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(46,44,38,${r() * 0.14})`;
    g.fillRect(r() * w, 0, 3 + r() * 12, h);
  }
}

/** Painted render, the High Street's other half. */
function drawRender(g, w, h, seed) {
  const r = rand(seed);
  const hue = [[104, 96, 84], [86, 84, 78], [112, 92, 76], [78, 86, 82]][seed % 4];
  g.fillStyle = `rgb(${hue[0]},${hue[1]},${hue[2]})`;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i += 1) {
    const v = -12 + r() * 24;
    g.fillStyle = `rgba(${hue[0] + v},${hue[1] + v},${hue[2] + v},.5)`;
    g.fillRect(r() * w, r() * h, 3, 3);
  }
  // Damp rising up from the pavement, and staining under the sills.
  const grad = g.createLinearGradient(0, h, 0, h * 0.6);
  grad.addColorStop(0, "rgba(30,28,24,.4)");
  grad.addColorStop(1, "rgba(30,28,24,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/** Post-war panel and concrete, for the sheds and the retail boxes. */
function drawModern(g, w, h, seed) {
  const r = rand(seed);
  g.fillStyle = "#4a4a4c";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 34) {
    const v = 62 + r() * 16;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(0, y + 1, w, 32);
    g.fillStyle = "rgba(20,20,22,.5)";
    g.fillRect(0, y, w, 1.5);
  }
}

const SURFACE = {
  brick: drawBrick,
  limestone: drawLimestone,
  render: drawRender,
  modern: drawModern,
};

// Window shape follows the material: Georgian sashes in stone, narrower
// Victorian openings in brick, long horizontal strips in the modern boxes.
const WINDOW_STYLE = {
  brick: { count: 3, w: 42, h: 62, sill: true },
  limestone: { count: 3, w: 46, h: 74, sill: true },
  render: { count: 3, w: 44, h: 64, sill: true },
  modern: { count: 2, w: 96, h: 46, sill: false },
};

const STYLE_SEED = { brick: 7, limestone: 23, render: 41, modern: 59 };

function facadeWindows(g, w, h, style, emissiveOnly) {
  const cfg = WINDOW_STYLE[style] || WINDOW_STYLE.brick;
  const plan = windowPlan(STYLE_SEED[style] + 4, cfg.count);
  const r = rand(STYLE_SEED[style] + 9);
  for (let i = 0; i < cfg.count; i += 1) {
    const gap = (w - cfg.w * cfg.count) / (cfg.count + 1);
    const x = gap + i * (cfg.w + gap);
    const y = (h - cfg.h) / 2;
    if (emissiveOnly) {
      if (!plan[i]) continue;
      g.fillStyle = WINDOW_LIT;
      g.globalAlpha = 0.5 + r() * 0.4;
      g.fillRect(x, y, cfg.w, cfg.h);
      g.globalAlpha = 1;
    } else {
      drawWindow(g, x, y, cfg.w, cfg.h, plan[i], r, cfg.sill);
    }
  }
}

export function facadeAlbedo(canvasTex, style = "brick") {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    (SURFACE[style] || drawBrick)(g, w, h, STYLE_SEED[style] || 7);
    facadeWindows(g, w, h, style, false);
  });
}

export function facadeEmissive(canvasTex, style = "brick") {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    facadeWindows(g, w, h, style, true);
  });
}

export const FACADE_STYLES = ["brick", "limestone", "render", "modern"];

// ---------------------------------------------------------------- shopfronts

/**
 * Street level. This is the band the player actually walks past, so it carries
 * the most detail: a glazed shopfront, a stall riser, a fascia for signage and
 * a recessed doorway.
 */
export function shopfrontAlbedo(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    const r = rand(17);
    drawBrick(g, w, h, 3);

    // Fascia board across the top — where a shop's name would sit.
    g.fillStyle = "#17140f";
    g.fillRect(0, 0, w, 26);
    g.strokeStyle = "rgba(201,160,106,.30)";
    g.lineWidth = 2;
    g.strokeRect(3, 3, w - 6, 20);

    // Glazing: one wide window and a door.
    const top = 34;
    const bottom = h - 16;
    g.fillStyle = "#0d0c0f";
    g.fillRect(10, top, w - 76, bottom - top);

    // Warm interior spill behind the glass. Kept dim in the albedo — the
    // emissive map is what makes it glow, and doubling up here blows the whole
    // band out to a flat cream stripe with no shopfront left in it.
    const grad = g.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, "rgba(201,160,106,.22)");
    grad.addColorStop(1, "rgba(120,96,64,.05)");
    g.fillStyle = grad;
    g.fillRect(12, top + 2, w - 80, bottom - top - 4);

    // Racking and stock, so a lit window has something behind the glass.
    for (let i = 0; i < 7; i += 1) {
      g.fillStyle = `rgba(30,26,22,${0.25 + r() * 0.4})`;
      const bx = 16 + r() * (w - 100);
      const bh = 10 + r() * 26;
      g.fillRect(bx, bottom - 4 - bh, 8 + r() * 14, bh);
    }

    // Mullions.
    g.strokeStyle = "rgba(14,13,12,.95)";
    g.lineWidth = 3;
    for (let x = 10; x < w - 66; x += 42) {
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke();
    }
    g.strokeStyle = "rgba(14,13,12,.95)";
    g.lineWidth = 4;
    g.strokeRect(10, top, w - 76, bottom - top);

    // Door.
    g.fillStyle = "#120f0b";
    g.fillRect(w - 60, top, 44, bottom - top + 16);
    g.strokeStyle = "rgba(201,160,106,.35)";
    g.lineWidth = 2;
    g.strokeRect(w - 57, top + 3, 38, bottom - top + 8);

    // Stall riser and pavement shadow.
    g.fillStyle = "#0f0d0b";
    g.fillRect(0, h - 16, w, 16);
    g.fillStyle = "rgba(0,0,0,.45)";
    g.fillRect(0, h - 5, w, 5);
  });
}

export function shopfrontEmissive(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const top = 34;
    const bottom = h - 16;
    // Only the glass glows, and it falls off toward the pavement. The frame,
    // the stall riser and the brick stay dark so the shopfront keeps its shape
    // once the bloom pass gets hold of it.
    const grad = g.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, "rgba(201,160,106,.62)");
    grad.addColorStop(1, "rgba(201,160,106,.08)");
    g.fillStyle = grad;
    g.fillRect(14, top + 4, w - 84, bottom - top - 8);
  });
}

// ---------------------------------------------------------------- roofs

/** Slate, seen from above and from the cathedral hill. */
export function roofAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(101);
    g.fillStyle = "#1e2023";
    g.fillRect(0, 0, w, h);
    const th = 14;
    const tw = 26;
    // Kept dark: at two storeys you see a lot of roof from street level, and a
    // bright slate reads as a grey slab hanging over the shopfronts.
    for (let y = 0; y < h; y += th) {
      const offset = ((y / th) % 2) * (tw / 2);
      for (let x = -tw; x < w + tw; x += tw) {
        const v = 24 + r() * 14;
        g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
        g.fillRect(x + offset + 0.5, y + 0.5, tw - 1, th - 1);
      }
    }
    // Damp patches and lichen.
    for (let i = 0; i < 40; i += 1) {
      g.fillStyle = `rgba(${60 + r() * 30},${66 + r() * 30},${52 + r() * 20},${r() * 0.18})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 4 + r() * 16, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------- ground

/** Tarmac, with enough variation that a wide road does not band. */
export function roadAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(53);
    g.fillStyle = "#2e2b28";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i += 1) {
      const v = 30 + r() * 34;
      g.fillStyle = `rgba(${v},${v - 2},${v - 5},${r() * 0.5})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // Wet patches catching the streetlight.
    for (let i = 0; i < 14; i += 1) {
      g.fillStyle = `rgba(90,94,104,${r() * 0.07})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Paving slabs for the footways. */
export function pavementAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(71);
    g.fillStyle = "#413d38";
    g.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const v = 58 + r() * 16;
        g.fillStyle = `rgb(${v},${v - 3},${v - 7})`;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
    g.fillStyle = "rgba(0,0,0,.25)";
    for (let i = 0; i < 1800; i += 1) g.fillRect(r() * w, r() * h, 2, 2);
  });
}

/**
 * Plinth stone: the coursed base a building sits on where the ground falls
 * away. Deliberately plain and dark — it is below the eye and its job is to
 * ground the building, not to compete with the shopfront above it.
 */
export function plinthAlbedo(canvasTex) {
  return canvasTex(256, 128, (g, w, h) => {
    const r = rand(211);
    g.fillStyle = "#39362f";
    g.fillRect(0, 0, w, h);
    const bh = 21;
    const bw = 58;
    for (let y = 0; y < h; y += bh) {
      const offset = ((y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < w + bw; x += bw) {
        const v = 58 + r() * 20;
        g.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
        g.fillRect(x + offset + 1, y + 1, bw - 2, bh - 2);
      }
    }
    // Damp at the very bottom, where it meets the pavement.
    const grad = g.createLinearGradient(0, h, 0, h * 0.55);
    grad.addColorStop(0, "rgba(14,13,11,.55)");
    grad.addColorStop(1, "rgba(14,13,11,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/**
 * A residential ground floor: front door, one window, brick.
 *
 * Two thirds of the buildings in the city centre are houses and flats. Giving
 * them the shopfront treatment is what makes a procedural city read as fake —
 * every street becomes a retail parade. This is the other two thirds.
 */
export function residentialAlbedo(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    const r = rand(131);
    drawBrick(g, w, h, 5);

    // Window to one side.
    drawWindow(g, 26, 30, 54, 66, false, r, true);

    // Panelled front door with a step and a fanlight over it.
    const dx = w - 92;
    const dw = 46;
    const dtop = 20;
    g.fillStyle = STONE;
    g.fillRect(dx - 5, dtop - 6, dw + 10, 5);
    g.fillStyle = "#241c14";
    g.fillRect(dx, dtop, dw, h - dtop - 12);
    g.fillStyle = "rgba(201,160,106,.20)";
    g.fillRect(dx + 5, dtop + 3, dw - 10, 12);          // fanlight
    g.strokeStyle = "rgba(12,10,8,.85)";
    g.lineWidth = 2;
    g.strokeRect(dx + 6, dtop + 22, dw - 12, 30);        // upper panel
    g.strokeRect(dx + 6, dtop + 60, dw - 12, 28);        // lower panel
    // Doorstep.
    g.fillStyle = "#3f3a32";
    g.fillRect(dx - 4, h - 12, dw + 8, 6);

    g.fillStyle = "rgba(0,0,0,.45)";
    g.fillRect(0, h - 5, w, 5);
  });
}

export function residentialEmissive(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    // Just the fanlight over the door: a hallway light left on.
    g.fillStyle = "rgba(201,160,106,.42)";
    g.fillRect(w - 87, 23, 36, 12);
  });
}

/**
 * Gothic stonework: tall lancet windows, buttresses, no floor divisions.
 *
 * This one is UV-mapped over the WHOLE height of the building rather than per
 * storey. A cathedral is not a stack of floors — mapping it per storey gave
 * Lincoln Cathedral twenty-six rows of office windows, which is how it ended up
 * looking like everything else on the street.
 */
export function monumentAlbedo(canvasTex) {
  return canvasTex(256, 512, (g, w, h) => {
    const r = rand(307);
    // Ashlar, laid in much bigger courses than domestic work.
    g.fillStyle = "#6f6a58";
    g.fillRect(0, 0, w, h);
    const bh = 26;
    const bw = 62;
    for (let y = 0; y < h; y += bh) {
      const offset = ((y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < w + bw; x += bw) {
        const v = 120 + r() * 26;
        g.fillStyle = `rgb(${v},${v - 5},${v - 24})`;
        g.fillRect(x + offset + 0.8, y + 0.8, bw - 1.6, bh - 1.6);
      }
    }

    // Buttresses: vertical piers standing proud, with their shadows.
    for (const bx of [8, 122, 236]) {
      g.fillStyle = "rgba(255,250,235,.10)";
      g.fillRect(bx, 0, 26, h);
      g.fillStyle = "rgba(30,28,22,.34)";
      g.fillRect(bx + 26, 0, 9, h);
    }

    // Two tall lancets between the buttresses, pointed at the head.
    for (const cx of [78, 192]) {
      const top = h * 0.22;
      const bottom = h * 0.88;
      const ww = 34;
      g.fillStyle = "rgba(26,24,28,.92)";
      g.beginPath();
      g.moveTo(cx - ww / 2, bottom);
      g.lineTo(cx - ww / 2, top + 26);
      g.quadraticCurveTo(cx, top - 16, cx + ww / 2, top + 26);
      g.lineTo(cx + ww / 2, bottom);
      g.closePath();
      g.fill();
      // Tracery.
      g.strokeStyle = "rgba(150,144,124,.85)";
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.moveTo(cx, top + 4); g.lineTo(cx, bottom);
      g.moveTo(cx - ww / 2, bottom - 60); g.lineTo(cx + ww / 2, bottom - 60);
      g.stroke();
    }

    // Weathering down the stone.
    for (let i = 0; i < 44; i += 1) {
      g.fillStyle = `rgba(44,42,34,${r() * 0.13})`;
      g.fillRect(r() * w, 0, 3 + r() * 10, h);
    }
  });
}

export function monumentEmissive(canvasTex) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    // Candlelight through the glass, dim and warm.
    for (const cx of [78, 192]) {
      const top = h * 0.22;
      const bottom = h * 0.88;
      const ww = 34;
      g.fillStyle = "rgba(201,160,106,.34)";
      g.beginPath();
      g.moveTo(cx - ww / 2, bottom);
      g.lineTo(cx - ww / 2, top + 26);
      g.quadraticCurveTo(cx, top - 16, cx + ww / 2, top + 26);
      g.lineTo(cx + ww / 2, bottom);
      g.closePath();
      g.fill();
    }
  });
}

/** Cobbles. Lincoln has real ones, and OSM says where. */
export function cobbleAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(419);
    g.fillStyle = "#33302b";
    g.fillRect(0, 0, w, h);
    const s = 15;
    for (let y = 0; y < h; y += s) {
      const off = ((y / s) % 2) * (s / 2);
      for (let x = -s; x < w + s; x += s) {
        const v = 52 + r() * 26;
        g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
        g.beginPath();
        g.ellipse(x + off + s / 2, y + s / 2, s * 0.42, s * 0.38, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = "rgba(0,0,0,.3)";
    for (let i = 0; i < 1200; i += 1) g.fillRect(r() * w, r() * h, 2, 2);
  });
}

/** Poured concrete: service yards, precinct decks. */
export function concreteAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(523);
    g.fillStyle = "#4c4a46";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i += 1) {
      const v = 66 + r() * 20;
      g.fillStyle = `rgba(${v},${v},${v - 3},.45)`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // Slab joints.
    g.strokeStyle = "rgba(28,27,25,.5)";
    g.lineWidth = 2;
    for (const t of [0, 128]) {
      g.beginPath(); g.moveTo(t, 0); g.lineTo(t, h); g.moveTo(0, t); g.lineTo(w, t); g.stroke();
    }
  });
}

/** Loose gravel and beaten ground. */
export function gravelAlbedo(canvasTex) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(631);
    g.fillStyle = "#3d382f";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i += 1) {
      const v = 52 + r() * 30;
      g.fillStyle = `rgba(${v},${v - 4},${v - 12},.6)`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  });
}
