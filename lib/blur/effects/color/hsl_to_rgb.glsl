// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

uniform sampler2D tex;
uniform float opacity_factor;

vec3 hsl_to_rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main(void) {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec4 hsla = bms_texture2D(tex, uv);
    if (hsla.a <= 0.0) {
        cogl_color_out = hsla;
        return;
    }

    vec4 rgba = vec4(hsl_to_rgb(hsla.rgb / hsla.a) * hsla.a, hsla.a);
    cogl_color_out = mix(hsla, rgba, opacity_factor);
}
