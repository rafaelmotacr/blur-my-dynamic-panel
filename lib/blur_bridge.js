// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Copyright (c) 2026 Rafael Mota.

import St from "gi://St";

import Func from "./func.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

// 面板模糊與 Dynamic Panel 之間的橋接
// Bridge between the panel blur (adapted from Blur my Shell) and Dynamic Panel.
//
// The blur component asks this object about the current state of the main panel, so that the blur
// follows what Dynamic Panel does: which mode the panel is in, which shape it has, and who paints
// its background. Every value is read on demand, so it is never out of sync with Dynamic Panel.
export default class BlurBridge {
    constructor(settings, panel) {
        this._settings = settings;
        this._blurSettings = settings.get_child("blur");
        this._panel = panel;
        // set by the extension: called with the background style class the blur applies to the
        // main panel (null when none)
        this.onPanelClassChanged = null;
    }

    panel_class_changed(blurClass) {
        this.onPanelClassChanged?.(blurClass);
    }

    destroy() {
        this.onPanelClassChanged = null;
        this._settings = null;
        this._blurSettings = null;
        this._panel = null;
    }

    is_main(panel) {
        return panel === Main.panel;
    }

    /// The mode Dynamic Panel currently gives to the main panel:
    /// - "overview": the overview is shown, Dynamic Panel restores the stock panel;
    /// - "floating": Floating Mode;
    /// - "hidden": Solid Mode with the "Hide" type (the panel slides out, and peeks back in);
    /// - "solid": Solid Mode with the "Dock" type.
    mode() {
        if (Main.panel.has_style_pseudo_class("overview"))
            return "overview";
        if (Main.panel.has_style_class_name(this._panel.floatingPanelClass))
            return "floating";
        if (this._settings.get_int("solid-type") === 1)
            return "hidden";
        return "solid";
    }

    /// Whether Dynamic Panel paints the background of the main panel with its own colors.
    paints_background() {
        switch (this.mode()) {
            case "floating":
            case "hidden":
                return true;
            case "solid":
                return this._settings.get_boolean("colors-use-in-static");
            default:
                return false;
        }
    }

    /// Whether the colors of Dynamic Panel win over the background style of the blur right now.
    colors_win() {
        return this._blurSettings.get_int("background-priority") === 0 && this.paints_background();
    }

    /// Whether the blur may be shown behind the main panel in the current mode.
    blur_allowed() {
        switch (this.mode()) {
            case "floating":
            case "hidden":
                return this._blurSettings.get_boolean("blur-in-floating");
            case "solid":
                return this._blurSettings.get_boolean("blur-in-solid");
            default:
                // the overview is handled by the blur settings themselves
                return true;
        }
    }

    match_shape() {
        return this._blurSettings.get_boolean("match-panel-shape");
    }

    use_detection() {
        return this._blurSettings.get_boolean("use-panel-detection");
    }

    /// Whether a window is near the main panel, as detected by Dynamic Panel.
    window_near() {
        return !Func.isFloating(this._settings);
    }

    /// Whether the "Area" background mode is selected.
    area_setting() {
        return this._settings.get_int("background-mode") === 1;
    }

    /// Whether the blur must currently go behind each area instead of behind the whole panel.
    use_area_shape() {
        if (!this.match_shape() || !this.area_setting())
            return false;
        const mode = this.mode();
        return mode === "floating" || mode === "hidden";
    }

    area_boxes() {
        return [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
    }

    /// The border radius Dynamic Panel currently gives to the main panel (it is animated).
    panel_radius() {
        return this._panel.currentRadius ?? 0;
    }

    /// The border radius Dynamic Panel gives to each area in the "Area" background mode.
    area_radius() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        return Main.panel.get_height() / 2 * (this._settings.get_int("radius-times") / 100) * scale;
    }
}
