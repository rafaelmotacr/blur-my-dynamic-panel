// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

export function getEffectBounds(actor, effect = null) {
    const [x, y, width, height] = actor.has_clip
        ? actor.get_clip() : [0, 0, actor.width, actor.height];
    let bounds = {x, y, width, height};
    if (actor.has_clip && effect && width > 0 && height > 0) {
        // Inner effects must supply the surrounding pixels requested by an
        // outer filter.
        for (const outerEffect of actor.get_effects()) {
            if (outerEffect === effect)
                break;
            if (outerEffect.enabled && typeof outerEffect.get_input_bounds === 'function')
                bounds = outerEffect.get_input_bounds(bounds);
        }
    }
    return bounds;
}
