// SPDX-FileCopyrightText: 2026 Tomás Bizet <tbizetde@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later

// Gaps for windows placed by KWin's built-in quick tiling (Meta+arrow, screen-edge drag)
// and by maximise.
//
// KWin can only pad the custom layouts drawn in the tile editor: QuickRootTile and its
// eight children are constructed with padding hardcoded to 0 (kwin/src/tiles/quicktile.cpp)
// and the [Tiling] padding setting is pushed to the custom root tile only. Windows inside
// a custom layout are skipped here so that their native padding keeps working.
//
// Requires Plasma 6.3 or later, where Window.maximizeMode became scriptable.

const MaximizeFull = 3; // KWin::MaximizeMode, MaximizeVertical | MaximizeHorizontal

let innerGap = 8;
let outerGap = 8;
let maximizedGap = 8;

function gapSetting(key, fallback) {
    const value = parseInt(readConfig(key, fallback), 10);
    return isNaN(value) || value < 0 ? fallback : value;
}

function loadConfig() {
    innerGap = gapSetting("InnerGap", 8);
    outerGap = gapSetting("OuterGap", 8);
    maximizedGap = gapSetting("MaximizedGap", 8);
}

function sameRect(a, b) {
    // a committed frame lands a pixel or so off under fractional scaling
    const tolerance = 2; 
    return Math.abs(a.x - b.x) <= tolerance
        && Math.abs(a.y - b.y) <= tolerance
        && Math.abs(a.width - b.width) <= tolerance
        && Math.abs(a.height - b.height) <= tolerance;
}

function inset(rect, left, top, right, bottom) {
    return {
        x: rect.x + left,
        y: rect.y + top,
        width: rect.width - left - right,
        height: rect.height - top - bottom
    };
}

function topmost(tile) {
    let root = tile;
    while (root.parent) {
        root = root.parent;
    }
    return root;
}

// Root tile of the tile editor's layout for this window's output and desktop. KWin pads
// everything descending from it, so those tiles are not ours to touch. Any other root is
// the QuickRootTile, which scripts cannot reach except through a window that sits in it.
function customRoot(window) {
    if (typeof workspace.rootTile === "function") { // Plasma 6.7 and later
        const desktop = window.desktops.length > 0 ? window.desktops[0] : workspace.currentDesktop;
        return workspace.rootTile(window.output, desktop);
    }
    const tiling = workspace.tilingForScreen(window.output.name); // deprecated in 6.7
    return tiling ? tiling.rootTile : null;
}

function applyGap(window, force) {
    // A monitor being unplugged fires screensChanged while some windows are still pointing
    // at the output that is going away.
    if (!window.output) {
        return;
    }

    const area = workspace.clientArea(KWin.MaximizeArea, window);
    const tile = window.tile;
    let base;
    let margins;

    if (tile) {
        const root = topmost(tile);
        if (root === customRoot(window)) {
            return;
        }
        // KWin never writes quick tile padding, so only a second gaps script can make this
        // non-zero. Clearing it keeps this script the single source of spacing rather than
        // stacking our inset on top of someone else's padding.
        if (root.padding !== 0) {
            root.padding = 0;
            force = true;
        }

        // Half the inner gap on each edge shared with a neighbour, the full outer gap on
        // each edge lying on the work area boundary, so two neighbours contribute one inner
        // gap between them. Tile geometry comes from the same clientArea rect compared
        // against here (Tile::absoluteGeometry), so the edge tests are exact rather than
        // approximate.
        const half = innerGap / 2;
        base = tile.absoluteGeometry;
        margins = [
            base.x <= area.x ? outerGap : half,
            base.y <= area.y ? outerGap : half,
            base.x + base.width >= area.x + area.width ? outerGap : half,
            base.y + base.height >= area.y + area.height ? outerGap : half
        ];
    } else if (window.maximizeMode === MaximizeFull) {
        base = area;
        margins = [maximizedGap, maximizedGap, maximizedGap, maximizedGap];
    } else {
        return;
    }

    // A window sitting anywhere other than where KWin just put it has either been gapped
    // already or resized by hand, and in both cases it should be left alone. This is also
    // what stops frameGeometryChanged from feeding back into itself.
    if (!force && !sameRect(window.frameGeometry, base)) {
        return;
    }

    const frame = inset(base, margins[0], margins[1], margins[2], margins[3]);
    if (frame.width > 0 && frame.height > 0) {
        window.frameGeometry = frame;
    }
}

function watch(window) {
    if (!window || !window.managed) {
        return;
    }
    const placed = function () {
        applyGap(window, true);
    };
    window.tileChanged.connect(placed);
    window.maximizedChanged.connect(placed);
    window.frameGeometryChanged.connect(function () {
        applyGap(window, false);
    });

    // Forced, like the placement handlers. A window that an earlier run of this script
    // already inset no longer matches its raw tile rect, so an unforced pass here would
    // skip every window that is currently gapped and the new gap sizes would only appear
    // on windows tiled from now on.
    applyGap(window, true);
}

function regapAll() {
    workspace.windowList().forEach(function (window) {
        applyGap(window, true);
    });
}

loadConfig();

options.configChanged.connect(function () {
    loadConfig();
    regapAll();
});

// Panels appearing, resolution changes and monitors coming and going all move the work
// area out from under windows that are already inset, leaving frames that no longer match
// any tile. Those windows only recover on a forced pass.
workspace.virtualScreenGeometryChanged.connect(regapAll);
workspace.screensChanged.connect(regapAll);

workspace.windowList().forEach(watch);
workspace.windowAdded.connect(watch);
