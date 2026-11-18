// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { bind_settings } from '../../bind_settings.js';

import '../../widgets/blur_mode_row.js';


export const Panel = GObject.registerClass({
    GTypeName: 'DpBlurPanel',
    Template: GLib.uri_resolve_relative(import.meta.url, '../../../ui/pages/shell/panel.ui', GLib.UriFlags.NONE),
    InternalChildren: [
        'blur',
        'blur_mode_row',
        'pipeline_choose_row',
        'unblur_in_overview',
        'corner_radius',
        'rounded_corners',
        'force_light_text',
        'match_theme_in_overview',
        'override_background',
        'style_panel',
        'override_background_dynamically',
        'override_background_dynamically_mode',
        'gradient_panel',
        'gradient_panel_mode',
        'hidetopbar_compatibility',
        'dtp_blur_original_panel',
        'blur_in_floating',
        'blur_in_solid',
        'match_panel_shape',
        'use_panel_detection',
        'background_priority',
        'corner_radius_row',
        'bms_warning_group',
    ],
}, class Panel extends Adw.PreferencesPage {
    constructor(preferences, pipelines_manager, pipelines_page) {
        super({});

        this.preferences = preferences;

        this._blur_mode_row.initialize(preferences.panel);
        this._pipeline_choose_row.initialize(preferences.panel, pipelines_manager, pipelines_page);

        bind_settings(preferences.panel, [
            ['blur', this._blur, 'active'],
            ['unblur-in-overview', this._unblur_in_overview, 'active'],
            ['corner-radius', this._corner_radius, 'value'],
            ['rounded-corners', this._rounded_corners, 'selected'],
            ['force-light-text', this._force_light_text, 'active'],
            ['match-theme-in-overview', this._match_theme_in_overview, 'active'],
            ['override-background', this._override_background, 'active'],
            ['style-panel', this._style_panel, 'selected'],
            ['override-background-dynamically', this._override_background_dynamically, 'active'],
            ['override-background-dynamically-mode', this._override_background_dynamically_mode, 'selected'],
            ['gradient-panel', this._gradient_panel, 'active'],
            ['gradient-panel-mode', this._gradient_panel_mode, 'selected'],
        ]);
        // Dynamic Panel integration, stored at the root of the blur settings
        bind_settings(preferences, [
            ['blur-in-floating', this._blur_in_floating, 'active'],
            ['blur-in-solid', this._blur_in_solid, 'active'],
            ['match-panel-shape', this._match_panel_shape, 'active'],
            ['use-panel-detection', this._use_panel_detection, 'active'],
            ['background-priority', this._background_priority, 'selected'],
        ]);
        preferences.MATCH_PANEL_SHAPE_changed(() => this.update_shape_rows());
        this.update_shape_rows();

        bind_settings(preferences.hidetopbar, [
            ['compatibility', this._hidetopbar_compatibility, 'active'],
        ]);
        bind_settings(preferences.dash_to_panel, [
            ['blur-original-panel', this._dtp_blur_original_panel, 'active'],
        ]);

        preferences.panel.OVERRIDE_BACKGROUND_DYNAMICALLY_changed(() => this.update_proximity_rows());
        preferences.panel.OVERRIDE_BACKGROUND_DYNAMICALLY_MODE_changed(() => this.update_proximity_rows());
        preferences.panel.GRADIENT_PANEL_changed(() => this.update_proximity_rows());
        this.update_proximity_rows();
    }

    /// Shows a warning when Blur my Shell is enabled and blurs the panel too.
    set_blur_my_shell_warning(visible) {
        this._bms_warning_group.visible = visible;
    }

    update_shape_rows() {
        this._corner_radius_row.subtitle = this.preferences.MATCH_PANEL_SHAPE
            ? _('Only for the other panels, the main panel follows the Floating Mode shape')
            : '';
    }

    update_proximity_rows() {
        const panel = this.preferences.panel;
        const dynamic = panel.OVERRIDE_BACKGROUND_DYNAMICALLY;
        const blur_on_proximity = dynamic && panel.OVERRIDE_BACKGROUND_DYNAMICALLY_MODE === 0;
        this._override_background_dynamically_mode.visible = dynamic;
        this._gradient_panel.visible = blur_on_proximity;
        this._gradient_panel_mode.visible = blur_on_proximity && panel.GRADIENT_PANEL;
    }
});
