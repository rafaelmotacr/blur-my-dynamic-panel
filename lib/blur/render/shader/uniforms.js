// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

const INTEGRAL_UNIFORMS = new Set([
    'corners_bottom',
    'corners_top',
    'divider',
    'downsampling_mode',
    'factor',
    'mode',
    'operation',
    'straight_corners',
    'texture_repeat',
    'octaves',
    'vapor_octaves',
]);

export function set_uniform(effect, name, value) {
    if (!effect._bms_uniforms)
        effect._bms_uniforms = new Map();

    if (effect._bms_uniforms.get(name) === value)
        return;
    effect._bms_uniforms.set(name, value);
    effect._bms_uniforms_dirty = true;
    effect.queue_repaint();
}

export function mark_dirty(effect) {
    if (effect._bms_uniforms)
        effect._bms_uniforms_dirty = true;
}

/// Uploads the uniforms changed since the last paint, must be called while painting.
export function upload_uniforms(effect) {
    if (!effect._bms_uniforms_dirty)
        return;

    for (const [name, value] of effect._bms_uniforms)
        effect.set_surface_uniform(name, value, INTEGRAL_UNIFORMS.has(name));

    effect._bms_uniforms_dirty = false;
}
