// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import { Type } from './settings.js';

// The preferences keys of the panel blur, stored in the `blur` child schema of Blur My Dynamic Panel
// (`org.gnome.shell.extensions.blur-my-dynamic-panel.blur`). Adapted from Blur my Shell, keeping only the
// keys related to the top panel, plus the keys tying the blur to the Dynamic Panel modes.
export const KEYS = [
    {
        component: "general", schemas: [
            { type: Type.PIPELINES, name: "pipelines" },
            { type: Type.B, name: "debug" },
            { type: Type.B, name: "power-saver" },
            // Dynamic Panel integration
            { type: Type.B, name: "blur-in-floating" },
            { type: Type.B, name: "blur-in-solid" },
            { type: Type.B, name: "match-panel-shape" },
            { type: Type.B, name: "use-panel-detection" },
            { type: Type.I, name: "background-priority" },
        ]
    },
    {
        component: "panel", schemas: [
            { type: Type.B, name: "blur" },
            { type: Type.B, name: "static-blur" },
            { type: Type.S, name: "pipeline" },
            { type: Type.I, name: "corner-radius" },
            { type: Type.I, name: "rounded-corners" },
            { type: Type.B, name: "unblur-in-overview" },
            { type: Type.B, name: "force-light-text" },
            { type: Type.B, name: "match-theme-in-overview" },
            { type: Type.B, name: "override-background" },
            { type: Type.I, name: "style-panel" },
            { type: Type.B, name: "override-background-dynamically" },
            { type: Type.I, name: "override-background-dynamically-mode" },
            { type: Type.B, name: "gradient-panel" },
            { type: Type.I, name: "gradient-panel-mode" },
        ]
    },
    {
        component: "hidetopbar", schemas: [
            { type: Type.B, name: "compatibility" },
        ]
    },
    {
        component: "dash-to-panel", schemas: [
            { type: Type.B, name: "blur-original-panel" },
        ]
    },
];
