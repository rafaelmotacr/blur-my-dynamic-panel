// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import Gio from 'gi://Gio';


/// Rows keep their sensitivity bound to the switches they depend on in the templates, instead of the
/// key writability that Gio would otherwise sync onto them.
export function bind_settings(component_preferences, bindings) {
    for (const [key, widget, property] of bindings) {
        component_preferences.settings.bind(
            key, widget, property,
            Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.NO_SENSITIVITY
        );
    }
}
