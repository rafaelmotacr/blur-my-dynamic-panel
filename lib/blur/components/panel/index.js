// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Adapted from Blur my Shell, Copyright (c) aunetx and contributors (GPL-3.0-or-later).
// Modifications Copyright (c) 2026 Rafael Mota.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Connections } from '../../conveniences/connections.js';
import { connect_system_style_changes } from '../../conveniences/style.js';
import { PanelDiscovery } from './panel_discovery.js';
import {
    create_panel_background,
    destroy_panel_background,
    get_child_geometry,
    place_background,
    place_panel_background,
    update_background_radius,
} from './panel_background.js';
import { get_proximity_windows, has_window_near_panel } from './window_proximity.js';
import {
    TRANSPARENT_PANEL_STYLE,
    overview_aware_style,
    panel_style,
    set_panel_style_class,
    unblurred_style,
    update_light_text,
    update_panel_border_radius,
} from './panel_style.js';

export const PanelBlur = class PanelBlur {
    /// `dp` is the bridge to Dynamic Panel (see `lib/blur_bridge.js`). It makes the blur of the main
    /// panel follow the modes of Dynamic Panel: floating, solid, hidden, area background, radius...
    constructor(connections, settings, effects_manager, dp = null) {
        this.dp = dp;
        this.connections = connections;
        this.window_connections = new Connections();
        this.window_signal_ids = new Map();
        this.settings = settings;
        this.effects_manager = effects_manager;
        this.actors_list = [];
        this.queued_updates = new Map();
        this.discovery = new PanelDiscovery(connections, settings, panel => this.maybe_blur_panel(panel));
        this.visibility_update_id = 0;
        this.panel_radius_update_id = 0;
        this.enabled = false;
        this._in_overview = false;
    }

    enable() {
        if (this.enabled) {
            this._log("blur already enabled");
            return;
        }

        this._log("blurring top panel");
        this.enabled = true;
        this._dirty = false;
        this.watched_panels = new WeakSet();
        this._in_overview = Main.overview.visible;
        this.discovery.enable();

        // Hide the panel blur first to avoid the panel background from display on login
        this.panel_hide_blur_startup();

        this.connect_to_windows_and_overview();

        this.connections.connect(Main.layoutManager, 'monitors-changed', () => {
            this._dirty = true;
            // static backgrounds must not query a monitor that has just disappeared
            [...this.actors_list]
                .filter(actors => actors.static_blur)
                .forEach(actors => this.destroy_blur(actors));
        });

        // the panels only have their new geometry once the work areas are updated
        this.connections.connect(global.display, 'workareas-changed', _ => {
            if (this._dirty) {
                this.reset();
                this._dirty = false;
            } else {
                this.discovery.blur_extra_panel_boxes();
            }
        });

        connect_system_style_changes(this.connections, () => {
            this.update_visibility();
        });
    }

    reset() {
        if (!this.enabled) {
            this._log("reset called but blur is not enabled");
            return;
        }

        this._log("resetting...");

        this.disable();
        this.enable();
    }

    /// Blur a panel only if it is not already blurred (contained in the list). Other extensions call
    /// this too, like Multi Monitor Bar, even while panel blur is off.
    maybe_blur_panel(panel) {
        if (!this.enabled || this._dirty)
            return;

        if (!this.watched_panels.has(panel)) {
            this.watched_panels.add(panel);
            this.connections.connect(panel, 'parent-set', () => {
                const actors = this.actors_list.find(actors => actors.widgets.panel === panel);
                if (actors)
                    this.destroy_blur(actors);
                if (panel.get_stage()) {
                    this.maybe_blur_panel(panel);
                }
            });
        }
        if (panel.get_stage() && !this.actors_list.some(actors => actors.widgets.panel === panel))
            this.blur_panel(panel);
    }

    /// Blur a panel
    blur_panel(panel) {
        let wrapper = null;
        let panel_box = panel.get_parent();
        let is_dtp_panel = false;
        if (!panel_box.name) {
            is_dtp_panel = true;
            wrapper = panel_box;
            panel_box = panel_box.get_parent();
        }

        let monitor = Main.layoutManager.findMonitorForActor(panel);
        if (!monitor)
            return;

        const dp_managed = !is_dtp_panel && !!this.dp?.is_main(panel);
        // the shape is read lazily, so that it always reflects the current state of Dynamic Panel
        const shape = dp_managed ? {
            get_radius: () => this.dp.match_shape()
                ? this.dp.panel_radius()
                : this.settings.panel.CORNER_RADIUS,
            get_corners: () => this.dp.match_shape() ? 0 : this.settings.panel.ROUNDED_CORNERS,
        } : null;

        const { background, background_group, bg_manager, pipeline, rounded_pipeline, static_blur, get_radius } =
            create_panel_background(panel_box, monitor, this.settings, this.effects_manager, shape);

        const actors = {
            widgets: {
                panel,
                wrapper,
                panel_box,
                background,
                background_group,
            },
            radius_style: null,
            last_target_class: null,
            static_blur,
            monitor,
            bg_manager,
            pipeline,
            rounded_pipeline,
            signal_records: [],
            is_dtp_panel,
            should_override: true,
            get_radius,
            // Dynamic Panel: the main panel, its area backgrounds, and whether Blur my Shell's own
            // logic wants the blur to be visible (before the Dynamic Panel modes are applied)
            dp_managed,
            areas: [],
            bms_visible: true,
        };
        this.actors_list.push(actors);

        this.connect_actor_signals(actors,
            panel,
            ['notify::allocation', 'notify::size', 'notify::position'],
            _ => this.queue_update_size(actors)
        );

        if (wrapper) {
            this.connect_actor_signals(actors,
                wrapper,
                ['notify::allocation', 'notify::size', 'notify::position'],
                _ => this.queue_update_size(actors)
            );
        }
        this.connect_actor_signals(actors,
            panel_box,
            ['notify::size', 'notify::position'],
            _ => this.queue_update_size(actors)
        );
        this.connect_actor_signals(actors,
            panel_box.get_parent(),
            'notify::position',
            _ => this.queue_update_size(actors)
        );
        // Dynamic Panel floats and hides the panel by translating its panel box
        this.connect_actor_signals(actors,
            panel_box,
            ['notify::translation-x', 'notify::translation-y'],
            _ => this.queue_update_size(actors)
        );
        if (dp_managed) {
            this.dp.area_boxes().forEach(box => {
                this.connect_actor_signals(actors,
                    box,
                    ['notify::allocation', 'notify::size', 'notify::position'],
                    _ => this.queue_update_size(actors)
                );
                this.connect_actor_signals(actors,
                    box,
                    'notify::visible',
                    _ => this.apply_background_visibility(actors)
                );
            });
        }

        // the background group is destroyed before the panel when their
        // shared parent goes away (e.g. Dash to Panel being disabled)
        this.connect_actor_signals(actors,
            panel,
            'destroy',
            _ => this.destroy_blur(actors)
        );
        this.connect_actor_signals(actors,
            background_group,
            'destroy',
            _ => this.destroy_blur(actors)
        );
        // discovery can run in BEFORE_REDRAW, deferring geometry again would miss this frame
        this.update_size(actors);
        this.update_visibility();
        this.apply_background_visibility(actors);
    }

    connect_actor_signals(actors, actor, signals, handler) {
        const ids = this.connections.connect(actor, signals, handler);
        actors.signal_records.push({
            actor,
            ids: Array.isArray(ids) ? ids : [ids],
        });
    }

    queue_update_size(actors) {
        if (this.queued_updates.has(actors))
            return;

        const source_id = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.queued_updates.delete(actors);
            this.update_size(actors);
            return GLib.SOURCE_REMOVE;
        });
        this.queued_updates.set(actors, source_id);
    }

    update_size(actors) {
        if (!place_panel_background(actors))
            return;

        actors.areas.forEach(area => {
            const geometry = get_child_geometry(actors, area.box);
            if (geometry.width > 0 && geometry.height > 0)
                place_background(actors, area.background, geometry);
        });

        const current_monitor = Main.layoutManager.findMonitorForActor(actors.widgets.panel);
        if (current_monitor)
            actors.monitor = current_monitor;

        this.set_should_override_panel(actors, actors.should_override);
    }

    /// Hides the blur while in the overview, if the preferences say so.
    connect_to_overview() {
        this._in_overview = Main.overview.visible;
        if (!this.settings.panel.UNBLUR_IN_OVERVIEW) {
            if (this.settings.panel.MATCH_THEME_IN_OVERVIEW) {
                this.window_connections.connect(Main.overview, ['showing', 'shown'], () => {
                    this._in_overview = true;
                    this.update_light_text();
                });
                this.window_connections.connect(Main.overview, 'hidden', () => {
                    this._in_overview = false;
                    this.update_light_text();
                });
            }
            return;
        }

        const entered = () => {
            this._in_overview = true;
            this.hide();
        };
        const left = () => {
            this._in_overview = false;
            this.panel_hide_blur_dynamically();
            this.update_visibility();
            this.queue_panel_border_radius_update();
        };

        if (this.settings.hidetopbar.COMPATIBILITY) {
            const app_display = Main.overview._overview.controls._appDisplay;
            this._in_overview = app_display.visible;
            this.window_connections.connect(app_display, 'show', entered);
            this.window_connections.connect(app_display, 'hide', left);
            this.window_connections.connect(Main.overview, 'hidden', left);
        } else {
            this.window_connections.connect(Main.overview, ['showing', 'shown'], entered);
            this.window_connections.connect(Main.overview, 'hidden', left);
        }
    }

    /// Hide Top Bar shows the panel above the overview, so only the app grid unblurs it
    is_unblurred_by_overview() {
        if (!this.settings.panel.UNBLUR_IN_OVERVIEW)
            return false;
        if (this.settings.hidetopbar.COMPATIBILITY)
            return this._in_overview;
        return this._in_overview || Main.overview.visible
            || this.discovery.main_panel?.has_style_pseudo_class('overview');
    }

    /// Connect to windows disable transparency when a window is too close
    connect_to_windows() {
        if (
            this.settings.panel.OVERRIDE_BACKGROUND_DYNAMICALLY
        ) {
            this.window_connections.connect(Main.overview, ['showing', 'hiding'],
                _ => this.update_visibility()
            );

            this.window_connections.connect(Main.sessionMode, 'updated',
                _ => this.update_visibility()
            );

            for (const meta_window_actor of global.get_window_actors()) {
                this.on_window_actor_added(
                    meta_window_actor.get_parent(), meta_window_actor
                );
            }

            this.window_connections.connect(global.window_group, 'child-added',
                this.on_window_actor_added.bind(this)
            );
            this.window_connections.connect(global.window_group, 'child-removed',
                this.on_window_actor_removed.bind(this)
            );

            this.window_connections.connect(global.window_manager, 'switch-workspace',
                _ => this.update_visibility()
            );

            this.update_visibility();
        } else {
            this.actors_list.forEach(
                actors => this.set_should_override_panel(actors, true)
            );
        }
    }

    /// An helper to connect to both the windows and overview signals.
    /// This is the only function that should be directly called, to prevent
    /// inconsistencies with signals not being disconnected.
    connect_to_windows_and_overview() {
        this.disconnect_from_windows_and_overview();
        this.connect_to_overview();
        this.connect_to_windows();

        if (this.is_unblurred_by_overview())
            this.hide();
        else if (!this.settings.panel.OVERRIDE_BACKGROUND_DYNAMICALLY)
            this.show();
    }

    /// Disconnect all the connections created by connect_to_windows
    disconnect_from_windows_and_overview() {
        this.window_connections.disconnect_all();
        this.window_signal_ids = new Map();
    }

    /// Callback when a new window is added
    on_window_actor_added(container, meta_window_actor) {
        if (this.window_signal_ids.has(meta_window_actor))
            return;

        this.window_signal_ids.set(meta_window_actor, true);
        this.window_connections.connect(
            meta_window_actor,
            ['notify::allocation', 'notify::visible'],
            () => this.queue_visibility_update()
        );
        this.window_connections.connect(meta_window_actor, 'destroy', () => {
            this.window_signal_ids.delete(meta_window_actor);
            this.queue_visibility_update();
        });
        this.queue_visibility_update();
    }

    /// Callback when a window is removed
    on_window_actor_removed(container, meta_window_actor) {
        if (!this.window_signal_ids.has(meta_window_actor))
            return;

        this.window_connections.disconnect_all_for(meta_window_actor);
        this.window_signal_ids.delete(meta_window_actor);
        this.queue_visibility_update();
    }

    queue_visibility_update() {
        if (this.visibility_update_id)
            return;

        this.visibility_update_id = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this.visibility_update_id = 0;
                this.update_visibility();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    clear_visibility_update() {
        if (!this.visibility_update_id)
            return;

        global.compositor.get_laters().remove(this.visibility_update_id);
        this.visibility_update_id = 0;
    }

    queue_panel_border_radius_update() {
        if (this.panel_radius_update_id)
            return;

        this.panel_radius_update_id = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW,
            () => {
                this.panel_radius_update_id = 0;
                this.actors_list.forEach(actors =>
                    update_panel_border_radius(actors, actors.last_target_class, this.settings)
                );
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    clear_panel_border_radius_update() {
        if (!this.panel_radius_update_id)
            return;

        global.compositor.get_laters().remove(this.panel_radius_update_id);
        this.panel_radius_update_id = 0;
    }

    /// Update the visibility of the blur effect
    update_visibility() {
        if (this.is_unblurred_by_overview()) {
            this.actors_list.forEach(actors => {
                this.set_background_visible(actors, false);
                this.set_should_override_panel(actors, true);
            });
            return;
        }

        if (!Main.sessionMode.hasWindows) {
            this.actors_list.forEach(
                actors => this.set_should_override_panel(actors, true)
            );
            return;
        }

        if (!Main.layoutManager.primaryMonitor)
            return;

        const windows = get_proximity_windows();
        // Dash to Panel has its own setting for this
        this.actors_list
            .filter(actors => !actors.is_dtp_panel)
            .forEach(actors =>
                this.set_should_override_panel(actors, !this.is_window_near(actors, windows))
            );

        this.actors_list
            .filter(actors => actors.is_dtp_panel)
            .forEach(actors => {
                this.set_should_override_panel(
                    actors, actors.should_override
                );
            });
    }

    /// Choose wether or not the panel background should be overriden, in
    /// respect to its argument and the `override-background` setting.
    set_should_override_panel(actors, should_override) {
        actors.should_override = should_override;

        const panel = this.settings.panel;
        if (!panel.OVERRIDE_BACKGROUND)
            this.style_panel(actors, null);
        else if (!panel.OVERRIDE_BACKGROUND_DYNAMICALLY)
            this.style_panel(actors, overview_aware_style(this.settings, this.in_overview()));
        else if (panel.OVERRIDE_BACKGROUND_DYNAMICALLY_MODE === 0 && should_override)
            this.proximity_hide(actors);
        else if (panel.OVERRIDE_BACKGROUND_DYNAMICALLY_MODE === 0)
            this.proximity_show(actors);
        else if (should_override)
            this.style_panel(actors, overview_aware_style(this.settings, this.in_overview()));
        else
            this.style_panel(actors, null);

        this.update_light_text();
    }

    panel_hide_blur_dynamically() {
        if (this.settings.panel.OVERRIDE_BACKGROUND
            && this.settings.panel.OVERRIDE_BACKGROUND_DYNAMICALLY
            && this.settings.panel.OVERRIDE_BACKGROUND_DYNAMICALLY_MODE === 0)
            this.hide();
        else
            this.show();
    }

    proximity_hide(actors) {
        this.style_panel(actors, unblurred_style(this.settings, this.in_overview()));
        this.set_background_visible(actors, false);
    }

    proximity_show(actors) {
        if (this.settings.panel.UNBLUR_IN_OVERVIEW && this.in_overview()) {
            this.style_panel(actors, TRANSPARENT_PANEL_STYLE);
            this.set_background_visible(actors, false);
            return;
        }

        this.style_panel(actors, panel_style(this.settings));
        this.set_background_visible(actors, true);
    }

    in_overview() {
        return this._in_overview || Main.overview.visible;
    }

    update_light_text() {
        update_light_text(
            this.actors_list,
            this.settings.panel.FORCE_LIGHT_TEXT,
            this.settings.panel.MATCH_THEME_IN_OVERVIEW,
            this.in_overview()
        );
    }

    panel_hide_blur_startup() {
        if (this.is_unblurred_by_overview())
            this.hide();
    }

    update_pipeline() {
        this.actors_list.forEach(actors => {
            actors.pipeline.change_pipeline_to(this.settings.panel.PIPELINE);
            actors.rounded_pipeline?.update();
            actors.areas.forEach(area => {
                area.pipeline.change_pipeline_to(this.settings.panel.PIPELINE);
                area.rounded_pipeline?.update();
            });
        });
    }

    update_corner_radius() {
        this.actors_list.forEach(actors => {
            this.update_backgrounds_radius(actors);
            this.set_should_override_panel(actors, actors.should_override);
        });
    }

    show() {
        this.actors_list.forEach(actors => {
            this.set_background_visible(actors, true);
            this.set_should_override_panel(actors, actors.should_override);
        });
    }

    hide() {
        this.actors_list.forEach(actors => {
            this.set_background_visible(actors, false);
            if (this.settings.panel.OVERRIDE_BACKGROUND) {
                const target_style = overview_aware_style(this.settings, this.in_overview());
                this.style_panel(actors, target_style);
            }
        });
        this.update_light_text();
    }

    // IMPORTANT: do never call this in a mutable `this.actors_list.forEach`
    destroy_blur(actors) {
        const size_update_id = this.queued_updates.get(actors);
        if (size_update_id) {
            global.compositor.get_laters().remove(size_update_id);
            this.queued_updates.delete(actors);
        }

        actors.signal_records.forEach(({ actor, ids }) =>
            ids.forEach(id => this.connections.disconnect(actor, id))
        );
        actors.signal_records = [];

        actors.widgets.panel_box.remove_style_class_name("dp-blur-panel-light-text");
        actors.widgets.panel_box.remove_style_class_name("dp-blur-panel-overview-light-theme");
        this.style_panel(actors, null);

        this.destroy_areas(actors);
        actors.rounded_pipeline?.destroy();
        actors.pipeline.destroy();
        actors.bg_manager.destroy();
        actors.widgets.background_group.destroy();

        this.actors_list.splice(this.actors_list.indexOf(actors), 1);
    }

    /// Applies a style class to a panel. On the main panel, the colors of Dynamic Panel win over the
    /// background style of the blur when Dynamic Panel paints the panel, unless the user chose to give
    /// the priority to the blur style.
    style_panel(actors, target_class) {
        if (actors.dp_managed && this.dp?.colors_win())
            target_class = null;
        set_panel_style_class(actors, target_class, this.settings);
        if (actors.dp_managed)
            this.dp?.panel_class_changed(target_class);
    }

    /// Whether a window is near the panel. For the main panel this can follow the detection of Dynamic
    /// Panel (a floating panel has no window near it), so both extensions always agree.
    is_window_near(actors, windows) {
        if (actors.dp_managed && this.dp?.use_detection())
            return this.dp.window_near();
        return has_window_near_panel(actors, windows);
    }

    /// Records whether Blur my Shell's own logic wants the blur shown, then applies it.
    set_background_visible(actors, visible) {
        actors.bms_visible = visible;
        this.apply_background_visibility(actors);
    }

    /// Shows the blur only where it should be: on the main panel, it also depends on the current
    /// mode of Dynamic Panel, and in the Area background mode the blur goes behind each area instead
    /// of behind the whole panel.
    apply_background_visibility(actors) {
        let allowed = actors.bms_visible;
        let use_areas = false;

        if (actors.dp_managed && this.dp) {
            allowed = allowed && this.dp.blur_allowed();
            if (this.dp.area_setting())
                this.ensure_areas(actors);
            else
                this.destroy_areas(actors);
            use_areas = this.dp.use_area_shape();
        }

        actors.widgets.background.visible = allowed && !use_areas;
        actors.areas.forEach(area => {
            area.background.visible = allowed && use_areas && area.box.visible;
        });
    }

    /// Creates a blur background for each area of the main panel (Area background mode).
    ensure_areas(actors) {
        if (actors.areas.length > 0 || !actors.monitor)
            return;

        actors.areas = this.dp.area_boxes().map(box => {
            const area = create_panel_background(
                actors.widgets.panel_box, actors.monitor, this.settings, this.effects_manager,
                {
                    get_radius: () => this.dp.match_shape()
                        ? this.dp.area_radius()
                        : this.settings.panel.CORNER_RADIUS,
                    get_corners: () => this.dp.match_shape()
                        ? 0
                        : this.settings.panel.ROUNDED_CORNERS,
                }
            );
            area.box = box;
            area.background.visible = false;
            return area;
        });
        // the static blur must not be above the main background, nor vice versa: both are at the
        // bottom of the panel box, which is all that matters for the panel itself
        this.update_size(actors);
    }

    destroy_areas(actors) {
        actors.areas.forEach(area => destroy_panel_background(area));
        actors.areas = [];
    }

    update_backgrounds_radius(actors) {
        update_background_radius(actors);
        actors.areas.forEach(area => update_background_radius(area));
    }

    /// Called by Dynamic Panel each time it changes the style of the main panel (mode, radius
    /// animation, colors, peeking...).
    ///
    /// With `full` set to false (radius animation frames), only the corner radius is updated.
    refresh_dp(full = true) {
        if (!this.enabled || this._dirty)
            return;

        if (full)
            this.update_visibility();
        this.actors_list.forEach(actors => {
            if (!actors.dp_managed)
                return;
            if (full)
                this.apply_background_visibility(actors);
            this.update_backgrounds_radius(actors);
        });
    }

    disable() {
        this._log("removing blur from top panel");

        this.disconnect_from_windows_and_overview();

        update_light_text(this.actors_list, false);

        [...this.actors_list].forEach(actors => this.destroy_blur(actors));

        this.discovery.disable();
        this.clear_visibility_update();
        this.clear_panel_border_radius_update();

        this._dirty = true;

        this.connections.disconnect_all();
        this.watched_panels = null;

        this.enabled = false;
    }

    _log(str) {
        if (this.settings.DEBUG)
            console.log(`[Blur My Dynamic Panel > panel]        ${str}`);
    }
};
