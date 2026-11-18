// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


/// The components that pick a pipeline, with the names the preferences show for them.
function get_pipeline_components(preferences) {
    return [
        ['panel', _('Panel')],
    ].map(([key, name]) => ({ component: preferences[key], name }));
}

export function get_pipeline_users(preferences, pipeline_id) {
    return get_pipeline_components(preferences)
        .filter(({ component }) => component.PIPELINE === pipeline_id);
}
