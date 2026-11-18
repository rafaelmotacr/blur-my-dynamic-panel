// SPDX-License-Identifier: GPL-3.0-or-later
// Blur My Dynamic Panel - https://github.com/rafaelmotacr/blur-my-dynamic-panel
// Based on Dynamic Panel, Copyright (c) 2024 龍翔翎 (velade), used under the
// M.W.B License (see LICENSES/MWB-Dynamic-Panel.txt).
// Modifications Copyright (c) 2026 Rafael Mota.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// 面板模糊設定（來自 Blur my Shell）
import { Settings as BlurSettings } from './lib/blur/settings/settings.js';
import { KEYS as BLUR_KEYS } from './lib/blur/settings/keys.js';
import { PipelinesManager } from './lib/blur/pipelines/pipelines_manager.js';
import { Panel as BlurPanelPage } from './lib/blur/preferences/pages/shell/panel.js';
import { Pipelines as BlurPipelinesPage } from './lib/blur/preferences/pages/pipelines/index.js';
import './lib/blur/preferences/widgets/pipeline_choose_row.js';

const BLUR_MY_SHELL_UUID = 'blur-my-shell@aunetx';
const DYNAMIC_PANEL_UUID = 'dynamic-panel@velhlkj.com';

// 原版 Dynamic Panel 是否也已啟用（兩者會同時控制同一個面板）
// Whether the original Dynamic Panel is enabled too: both would drive the same panel.
function isOriginalDynamicPanelEnabled() {
    try {
        const shellSettings = new Gio.Settings({ schema_id: 'org.gnome.shell' });
        return !shellSettings.get_boolean('disable-user-extensions')
            && shellSettings.get_strv('enabled-extensions').includes(DYNAMIC_PANEL_UUID);
    } catch (error) {
        return false;
    }
}

// 檢查 Blur my Shell 是否也在模糊面板
// Whether Blur my Shell is enabled and blurs the panel as well (both blurs would stack).
function isBlurMyShellBlurringPanel() {
    try {
        const shellSettings = new Gio.Settings({ schema_id: 'org.gnome.shell' });
        if (shellSettings.get_boolean('disable-user-extensions'))
            return false;
        if (!shellSettings.get_strv('enabled-extensions').includes(BLUR_MY_SHELL_UUID))
            return false;

        const schemaId = 'org.gnome.shell.extensions.blur-my-shell.panel';
        const sources = [Gio.SettingsSchemaSource.get_default()];
        for (const dir of [
            GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', BLUR_MY_SHELL_UUID, 'schemas']),
            GLib.build_filenamev(['/usr/share/gnome-shell/extensions', BLUR_MY_SHELL_UUID, 'schemas']),
        ]) {
            if (GLib.file_test(GLib.build_filenamev([dir, 'gschemas.compiled']), GLib.FileTest.EXISTS))
                sources.push(Gio.SettingsSchemaSource.new_from_directory(dir, sources[0], false));
        }
        for (const source of sources) {
            const schema = source?.lookup(schemaId, true);
            if (schema)
                return new Gio.Settings({ settings_schema: schema }).get_boolean('blur');
        }
        // enabled, but its settings could not be read: its panel blur is on by default
        return true;
    } catch (error) {
        return false;
    }
}

export default class extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let settings = window._settings = this.getSettings();

        const gCommon = new Adw.PreferencesGroup({ title: _("General") });

        // 檢測方式
        let cDetection = new Gtk.ComboBoxText();
        cDetection.append_text(_("Window Close"));
        cDetection.append_text(_("Maximize Only"));
        cDetection.connect('changed', (sw) => {
            let newVal = sw.get_active();
            if (newVal == settings.get_int('detection-mode')) return;
            settings.set_int('detection-mode', newVal);
        })
        cDetection.set_active(settings.get_int('detection-mode'));
        let rowDetection = new Adw.ActionRow({ title: _('Detection Method') });
        rowDetection.add_suffix(cDetection);
        gCommon.add(rowDetection);

        // 動畫時長
        let spSpeed = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 9999,
                step_increment: 1
            }),
            climb_rate: 0.5,
            digits: 0
        });
        spSpeed.connect('value-changed', (sw) => {
            let newVal = sw.get_value();
            if (newVal == settings.get_int('duration')) return;
            settings.set_int('duration', newVal);
        });

        spSpeed.set_value(settings.get_int('duration'))

        let rowSpeed = new Adw.ActionRow({ title: _('Duration (ms)') });
        rowSpeed.add_suffix(spSpeed);
        gCommon.add(rowSpeed);

        // 透明度應用在選單
        let sTransMenu = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sTransMenu.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('transparent-menus')) return;
            settings.set_boolean('transparent-menus', state);
            if (state) {
                rowTransMenuKeepAlpha.sensitive = true;
            } else {
                rowTransMenuKeepAlpha.sensitive = false;
            }
        })
        sTransMenu.set_active(settings.get_boolean('transparent-menus'));
        let rowTransMenu = new Adw.ActionRow({ title: _('Apply panel style to panel menu') });
        rowTransMenu.add_suffix(sTransMenu);
        gCommon.add(rowTransMenu);

        // 實體模式保持透明度
        let sTransMenuKeepAlpha = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sTransMenuKeepAlpha.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('transparent-menus-keep-alpha')) return;
            settings.set_boolean('transparent-menus-keep-alpha', state);
        })
        sTransMenuKeepAlpha.set_active(settings.get_boolean('transparent-menus-keep-alpha'));
        let rowTransMenuKeepAlpha = new Adw.ActionRow({ title: "    " + _('Entity Mode Keep Transparency') });
        rowTransMenuKeepAlpha.add_suffix(sTransMenuKeepAlpha);
        gCommon.add(rowTransMenuKeepAlpha);

        // 自訂顏色
        // 自動獲取顏色開關
        let sAutoBG = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sAutoBG.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('auto-background')) return;
            settings.set_boolean('auto-background', state);
            if (state) {
                rowDBGColor.visible = false;
                rowLBGColor.visible = false;
            } else {
                rowDBGColor.visible = true;
                rowLBGColor.visible = true;
            }
        })
        // -- 暗黑模式顏色設定
        let cDBGColor = new Gtk.ColorButton();
        cDBGColor.set_use_alpha(false);
        cDBGColor.connect('color-set', () => {
            let newColor = cDBGColor.get_rgba();
            settings.set_string('dark-bg-color', newColor.to_string());
        });
        let cDFGColor = new Gtk.ColorButton();
        cDFGColor.set_use_alpha(false);
        cDFGColor.connect('color-set', () => {
            let newColor = cDFGColor.get_rgba();
            settings.set_string('dark-fg-color', newColor.to_string());
        });

        // -- 明亮模式顏色設定
        let cLBGColor = new Gtk.ColorButton();
        cLBGColor.set_use_alpha(false);
        cLBGColor.connect('color-set', () => {
            let newColor = cLBGColor.get_rgba();
            settings.set_string('light-bg-color', newColor.to_string());
        });
        let cLFGColor = new Gtk.ColorButton();
        cLFGColor.set_use_alpha(false);
        cLFGColor.connect('color-set', () => {
            let newColor = cLFGColor.get_rgba();
            settings.set_string('light-fg-color', newColor.to_string());
        });

        // -- 顏色初始值
        let rgba = new Gdk.RGBA();

        rgba.parse(settings.get_string('dark-bg-color'));
        cDBGColor.set_rgba(rgba);

        rgba.parse(settings.get_string('dark-fg-color'));
        cDFGColor.set_rgba(rgba);

        rgba.parse(settings.get_string('light-bg-color'));
        cLBGColor.set_rgba(rgba);

        rgba.parse(settings.get_string('light-fg-color'));
        cLFGColor.set_rgba(rgba);

        sAutoBG.set_active(settings.get_boolean("auto-background"));

        let rowColors = new Adw.ExpanderRow({ title: _('Custom Colors') });
        let rowAutoBG = new Adw.ActionRow({ title: _("Multicolored"), subtitle: _("Automatically get color from wallpaper") });
        rowAutoBG.add_suffix(sAutoBG);
        let rowDColors = new Adw.ExpanderRow({ title: _('Dark Mode') });
        let rowDBGColor = new Adw.ActionRow({ title: _('Background Color') });
        rowDBGColor.add_suffix(cDBGColor);
        let rowDFGColor = new Adw.ActionRow({ title: _('Foreground Color') });
        rowDFGColor.add_suffix(cDFGColor);
        rowDColors.add_row(rowDBGColor);
        rowDColors.add_row(rowDFGColor);
        let rowLColors = new Adw.ExpanderRow({ title: _('Light Mode') });
        let rowLBGColor = new Adw.ActionRow({ title: _('Background Color') });
        rowLBGColor.add_suffix(cLBGColor);
        let rowLFGColor = new Adw.ActionRow({ title: _('Foreground Color') });
        rowLFGColor.add_suffix(cLFGColor);
        rowLColors.add_row(rowLBGColor);
        rowLColors.add_row(rowLFGColor);
        rowColors.add_row(rowAutoBG);
        rowColors.add_row(rowDColors);
        rowColors.add_row(rowLColors);
        gCommon.add(rowColors)

        // 效能
        const gPerformance = new Adw.PreferencesGroup({
            title: _("Performance"),
            description: _("Options that make the switch between the Floating and Solid modes lighter"),
        });
        const rowStableWorkarea = new Adw.SwitchRow({
            title: _("Stable work area"),
            subtitle: _("Windows keep their size when the panel switches mode, instead of being resized by the space the panel reserves"),
        });
        settings.bind('stable-workarea', rowStableWorkarea, 'active', Gio.SettingsBindFlags.DEFAULT);
        gPerformance.add(rowStableWorkarea);
        const rowAnimateWidth = new Adw.SwitchRow({
            title: _("Animate panel width"),
            subtitle: _("Smoother when the width changes a lot (Auto Width), but heavier: the panel is laid out again on every frame"),
        });
        settings.bind('animate-width', rowAnimateWidth, 'active', Gio.SettingsBindFlags.DEFAULT);
        gPerformance.add(rowAnimateWidth);

        const gFloating = new Adw.PreferencesGroup({ title: _("Floating Mode") });

        // 背景模式
        let cBackgroundMode = new Gtk.ComboBoxText();
        cBackgroundMode.append_text(_("Overall"));
        cBackgroundMode.append_text(_("Area"));
        cBackgroundMode.connect('changed', (sw) => {
            let newVal = sw.get_active();
            if (newVal == settings.get_int('background-mode')) return;
            settings.set_int('background-mode', newVal);
        })
        cBackgroundMode.set_active(settings.get_int('background-mode'));
        let rowBackgroundMode = new Adw.ActionRow({ title: _('Background Mode') });
        rowBackgroundMode.add_suffix(cBackgroundMode);
        gFloating.add(rowBackgroundMode);

        // 對齊方式
        let cAlign = new Gtk.ComboBoxText()
        cAlign.append_text(_("Left"))
        cAlign.append_text(_("Center"))
        cAlign.append_text(_("Right"))
        cAlign.connect('changed', (sw) => {
            let newVal = sw.get_active()
            if (newVal == settings.get_int('float-align')) return
            settings.set_int('float-align', newVal)
            if (newVal == 1) {
                rowSMargin.sensitive = false;
            } else {
                rowSMargin.sensitive = true;
            }
        })
        cAlign.set_active(settings.get_int('float-align'))
        let rowAlign = new Adw.ActionRow({ title: _('Align') });
        rowAlign.add_suffix(cAlign);
        gFloating.add(rowAlign);

        // 自動長度
        let sAutoWidth = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sAutoWidth.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('auto-width')) return;
            settings.set_boolean('auto-width', state);
            if (state) {
                rowWidth.sensitive = false;
            } else {
                rowWidth.sensitive = true;
            }
        })
        sAutoWidth.set_active(settings.get_boolean('auto-width'));
        let rowAutoWidth = new Adw.ActionRow({ title: _('Auto Width') });
        rowAutoWidth.add_suffix(sAutoWidth);
        gFloating.add(rowAutoWidth);

        // 寬度控制條
        let sWidth = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            hexpand: true,
            digits: 0,
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 100, step_increment: 1 }),
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            round_digits: 0
        })
        sWidth.connect('value-changed', (sw) => {
            let newVal = sw.get_value()
            if (newVal == settings.get_int('float-width')) return
            settings.set_int('float-width', newVal)
        })
        sWidth.set_value(settings.get_int('float-width'))
        let rowWidth = new Adw.ActionRow({ title: _('Panel Width (%)') });
        rowWidth.add_suffix(sWidth);
        gFloating.add(rowWidth);

        // 圓角控制條
        let sRadius = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            hexpand: true,
            digits: 0,
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 100, step_increment: 1 }),
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            round_digits: 0
        })
        sRadius.connect('value-changed', (sw) => {
            let newVal = sw.get_value()
            if (newVal == settings.get_int('radius-times')) return
            settings.set_int('radius-times', newVal)
        })
        sRadius.set_value(settings.get_int('radius-times'))
        let rowRadius = new Adw.ActionRow({ title: _('Border Radius (%)') });
        rowRadius.add_suffix(sRadius);
        gFloating.add(rowRadius);

        // 不透明度控制條
        let sTransparent = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            hexpand: true,
            digits: 0,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1 }),
            draw_value: true,
            value_pos: Gtk.PositionType.RIGHT,
            round_digits: 0
        })
        sTransparent.connect('value-changed', (sw) => {
            let newVal = sw.get_value()
            if (newVal == settings.get_int('transparent')) return
            settings.set_int('transparent', newVal)
        })
        sTransparent.set_value(settings.get_int('transparent'))
        let rowTransparent = new Adw.ActionRow({ title: _('Opacity (%)') });
        rowTransparent.add_suffix(sTransparent);
        gFloating.add(rowTransparent);

        // 模糊開關
        let sBlur = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sBlur.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('blur')) return;
            settings.set_boolean('blur', state);
        })
        sBlur.set_active(settings.get_boolean('blur'));
        let rowBlur = new Adw.ActionRow({ title: _('Blur effect'), subtitle: _('Static blurred image of the wallpaper. Turned off while the real Blur is enabled in the Blur page.') });
        rowBlur.add_suffix(sBlur);
        gFloating.add(rowBlur);
        // 真正的面板模糊啟用時，舊版的靜態模糊不生效
        const blurPanelSettings = settings.get_child('blur').get_child('panel');
        const updateLegacyBlurRow = () => {
            rowBlur.sensitive = !blurPanelSettings.get_boolean('blur');
        };
        blurPanelSettings.connect('changed::blur', updateLegacyBlurRow);
        updateLegacyBlurRow();

        // 頂部邊距
        let spTMargin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1
            }),
            climb_rate: 0.5,
            digits: 0
        });
        spTMargin.connect('value-changed', (sw) => {
            let newVal = sw.get_value();
            if (newVal == settings.get_int('top-margin')) return
            settings.set_int('top-margin', newVal)
        });
        spTMargin.set_value(settings.get_int('top-margin'))
        let rowTMargin = new Adw.ActionRow({ title: _('Top Margin (px)') });
        rowTMargin.add_suffix(spTMargin);
        gFloating.add(rowTMargin);

        // 側面邊距
        let spSMargin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1
            }),
            climb_rate: 0.5,
            digits: 0
        });
        spSMargin.connect('value-changed', (sw) => {
            let newVal = sw.get_value();
            if (newVal == settings.get_int('side-margin')) return
            settings.set_int('side-margin', newVal)
        });
        spSMargin.set_value(settings.get_int('side-margin'))
        let rowSMargin = new Adw.ActionRow({ title: _('Side Margin (px)') });
        rowSMargin.add_suffix(spSMargin);
        gFloating.add(rowSMargin);

        const gSolid = new Adw.PreferencesGroup({ title: _("Solid Mode") });

        // 實體類型
        let cSolidType = new Gtk.ComboBoxText();
        cSolidType.append_text(_("Dock"));
        cSolidType.append_text(_("Hide"));
        cSolidType.connect('changed', (sw) => {
            let newVal = sw.get_active();
            if (newVal == settings.get_int('solid-type')) return;
            settings.set_int('solid-type', newVal);
        })
        cSolidType.set_active(settings.get_int('solid-type'));
        let rowSolidType = new Adw.ActionRow({ title: _('Solid Mode Type') });
        rowSolidType.add_suffix(cSolidType);
        gSolid.add(rowSolidType);

        // 顏色在靜態模式生效設定
        let sUseInStatic = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sUseInStatic.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('colors-use-in-static')) return;
            settings.set_boolean('colors-use-in-static', state);
        })
        sUseInStatic.set_active(settings.get_boolean('colors-use-in-static'))
        let rowColorsUseInStatic = new Adw.ActionRow({ title: _('Apply Custom Colors') });
        rowColorsUseInStatic.add_suffix(sUseInStatic);
        gSolid.add(rowColorsUseInStatic);

        const gAccessibility = new Adw.PreferencesGroup({ title: _("Accessibility") });
        // 盲點補丁
        let rowTriggers = new Adw.ExpanderRow({ title: _('Easy Click Fix'), subtitle: _("Add extra clickable areas for hover mode to restore clickability at absolute corners") });
        rowTriggers.expanded = true;
        // -- Left
        let sAddonTriggerL = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sAddonTriggerL.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('addon-trigger-left')) return;
            settings.set_boolean('addon-trigger-left', state);
        })
        sAddonTriggerL.set_active(settings.get_boolean('addon-trigger-left'))
        let rowAddonTriggerL = new Adw.ActionRow({ title: _('Overview (Left)') });
        rowAddonTriggerL.add_suffix(sAddonTriggerL);
        rowTriggers.add_row(rowAddonTriggerL);

        // -- Center
        let sAddonTriggerC = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sAddonTriggerC.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('addon-trigger-center')) return;
            settings.set_boolean('addon-trigger-center', state);
        })
        sAddonTriggerC.set_active(settings.get_boolean('addon-trigger-center'))
        let rowAddonTriggerC = new Adw.ActionRow({ title: _('Notification Center (Middle)') });
        rowAddonTriggerC.add_suffix(sAddonTriggerC);
        rowTriggers.add_row(rowAddonTriggerC);

        // -- Right
        let sAddonTriggerR = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        sAddonTriggerR.connect('state-set', (sw, state) => {
            if (state == settings.get_boolean('addon-trigger-right')) return;
            settings.set_boolean('addon-trigger-right', state);
        })
        sAddonTriggerR.set_active(settings.get_boolean('addon-trigger-right'))
        let rowAddonTriggerR = new Adw.ActionRow({ title: _('Quick Settings (Right)') });
        rowAddonTriggerR.add_suffix(sAddonTriggerR);
        rowTriggers.add_row(rowAddonTriggerR);

        gAccessibility.add(rowTriggers);

        // 設定關聯選項
        if (settings.get_boolean('transparent-menus')) {
            rowTransMenuKeepAlpha.sensitive = true;
        } else {
            rowTransMenuKeepAlpha.sensitive = false;
        }
        if (settings.get_int('float-align') == 1) {
            rowSMargin.sensitive = false;
        } else {
            rowSMargin.sensitive = true;
        }
        if (settings.get_boolean('auto-width')) {
            rowWidth.sensitive = false;
        } else {
            rowWidth.sensitive = true;
        }

        if (settings.get_boolean('auto-background')) {
            rowDBGColor.visible = false;
            rowLBGColor.visible = false;
        } else {
            rowDBGColor.visible = true;
            rowLBGColor.visible = true;
        }

        // 追加自定義圖標
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_search_path().includes(this.path + "/icons")) {
            iconTheme.add_search_path(this.path + "/icons");
        }

        // 向頁面添加組
        const pageCommon = new Adw.PreferencesPage({ name: "common", title: _("General"), iconName: `bmdp-panel-generic-symbolic` });
        if (isOriginalDynamicPanelEnabled()) {
            const gConflict = new Adw.PreferencesGroup();
            const rowConflict = new Adw.ActionRow({
                title: _('The original Dynamic Panel is enabled'),
                subtitle: _('Disable it: both extensions would change the same panel. Blur My Dynamic Panel already includes all of its features.'),
            });
            rowConflict.add_prefix(new Gtk.Image({ icon_name: 'dialog-warning-symbolic' }));
            gConflict.add(rowConflict);
            pageCommon.add(gConflict);
        }
        pageCommon.add(gCommon);
        pageCommon.add(gPerformance);
        const pageFloating = new Adw.PreferencesPage({ name: "common", title: _("Floating Mode"), iconName: `bmdp-panel-floating-symbolic` });
        pageFloating.add(gFloating);
        const pageSolid = new Adw.PreferencesPage({ name: "common", title: _("Solid Mode"), iconName: `bmdp-panel-solid-symbolic` });
        pageSolid.add(gSolid);
        const pageAccessibility = new Adw.PreferencesPage({ name: "common", title: _("Accessibility"), iconName: `bmdp-panel-accessibility-symbolic` });
        pageAccessibility.add(gAccessibility);

        // 面板模糊頁面（來自 Blur my Shell）
        // Blur pages, adapted from Blur my Shell: the panel blur settings and the pipelines editor
        // (the sets of effects, like blur radius and brightness, the blur uses).
        const blurIconPath = this.dir.get_child('icons').get_path();
        if (!iconTheme.get_search_path().includes(blurIconPath)) {
            iconTheme.add_search_path(blurIconPath);
        }
        const blurPreferences = new BlurSettings(BLUR_KEYS, settings.get_child('blur'));
        const blurPipelinesManager = new PipelinesManager(blurPreferences);
        const pageBlurPipelines = new BlurPipelinesPage(blurPreferences, blurPipelinesManager, window);
        const pageBlur = new BlurPanelPage(blurPreferences, blurPipelinesManager, pageBlurPipelines);
        pageBlur.set_blur_my_shell_warning(
            blurPreferences.panel.BLUR && isBlurMyShellBlurringPanel()
        );
        blurPreferences.panel.BLUR_changed(() => pageBlur.set_blur_my_shell_warning(
            blurPreferences.panel.BLUR && isBlurMyShellBlurringPanel()
        ));

        window.connect('close-request', () => {
            pageBlurPipelines.cleanup();
            blurPipelinesManager.destroy();
            blurPreferences.disconnect_all_settings();
            return false;
        });

        // 向窗口添加頁面
        window.set_search_enabled(true);
        window.set_default_size(640, 760);
        window.add(pageCommon);
        window.add(pageFloating);
        window.add(pageSolid);
        window.add(pageBlur);
        window.add(pageBlurPipelines);
        window.add(pageAccessibility);
    }
}