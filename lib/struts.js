// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Copyright (c) 2026 Rafael Mota.

import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

// 穩定工作區：讓面板的動畫不再改變工作區
// Stable work area: the space reserved for the panel no longer changes while it animates.
//
// GNOME computes the space reserved at the top of the screen (the "strut") from the transformed
// position of the panel box. When the panel floats it leaves the top edge, so the strut disappears;
// when it docks back, the strut comes back on the last frame. Every change of the strut changes the
// work area, and Mutter then resizes every maximized or tiled window, whose apps redraw entirely:
// the hitch at the end of the transition (and twice when maximizing a window while floating).
//
// Here the panel box keeps its input region and fullscreen tracking but stops reserving space, and
// an invisible actor that never moves reserves it instead: the height of the panel with the "Dock"
// Solid Mode, nothing with the "Hide" type (whose panel never reserved space).
// 追蹤 chrome 角色；新版 GNOME（僅 Wayland）已移除 affectsInputRegion 參數
// Tracks a chrome actor. `affectsInputRegion` only matters for X11 sessions, and GNOME versions
// without X11 sessions reject it ("Unrecognized parameter"), so it is dropped when refused.
// `trackChrome` rejects unknown parameters before tracking anything, so retrying is safe.
function trackChrome(actor, params) {
    try {
        Main.layoutManager.trackChrome(actor, { ...params });
    } catch (error) {
        if (!("affectsInputRegion" in params) || !String(error).includes("affectsInputRegion"))
            throw error;
        const { affectsInputRegion, ...supported } = params;
        Main.layoutManager.trackChrome(actor, supported);
    }
}

export default class StrutKeeper {
    constructor(settings) {
        this._settings = settings;
        this._strut = null;
        this._signals = [];
    }

    get active() {
        return this._strut !== null;
    }

    enable() {
        if (this._strut)
            return;

        const layoutManager = Main.layoutManager;
        this._strut = new St.Widget({
            name: "bmdp-strut",
            reactive: false,
            opacity: 0,
        });
        // added to the UI group first, then tracked: `addChrome` would add the child before
        // validating the parameters, and could not be retried
        layoutManager.uiGroup.add_child(this._strut);
        try {
            trackChrome(this._strut, {
                affectsStruts: true,
                affectsInputRegion: false,
                trackFullscreen: true,
            });
        } catch (error) {
            this._strut.destroy();
            this._strut = null;
            throw error;
        }

        layoutManager.untrackChrome(layoutManager.panelBox);
        try {
            trackChrome(layoutManager.panelBox, {
                affectsStruts: false,
                affectsInputRegion: true,
                trackFullscreen: true,
            });
        } catch (error) {
            // put the panel box back as GNOME tracks it, and give up the stable work area
            layoutManager.trackChrome(layoutManager.panelBox, { affectsStruts: true, trackFullscreen: true });
            layoutManager.untrackChrome(this._strut);
            this._strut.destroy();
            this._strut = null;
            throw error;
        }

        this._signals = [
            [Main.panel, Main.panel.connect("notify::height", () => this.update())],
            [layoutManager, layoutManager.connect("monitors-changed", () => this.update())],
        ];
        this.update();
    }

    update() {
        if (!this._strut)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const reserve = this._settings.get_int("solid-type") === 0;
        this._strut.set_position(monitor.x, monitor.y);
        this._strut.set_size(monitor.width, reserve ? Main.panel.get_height() : 0);
    }

    disable() {
        if (!this._strut)
            return;

        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];

        const layoutManager = Main.layoutManager;
        // the same parameters GNOME gives the panel box
        layoutManager.untrackChrome(layoutManager.panelBox);
        layoutManager.trackChrome(layoutManager.panelBox, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        layoutManager.untrackChrome(this._strut);
        this._strut.destroy();
        this._strut = null;
    }
}
