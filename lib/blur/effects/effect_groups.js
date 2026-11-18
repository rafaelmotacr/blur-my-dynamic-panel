// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

export function get_effects_groups(_) {
    return {
        blur: {
            name: _('Blur'),
            contains: [
                'dual_kawase_blur',
                'refraction',
            ],
        },
        color: {
            name: _('Color'),
            contains: [
                'color',
                'luminosity',
            ],
        },
        texture: {
            name: _('Texture'),
            contains: [
                'noise',
                'pixelize',
                'wave',
                'derivative',
            ],
        },
        advanced: {
            name: _('Advanced'),
            description: _('Building blocks that are mostly useful combined with other effects.'),
            contains: [
                'downscale',
                'upscale',
                'rgb_to_hsl',
                'hsl_to_rgb',
            ],
        },
    };
}
