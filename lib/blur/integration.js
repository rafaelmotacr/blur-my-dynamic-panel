// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Copyright (c) 2026 Rafael Mota.
// Contains code adapted from Blur my Shell, Copyright (c) aunetx and contributors.

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PipelinesManager } from './pipelines/pipelines_manager.js';
import { EffectsManager } from './pipelines/effects_manager.js';
import { Connections } from './conveniences/connections.js';
import { Settings } from './settings/settings.js';
import { KEYS } from './settings/keys.js';
import { PanelBlur } from './components/panel/index.js';
import { enable_system_style, disable_system_style } from './conveniences/style.js';
import { track_painted_views } from './render/backdrop/painted_view.js';
import { clear_snippets } from './render/shader/snippet_cache.js';


/// The panel blur of Blur My Dynamic Panel, adapted from the panel component of Blur my Shell.
///
/// This plays the role of Blur my Shell's extension class, restricted to the panel: it owns the
/// effects and pipelines managers shared by the panel backgrounds, enables the panel blur when the
/// shell is ready, and reacts to the blur settings (`org.gnome.shell.extensions.blur-my-dynamic-panel.blur`).
export default class PanelBlurIntegration {
    /// `gsettings` is the `blur` child of the Blur My Dynamic Panel settings, `bridge` the `BlurBridge`
    /// giving the state of the main panel.
    constructor(gsettings, bridge) {
        this._gsettings = gsettings;
        this._bridge = bridge;
        this._settings = null;
        this._panel_blur = null;
    }

    enable() {
        // the panel backgrounds read the pipelines manager from here, like Blur my Shell does with
        // `global.blur_my_shell`, under another name so that both extensions can run together
        global.blur_my_dynamic_panel = this;

        this._settings = new Settings(KEYS, this._gsettings);
        this._log("enabling panel blur...");

        this._connection = new Connections;
        this._panel_connection = new Connections;
        this._startup_complete_id = 0;
        this._paused = false;
        this._enabled = true;

        // the shell destroys its UI on shutdown without disabling extensions
        this._connection.connect(Main.uiGroup, 'destroy', () => this.disable());
        track_painted_views(this._connection);
        enable_system_style();

        this._effects_manager = new EffectsManager(this._connection);
        this._pipelines_manager = new PipelinesManager(this._settings);

        this._panel_blur = new PanelBlur(
            this._panel_connection, this._settings, this._effects_manager, this._bridge
        );

        this._power_profile_monitor = Gio.PowerProfileMonitor.dup_default();
        this._connection.connect(
            this._power_profile_monitor,
            'notify::power-saver-enabled',
            () => this._update_power_saver()
        );

        this._connect_settings();
        this._paused = this._is_paused();

        if (!Main.layoutManager._startingUp) {
            this._update_enabled();
        } else {
            // wait for the shell to be entirely loaded before touching the panels
            this._startup_complete_id = this._connection.connect(
                Main.layoutManager,
                'startup-complete',
                () => {
                    this._connection.disconnect(Main.layoutManager, this._startup_complete_id);
                    this._startup_complete_id = 0;
                    this._update_enabled();
                }
            );
        }
    }

    disable() {
        if (!this._enabled)
            return;
        this._enabled = false;

        this._log("disabling panel blur...");

        if (this._panel_blur?.enabled)
            this._panel_blur.disable();
        this._panel_blur = null;
        this._power_profile_monitor = null;

        this._effects_manager.destroy_all();
        this._effects_manager = null;
        this._pipelines_manager.destroy();
        this._pipelines_manager = null;
        clear_snippets();

        this._settings.disconnect_all_settings();

        this._panel_connection.disconnect_all();
        this._connection.disconnect_all();
        this._panel_connection = null;
        this._connection = null;
        disable_system_style();

        delete global.blur_my_dynamic_panel;
        this._settings = null;
    }

    /// Called by Dynamic Panel every time it restyles the main panel. With `full` set to false, only
    /// the corner radius changed (animation frame).
    refresh(full = true) {
        if (this._panel_blur?.enabled)
            this._panel_blur.refresh_dp(full);
    }

    /// Recreates the blur, for changes that need new backgrounds.
    reset() {
        if (this._panel_blur?.enabled)
            this._panel_blur.reset();
    }

    get _ready() {
        return this._enabled && !this._startup_complete_id;
    }

    _is_paused() {
        return this._settings.POWER_SAVER && this._power_profile_monitor.power_saver_enabled;
    }

    _update_enabled() {
        if (!this._ready)
            return;

        const should_enable = this._settings.panel.BLUR && !this._paused;
        if (should_enable && !this._panel_blur.enabled)
            this._panel_blur.enable();
        else if (!should_enable && this._panel_blur.enabled)
            this._panel_blur.disable();
    }

    _update_power_saver() {
        const paused = this._is_paused();
        if (this._paused === paused)
            return;

        this._paused = paused;
        this._log(paused ? "entering power saver mode..." : "leaving power saver mode...");
        this._update_enabled();
    }

    /// Adapted from the panel part of Blur my Shell's `components/settings_connections.js`.
    _connect_settings() {
        const settings = this._settings;
        const panel = this._panel_blur;
        const when_enabled = callback => () => {
            if (panel.enabled)
                callback();
        };

        settings.panel.BLUR_changed(() => this._update_enabled());
        settings.POWER_SAVER_changed(() => this._update_power_saver());

        ['STATIC_BLUR', 'OVERRIDE_BACKGROUND',
            'OVERRIDE_BACKGROUND_DYNAMICALLY',
            'OVERRIDE_BACKGROUND_DYNAMICALLY_MODE'].forEach(property =>
            settings.panel[`${property}_changed`](when_enabled(() => panel.reset()))
        );
        settings.panel.PIPELINE_changed(when_enabled(() => panel.update_pipeline()));
        ['CORNER_RADIUS', 'ROUNDED_CORNERS'].forEach(property =>
            settings.panel[`${property}_changed`](when_enabled(() => panel.update_corner_radius()))
        );
        ['UNBLUR_IN_OVERVIEW', 'MATCH_THEME_IN_OVERVIEW', 'STYLE_PANEL'].forEach(property =>
            settings.panel[`${property}_changed`](when_enabled(
                () => panel.connect_to_windows_and_overview()
            ))
        );
        settings.panel.FORCE_LIGHT_TEXT_changed(when_enabled(() => panel.update_light_text()));
        ['GRADIENT_PANEL', 'GRADIENT_PANEL_MODE'].forEach(property =>
            settings.panel[`${property}_changed`](when_enabled(() => panel.update_visibility()))
        );

        settings.hidetopbar.COMPATIBILITY_changed(when_enabled(
            () => panel.connect_to_windows_and_overview()
        ));
        settings.dash_to_panel.BLUR_ORIGINAL_PANEL_changed(when_enabled(() => panel.reset()));

        // Dynamic Panel integration
        ['BLUR_IN_FLOATING', 'BLUR_IN_SOLID', 'USE_PANEL_DETECTION', 'BACKGROUND_PRIORITY']
            .forEach(property => settings[`${property}_changed`](() => this.refresh()));
        settings.MATCH_PANEL_SHAPE_changed(when_enabled(() => panel.update_corner_radius()));
        settings.MATCH_PANEL_SHAPE_changed(() => this.refresh());
    }

    _log(str) {
        if (this._settings?.DEBUG)
            console.log(`[Blur My Dynamic Panel > integration] ${str}`);
    }
}
