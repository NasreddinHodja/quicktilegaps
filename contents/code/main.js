// SPDX-FileCopyrightText: 2026 Tomás Bizet <tbizetde@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later

// Gaps for windows placed by KWin's quick tiling and by maximise.

const MaximizeFull = 3; // MaximizeVertical | MaximizeHorizontal

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
    const tolerance = 2; // committed frames land a pixel or so off
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

function customRoot(window) {
    if (typeof workspace.rootTile === "function") { // Plasma 6.7 and later
        const desktop = window.desktops.length > 0
            ? window.desktops[0]
            : workspace.currentDesktop;
        return workspace.rootTile(window.output, desktop);
    }
    const tiling = workspace.tilingForScreen(window.output.name);
    return tiling ? tiling.rootTile : null;
}

function applyGap(window, force) {
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
            return; // KWin pads custom layouts itself
        }
        if (root.padding !== 0) {
            root.padding = 0;
            force = true;
        }

        // Half an inner gap on shared edges, a full outer gap on the work
        // area boundary, so neighbours contribute one gap between them.
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

    // Anywhere else is a window gapped already or moved by hand.
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

workspace.virtualScreenGeometryChanged.connect(regapAll);
workspace.screensChanged.connect(regapAll);

workspace.windowList().forEach(watch);
workspace.windowAdded.connect(watch);
