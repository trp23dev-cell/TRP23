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
function drawWindow(g, x, y, w, h, lit, r) {
  g.fillStyle = "rgba(10,9,8,.55)";
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = STONE;
  g.fillRect(x - 3, y - 5, w + 6, 4); // lintel
  g.fillRect(x - 3, y + h + 1, w + 6, 3); // sill

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

export function facadeAlbedo(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    drawBrick(g, w, h, 7);
    const plan = windowPlan(11, WINDOWS_PER_TILE);
    const r = rand(29);
    const ww = 42;
    const wh = 62;
    for (let i = 0; i < WINDOWS_PER_TILE; i += 1) {
      const x = 22 + i * ((w - 44) / (WINDOWS_PER_TILE - 1)) - ww / 2;
      drawWindow(g, x, (h - wh) / 2, ww, wh, plan[i], r);
    }
  });
}

export function facadeEmissive(canvasTex) {
  return canvasTex(TILE_W, TILE_H, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const plan = windowPlan(11, WINDOWS_PER_TILE);
    const r = rand(29);
    const ww = 42;
    const wh = 62;
    for (let i = 0; i < WINDOWS_PER_TILE; i += 1) {
      if (!plan[i]) continue;
      const x = 22 + i * ((w - 44) / (WINDOWS_PER_TILE - 1)) - ww / 2;
      g.fillStyle = WINDOW_LIT;
      g.globalAlpha = 0.55 + r() * 0.4;
      g.fillRect(x, (h - wh) / 2, ww, wh);
      g.globalAlpha = 1;
    }
  });
}

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
