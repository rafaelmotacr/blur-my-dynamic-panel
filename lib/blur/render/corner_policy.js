// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

export function getRoundedCorners(selection) {
    return {
        corners_top: selection === 0 || selection === 1,
        corners_bottom: selection === 0 || selection === 2,
    };
}
