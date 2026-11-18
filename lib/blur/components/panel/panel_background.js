// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Pipeline } from '../../pipelines/pipeline.js';
import { DynamicPipeline } from '../../render/dynamic_surface.js';
import { RoundedPipeline } from '../../render/rounded_pipeline.js';

/// Creates the blur behind a panel, inserted at the bottom of its panel box.
///
/// `shape` gives the corner radius and the rounded corners of this background. The panel blur of
/// Blur my Shell reads them from its settings, Dynamic Panel can make them follow the shape of the
/// floating panel (or of one of its areas) instead.
export function create_panel_background(panel_box, monitor, settings, effects_manager, shape = null) {
    const get_radius = shape?.get_radius ?? (() => settings.panel.CORNER_RADIUS);
    const get_corners = shape?.get_corners ?? (() => settings.panel.ROUNDED_CORNERS);

    const background_group = new Meta.BackgroundGroup(
        { name: 'dp-blur-panel-backgroundgroup', width: 0, height: 0 }
    );

    let background, bg_manager, pipeline;
    let rounded_pipeline = null;
    const static_blur = settings.panel.STATIC_BLUR;

    if (static_blur) {
        const bg_manager_list = [];
        pipeline = new Pipeline(
            effects_manager,
            global.blur_my_dynamic_panel._pipelines_manager,
            settings.panel.PIPELINE
        );
        background = pipeline.create_background_with_effects(
            monitor.index, bg_manager_list,
            background_group, 'dp-blur-panel-blurred-widget'
        );
        bg_manager = bg_manager_list[0];
        rounded_pipeline = new RoundedPipeline(effects_manager, get_radius, get_corners);
        rounded_pipeline.bind(pipeline, background);
    } else {
        pipeline = new DynamicPipeline(
            effects_manager,
            global.blur_my_dynamic_panel._pipelines_manager,
            settings.panel.PIPELINE,
            {
                corner_radius: get_radius(),
                get_corners,
            }
        );
        [background, bg_manager] = pipeline.create_background_with_effect(
            background_group, 'dp-blur-panel-blurred-widget'
        );
    }

    panel_box.insert_child_at_index(background_group, 0);
    return {
        background, background_group, bg_manager, pipeline, rounded_pipeline, static_blur,
        get_radius,
    };
}

/// Re-reads the corner radius of a background created by `create_panel_background`.
export function update_background_radius(entry) {
    if (entry.rounded_pipeline)
        entry.rounded_pipeline.update();
    else
        entry.pipeline.set_corner_radius(entry.get_radius());
}

/// Destroys a background created by `create_panel_background`.
export function destroy_panel_background(entry) {
    entry.rounded_pipeline?.destroy();
    entry.pipeline.destroy();
    entry.bg_manager.destroy();
    entry.background_group.destroy();
}

/// The geometry of the panel, in the coordinates of its panel box.
export function get_panel_geometry(actors) {
    const { panel, panel_box, wrapper } = actors.widgets;

    // complete pending layout before reading geometry
    panel_box.get_allocation_box();
    panel.get_allocation_box();
    const [width, height] = panel.get_size();

    let x, y;
    if (actors.is_dtp_panel) {
        const [w_x, w_y] = wrapper.get_position();
        const [pan_x, pan_y] = panel.get_position();
        x = w_x + pan_x;
        y = w_y + pan_y;
    } else {
        [x, y] = panel.get_position();
    }

    return { x, y, width, height };
}

/// The geometry of a child of the panel (one of the areas of Dynamic Panel), in the coordinates of
/// the panel box.
export function get_child_geometry(actors, child) {
    const panel_geometry = get_panel_geometry(actors);
    child.get_allocation_box();
    const [c_x, c_y] = child.get_position();
    const [width, height] = child.get_size();
    return { x: panel_geometry.x + c_x, y: panel_geometry.y + c_y, width, height };
}

/// Moves a blur background to the given geometry, returning false if the panel isn't allocated yet.
///
/// Dynamic Panel moves the whole panel box with its translation (floating and hidden panels), so it
/// is taken into account for the static blur, which shows the monitor background clipped to the
/// panel.
export function place_background(actors, background, geometry) {
    const { panel, panel_box } = actors.widgets;

    const [width, height] = panel_box.get_size();
    if (!width || !height || !geometry.width || !geometry.height)
        return false;

    if (actors.static_blur) {
        const monitor = Main.layoutManager.findMonitorForActor(panel);
        if (!monitor)
            return false;

        const [p_x, p_y] = panel_box.get_position();
        const [p_p_x, p_p_y] = panel_box.get_parent().get_position();

        const x = p_x + panel_box.translation_x + p_p_x - monitor.x + geometry.x;
        const y = p_y + panel_box.translation_y + p_p_y - monitor.y + geometry.y;
        background.set_clip(
            Math.floor(x), Math.floor(y), Math.ceil(geometry.width), Math.ceil(geometry.height)
        );
        background.x = geometry.x - x;
        background.y = geometry.y - y;
    } else {
        background.x = geometry.x;
        background.y = geometry.y;
        background.width = geometry.width;
        background.height = geometry.height;
    }

    return true;
}

/// Moves the blur under the panel, returning false if the panel isn't allocated yet.
export function place_panel_background(actors) {
    return place_background(actors, actors.widgets.background, get_panel_geometry(actors));
}
