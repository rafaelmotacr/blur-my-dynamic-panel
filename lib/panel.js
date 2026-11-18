// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Based on Dynamic Panel, Copyright (c) 2024 龍翔翎 (velade), used under the
// M.W.B License (see LICENSES/MWB-Dynamic-Panel.txt).
// Modifications Copyright (c) 2026 Rafael Mota.

import Gio from 'gi://Gio';
import GLib from "gi://GLib";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";

import Colors from './colors.js'
import Func from './func.js'

import * as Main from "resource:///org/gnome/shell/ui/main.js";

export default class Panel {
    constructor(settings, accessibility) {
        this.floatingPanelClass = "blur-my-dynamic-panel";
        this.fgcolor = null;
        this.bgcolor = null;
        this._settings = settings;
        this._accessibility = accessibility;
        this._panelHiddenConnect = null;
        this._squeezeCount = 0;
        this._setBgDelay = null;
        this._updateBgDelay = null;

        // 面板模糊（來自 Blur my Shell）
        // Real panel blur (adapted from Blur my Shell): the blur settings, the current border radius
        // of the panel (followed by the blur), and the callback telling the blur the panel changed.
        this._blurPanelSettings = settings.get_child("blur").get_child("panel");
        this.currentRadius = 0;
        this.onStyleChanged = null;

        // 效能：面板背景改畫在獨立的背景角色上
        // Performance: the background of the whole panel (color, legacy image, border radius) is
        // painted on a childless actor right behind the panel instead of on the panel itself.
        // Restyling the panel invalidates the style of every indicator it contains, which happened
        // on each frame of the radius animation; restyling a childless actor costs next to nothing.
        this._radiusTimeline = null;
        this._appliedRadius = null;
        this._allocGeneration = 0;
        this._backgroundSuppressed = false;
        this._createBackgroundActor();
    }

    _createBackgroundActor() {
        // a zero-sized group in the panel box (a vertical box layout), so it takes no room
        this._bgGroup = new Clutter.Actor({ name: "bmdp-panel-background-group", width: 0, height: 0 });
        this._bgActor = new St.Widget({ name: "bmdp-panel-background", reactive: false });
        this._bgActor.add_constraint(new Clutter.BindConstraint({
            source: Main.panel,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        this._bgGroup.add_child(this._bgActor);
        Main.layoutManager.panelBox.insert_child_at_index(this._bgGroup, 0);
    }

    // 模糊的背景樣式優先時隱藏本擴充功能的背景
    // Hides the background of the extension while the background style of the blur is applied to
    // the panel (when the blur style has the priority).
    setBackgroundSuppressed(suppressed) {
        this._backgroundSuppressed = suppressed;
        if (this._bgActor)
            this._bgActor.visible = !suppressed;
    }

    _clearBackgroundActor() {
        for (const prop of ["background-color", "background-image", "background-size", "background-position"]) {
            Func.updateStyle(this._bgActor, prop, "");
        }
    }

    // 是否使用舊版的靜態壁紙模糊（啟用真正的面板模糊時停用，以免背景圖片蓋住模糊）
    // Whether the legacy wallpaper blur (a static blurred image of the wallpaper) is used. It is
    // turned off while the real panel blur is on, as its opaque image would hide the real blur.
    _legacyBlur() {
        return this._settings.get_boolean("blur") && !this._blurPanelSettings.get_boolean("blur");
    }

    // 通知面板模糊
    _notifyStyleChanged(full = true) {
        if (!this.onStyleChanged) return;
        try {
            this.onStyleChanged(full);
        } catch (error) {
            console.error(`[Blur My Dynamic Panel] panel blur update failed: ${error}`);
        }
    }
    // 更新顏色設定
    updateColorSettings() {
        [this.bgcolor, this.fgcolor] = Colors.getCustomColor(this._settings);

        if (this._settings.get_boolean("auto-background")) {
            const wallpaperSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
            const wallpaperUri = wallpaperSettings.get_string('picture-uri');
            let imagePath = wallpaperUri.replace(/^file:\/\//, "");
            try {
                imagePath = decodeURI(imagePath);
            } catch (error) { }
            const modifier = Func.isDarkMode() ? "dark" : "light";
            const autoBGC = Colors.getThemeColor(imagePath, modifier);
            this.bgcolor = { dark: autoBGC, light: autoBGC };
        }

        if (this._legacyBlur()) {
            let file = Gio.File.new_for_path('/tmp/blur-my-dynamic-panel-blurred-bg.jpg');
            const colorSet = Func.isDarkMode() ? "dark" : "light";
            if (file.query_exists(null)) {
                const mixed = Colors.colorMix({ r: this.bgcolor[colorSet].r, g: this.bgcolor[colorSet].g, b: this.bgcolor[colorSet].b, a: this._settings.get_int("transparent") / 100 });
                mixed.savev('/tmp/blur-my-dynamic-panel-mixed-bg.jpg', 'jpeg', [], []);
            }
        }
    }

    // 更新模糊背景
    updateBlurredBG() {
        if (this._legacyBlur()) {
            const wallpaperSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
            const wallpaperUri = wallpaperSettings.get_string('picture-uri');
            let imagePath = wallpaperUri.replace(/^file:\/\//, "");
            try {
                imagePath = decodeURI(imagePath);
            } catch (error) { }
            const ext = this.getFileExt(imagePath);
            if (!['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) {
                this._settings.set_boolean("blur", false);
                return;
            }
            const colorSet = Func.isDarkMode() ? "dark" : "light";
            const blurred = Colors.gaussianBlur(this._settings, imagePath, 30);
            blurred.savev('/tmp/blur-my-dynamic-panel-blurred-bg.jpg', 'jpeg', [], []);
            const mixed = Colors.colorMix({ r: this.bgcolor[colorSet].r, g: this.bgcolor[colorSet].g, b: this.bgcolor[colorSet].b, a: this._settings.get_int("transparent") / 100 });
            mixed.savev('/tmp/blur-my-dynamic-panel-mixed-bg.jpg', 'jpeg', [], []);
        }
    }

    // 設定面板背景
    // Applied once, right before the next frame is drawn, instead of after a 10 ms timeout: every
    // call made during the same frame is merged into one.
    setBackground(floating) {
        this._cancelBackgroundUpdate();
        this._setBgDelay = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._setBgDelay = null;
            this._applyBackground(floating);
            this._notifyStyleChanged();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelBackgroundUpdate() {
        if (this._setBgDelay) {
            global.compositor.get_laters().remove(this._setBgDelay);
            this._setBgDelay = null;
        }
    }

    _applyBackground(floating) {
        const _transparent = (Main.panel.has_style_class_name("peeking")) ? 1 : this._settings.get_int("transparent") / 100;
        const colorSet = Func.isDarkMode() ? "dark" : "light";
        const duration = this._settings.get_int("duration");
        const boxes = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
        const areaMode = this._settings.get_int('background-mode') === 1;
        Func.updateStyle(Main.panel, "transition", `${duration}ms`);
        Func.updateStyle(this._bgActor, "transition-duration", `${duration}ms`);

        // 整體模式畫在背景角色上，區域模式畫在三個區域上
        let bg_areas = [this._bgActor];
        if (areaMode) {
            this._clearBackgroundActor();
            bg_areas = boxes;
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const panelHeight = Main.panel.get_height() / 2 * (this._settings.get_int("radius-times") / 100) * scale;
            for (const bg_area of bg_areas) {
                Func.updateStyle(bg_area, "border-radius", `${panelHeight}px`);
            }
        }
        // the panel itself stays transparent while the extension paints its background
        const clearPanelBackground = () => {
            Func.updateStyle(Main.panel, "background-color", `rgba(0, 0, 0, 0)`);
            Func.updateStyle(Main.panel, "background-image", "");
            Func.updateStyle(Main.panel, "background-size", "");
            Func.updateStyle(Main.panel, "background-position", "");
        };

        if (Main.panel.has_style_pseudo_class("overview")) {
            Main.panel.remove_style_class_name(this.floatingPanelClass);
            clearPanelBackground();
            this._clearBackgroundActor();
            if (areaMode) {
                for (const bg_area of boxes) {
                    Func.updateStyle(bg_area, "background-color", `rgba(0, 0, 0, 0)`);
                    Func.updateStyle(bg_area, "background-image", "");
                }
            }
        } else if (floating) {
            Main.panel.add_style_class_name(this.floatingPanelClass);
            clearPanelBackground();
            if (this._legacyBlur()) {
                const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                const panelHeight = Main.panel.get_height();
                const maxHeight = (this._settings.get_int("top-margin") + panelHeight + 5) * scale;
                const panelBox = Main.layoutManager.panelBox;
                for (const bg_area of bg_areas) {
                    const offsetX = areaMode ? bg_area.x : 0;
                    const offsetY = areaMode ? bg_area.y : 0;
                    Func.updateStyle(bg_area, "background-image", "url(/tmp/blur-my-dynamic-panel-mixed-bg.jpg)");
                    Func.updateStyle(bg_area, "background-size", `${Main.layoutManager.primaryMonitor.width}px ${maxHeight + 20}px`);
                    Func.updateStyle(bg_area, "background-position", `-${panelBox.translation_x + offsetX}px -${panelBox.translation_y + offsetY + 20}px`);
                }
            } else {
                for (const bg_area of [this._bgActor, ...boxes]) {
                    Func.updateStyle(bg_area, "background-image", "");
                    Func.updateStyle(bg_area, "background-size", "");
                    Func.updateStyle(bg_area, "background-position", "");
                }
                for (const bg_area of bg_areas) {
                    Func.updateStyle(bg_area, "background-color", `rgba(${this.bgcolor[colorSet].r}, ${this.bgcolor[colorSet].g}, ${this.bgcolor[colorSet].b}, ${_transparent})`);
                }
            }
        } else if (this._settings.get_int("solid-type") == 1) {
            Main.panel.remove_style_class_name(this.floatingPanelClass);
            clearPanelBackground();
            Func.updateStyle(this._bgActor, "background-image", "");
            for (const bg_area of bg_areas) {
                Func.updateStyle(bg_area, "background-color", `rgba(${this.bgcolor[colorSet].r}, ${this.bgcolor[colorSet].g}, ${this.bgcolor[colorSet].b}, ${_transparent})`);
            }
        } else if (this._settings.get_boolean("colors-use-in-static")) {
            Main.panel.remove_style_class_name(this.floatingPanelClass);
            this._clearBackgroundActor();
            for (const bg_area of boxes) {
                bg_area.set_style("");
            }
            Main.panel.set_style("");
            Func.updateStyle(Main.panel, "background-color", `rgba(${this.bgcolor[colorSet].r}, ${this.bgcolor[colorSet].g}, ${this.bgcolor[colorSet].b}, 1)`);
        } else {
            this._clearBackgroundActor();
            for (const bg_area of boxes) {
                bg_area.set_style("");
            }
            Main.panel.remove_style_class_name(this.floatingPanelClass);
            Main.panel.set_style("");
        }
    }

    // 設定面板前景
    setForeground(floating) {
        const colorSet = Func.isDarkMode() ? "dark" : "light";
        const _panelButtons = Object.values(Main.panel.statusArea);
        if (floating || this._settings.get_boolean("colors-use-in-static")) {
            for (const element of _panelButtons) {
                Func.updateStyle(element, "color", `rgb(${this.fgcolor[colorSet].r}, ${this.fgcolor[colorSet].g}, ${this.fgcolor[colorSet].b})`);
            }
            for (const dot of Main.panel.statusArea.activities.first_child.get_children()) {
                Func.updateStyle(dot._dot, "background-color", `rgb(${this.fgcolor[colorSet].r}, ${this.fgcolor[colorSet].g}, ${this.fgcolor[colorSet].b})`);
            }
        } else {
            for (const element of _panelButtons) {
                element.set_style("");
            }
            for (const dot of Main.panel.statusArea.activities.first_child.get_children()) {
                dot._dot.set_style("");
            }
        }
    }

    // 清除自動隱藏相關影響
    clearPeekEffect() {
        if (this._panelHiddenConnect !== null) {
            GLib.Source.remove(this._panelHiddenConnect);
            this._panelHiddenConnect = null;
        }
        Main.panel.remove_style_class_name("peeking");
        Main.panel._leftBox.visible = true;
        Main.panel._centerBox.visible = true;
        Main.panel._rightBox.visible = true;
    }

    // 設定面板大小和位址
    setAllocation(floating) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const duration = this._settings.get_int("duration");
        const screenWidth = Main.layoutManager.primaryMonitor.width;
        if (floating) {
            this.clearPeekEffect();

            const align = this._settings.get_int("float-align");
            const topMargin = this._settings.get_int("top-margin");
            const sideMargin = this._settings.get_int("side-margin");
            const minWidth = Main.panel._leftBox.get_preferred_width(0)[1] + Main.panel._centerBox.get_preferred_width(0)[1] + Main.panel._rightBox.get_preferred_width(0)[1] + 20;
            const floating_width = (this._settings.get_boolean('auto-width')) ? minWidth : Math.max(screenWidth * (this._settings.get_int("float-width") / 100), minWidth);
            let x = 0;
            switch (align) {
                case 0:
                    x = sideMargin * scale;
                    break;
                case 1:
                    x = (screenWidth - floating_width) / 2;
                    break;
                case 2:
                    x = (screenWidth - floating_width) - (sideMargin * scale);
                    break
            }
            this._easePanelBox({ translation_y: topMargin * scale, translation_x: x, width: floating_width });
            if (this._legacyBlur()) {
                GLib.Source.remove(this._updateBgDelay);
                const startTime = new Date().getTime();
                const duration = this._settings.get_int("duration");
                this._updateBgDelay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                    const currentTime = new Date().getTime();
                    this.setBackground(floating);
                    if (currentTime - startTime <= duration) {
                        return true;
                    }
                })
            }
        } else if (this._settings.get_int('solid-type') === 0 || Main.panel.has_style_pseudo_class("overview")) {
            this.clearPeekEffect();

            this._easePanelBox({ translation_y: 0, translation_x: 0, width: screenWidth });
            if (this._legacyBlur()) {
                GLib.Source.remove(this._updateBgDelay);
                const startTime = new Date().getTime();
                const duration = this._settings.get_int("duration");
                this._updateBgDelay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                    const currentTime = new Date().getTime();
                    this.setBackground(floating);
                    if (currentTime - startTime <= duration) {
                        return true;
                    }
                })
            }
        } else {
            if (!this._panelHiddenConnect) {
                const align = this._settings.get_int("float-align");
                const topMargin = this._settings.get_int("top-margin");
                const sideMargin = this._settings.get_int("side-margin");
                const minWidth = Main.panel._leftBox.get_preferred_width(0)[1] + Main.panel._centerBox.get_preferred_width(0)[1] + Main.panel._rightBox.get_preferred_width(0)[1] + 20;
                const floating_width = (this._settings.get_boolean('auto-width')) ? minWidth : Math.max(screenWidth * (this._settings.get_int("float-width") / 100), minWidth);
                let x = 0;
                switch (align) {
                    case 0:
                        x = sideMargin * scale;
                        break;
                    case 1:
                        x = (screenWidth - floating_width) / 2;
                        break;
                    case 2:
                        x = (screenWidth - floating_width) - (sideMargin * scale);
                        break
                }
                this._easePanelBox({ translation_y: -Main.panel.get_height(), translation_x: x, width: floating_width });
                this._panelHiddenConnect = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    const [x, y] = global.get_pointer();
                    if (y > Main.panel.get_height() + topMargin && Main.panel.has_style_class_name("peeking")) {
                        Main.panel.remove_style_class_name("peeking");
                        Main.layoutManager.panelBox.ease({
                            translation_y: -Main.panel.get_height(),
                            duration: duration,
                            mode: Clutter.AnimationMode.EASE_IN_SINE
                        })
                        this._squeezeCount = 0;
                    } else if (y == 0 && this._squeezeCount <= 2) {
                        this._squeezeCount++;
                    } else if (this._squeezeCount > 2 && !Main.panel.has_style_class_name("peeking")) {
                        if (this._settings.get_int("background-mode") == 1) {
                            if (x < screenWidth * 0.33) {
                                Main.panel._leftBox.visible = true;
                                Main.panel._centerBox.visible = false;
                                Main.panel._rightBox.visible = false;
                            } else if (x < screenWidth * 0.66) {
                                Main.panel._leftBox.visible = false;
                                Main.panel._centerBox.visible = true;
                                Main.panel._rightBox.visible = false;
                            } else {
                                Main.panel._leftBox.visible = false;
                                Main.panel._centerBox.visible = false;
                                Main.panel._rightBox.visible = true;
                            }
                        } else {
                            Main.panel._leftBox.visible = true;
                            Main.panel._centerBox.visible = true;
                            Main.panel._rightBox.visible = true;
                        }
                        Main.panel.add_style_class_name("peeking");
                        Main.layoutManager.panelBox.ease({
                            translation_y: topMargin,
                            duration: duration,
                            mode: Clutter.AnimationMode.EASE_OUT_SINE
                        })
                        this.setBackground();
                        this.setRadius();
                    }

                    return GLib.SOURCE_CONTINUE;
                });
            }
        }
    }

    // 移動面板盒（只動畫平移，寬度一次到位）
    // Moves the panel box. Animating its width relays out the whole panel and makes GNOME refresh
    // its input region, pointer barriers and struts on every frame, so by default only the
    // translation is animated: a shrinking panel takes its final width first, a growing panel at
    // the end. The "animate-width" setting restores the full width animation.
    _easePanelBox({ translation_x, translation_y, width }) {
        const panelBox = Main.layoutManager.panelBox;
        const generation = ++this._allocGeneration;
        const params = {
            translation_x,
            translation_y,
            duration: this._settings.get_int("duration"),
            mode: Clutter.AnimationMode.EASE_OUT_SINE,
        };

        let widthAtEnd = null;
        if (this._settings.get_boolean("animate-width")) {
            params.width = width;
        } else {
            panelBox.remove_transition("width");
            if (width <= panelBox.width) {
                panelBox.width = width;
            } else {
                widthAtEnd = width;
            }
        }

        params.onStopped = () => {
            // a newer movement replaced this one
            if (generation !== this._allocGeneration) return;
            if (widthAtEnd !== null) {
                panelBox.width = widthAtEnd;
            }
            // the translation alone does not make GNOME update the input region and struts of
            // the panel box, so it is asked once the panel has arrived
            Main.layoutManager._queueUpdateRegions?.();
            this._notifyStyleChanged(true);
        };
        panelBox.ease(params);
    }

    // 設定面板圓角
    // Animated with a timeline driven by the frame clock (in step with the other animations),
    // from the current radius (no jump when a transition is interrupted), applied on the
    // background actor and only when the rounded value changes.
    setRadius(floating) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const fullRadius = Main.panel.get_height() / 2 * (this._settings.get_int("radius-times") / 100) * scale;
        const target = (floating || this._settings.get_int("solid-type") == 1) ? fullRadius : 0;
        const from = this.currentRadius;
        const duration = this._settings.get_int("duration");

        this._stopRadiusAnimation();
        if (duration <= 0 || from === target) {
            this._applyRadius(target, true);
            return;
        }

        const timeline = new Clutter.Timeline({ actor: Main.layoutManager.uiGroup, duration });
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_SINE);
        timeline.connect("new-frame", () => {
            this._applyRadius(from + (target - from) * timeline.get_progress());
        });
        timeline.connect("completed", () => {
            if (this._radiusTimeline !== timeline) return;
            this._radiusTimeline = null;
            this._applyRadius(target, true);
        });
        this._radiusTimeline = timeline;
        timeline.start();
    }

    _applyRadius(radius, force = false) {
        const rounded = Math.round(radius);
        if (!force && rounded === this._appliedRadius) return;
        this._appliedRadius = rounded;
        this.currentRadius = rounded;
        Func.updateStyle(this._bgActor, "border-radius", `${rounded}px`);
        this._notifyStyleChanged(false);
    }

    _stopRadiusAnimation() {
        if (this._radiusTimeline) {
            const timeline = this._radiusTimeline;
            this._radiusTimeline = null;
            timeline.stop();
        }
    }

    getFileExt(filename) {
        // 查找最後一個 '.' 的位置
        const lastDotIndex = filename.lastIndexOf('.');

        // 如果找不到 '.'，或者 '.' 是第一個字符 (例如 ".bashrc")，則認為沒有有效的後綴名
        if (lastDotIndex === -1 || lastDotIndex === 0) {
            return '';
        }

        // 提取從 '.' 後面一位到字符串結尾的部分，並轉為小寫
        return filename.slice(lastDotIndex + 1).toLowerCase();
    }

    // 清除面板樣式
    clear() {
        // 背景&基本前景
        Main.panel.remove_style_class_name(this.floatingPanelClass);
        Main.panel.set_style("");
        Main.panel._leftBox.set_style("");
        Main.panel._centerBox.set_style("");
        Main.panel._rightBox.set_style("");
        // 前景
        for (const element of Object.values(Main.panel.statusArea)) {
            if (element) {
                element.set_style("");
            }
        }
        for (const dot of Main.panel.statusArea.activities.first_child.get_children()) {
            dot._dot.set_style("");
        }

        // 清除自動隱藏功能產生的影響
        this.clearPeekEffect();

        this.onStyleChanged = null;
        this.currentRadius = 0;

        // 清除面板動畫
        this._stopRadiusAnimation();
        this._cancelBackgroundUpdate();
        if (this._updateBgDelay) {
            GLib.Source.remove(this._updateBgDelay);
        }
        this._updateBgDelay = null;
        // the exit animation of the panel box keeps running, so it still restores the full width

        // 清除背景角色
        this._bgGroup?.destroy();
        this._bgGroup = null;
        this._bgActor = null;
    }
}