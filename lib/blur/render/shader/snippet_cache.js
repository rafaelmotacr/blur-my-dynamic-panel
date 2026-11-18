// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

const snippets = new Map();

export function get_snippet(key, create) {
    let snippet = snippets.get(key);
    if (!snippet) {
        snippet = create();
        snippets.set(key, snippet);
    }
    return snippet;
}

export function clear_snippets() {
    snippets.clear();
}
