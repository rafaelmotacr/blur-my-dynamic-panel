# Blur My Dynamic Panel

A GNOME Shell extension that merges **[Dynamic Panel](https://github.com/velade/dynamic-panel)** and the
panel blur of **[Blur my Shell](https://github.com/aunetx/blur-my-shell)** into one extension, with a
few changes of its own.

> **What this is, and what it is not.** Blur My Dynamic Panel is a combination of two existing
> extensions, not a new design. Almost all of its features come from
> [Dynamic Panel](https://github.com/velade/dynamic-panel) by 龍翔翎 (velade) and from
> [Blur my Shell](https://github.com/aunetx/blur-my-shell) by aunetx and contributors. Credit for
> those features belongs to them. This project only joins the two, keeps them working on newer GNOME
> versions and changes a few things. It is **unofficial**: neither original project is affiliated
> with it, endorses it or supports it. Please report problems here, not to the original projects.

## Features

**From Dynamic Panel** (all of its features are kept):

- Floating and solid panel modes that switch when a window comes near the panel
- Floating mode options: width, auto width, alignment, border radius, opacity, margins, and
  a whole-panel or per-area background
- Custom colors for dark and light mode, or colors taken from the wallpaper
- Panel style applied to panel menus
- Hide mode and the *Easy Click Fix* hot corners

**From Blur my Shell** (only the top panel part):

- Real blur behind the panel, in static or dynamic mode
- Effect pipelines: blur, color, luminosity, noise, pixelize, refraction, wave and more
- Background styles, window proximity modes, gradient and light text
- Compatibility with Hide Top Bar and Dash to Panel

**Changes made in this project:**

- The blur follows the floating panel's shape, animations and modes, including the per-area
  background mode.
- Works on GNOME 51, which no longer has X11 sessions.
- Faster switching between floating and solid mode:
  - **Stable work area** (General → Performance, on by default): an invisible actor reserves the
    panel space, so maximized and tiled windows are no longer resized on every mode switch.
  - The panel background and border radius are painted on a separate actor. The radius animation
    no longer restyles every indicator on each frame.
  - The panel width is set once instead of being animated. The **Animate panel width** option
    turns the animation back on.
  - Window movements trigger detection at most once per frame.

## Compatibility

| GNOME Shell | Status |
|---|---|
| 46 – 49 | Supported (Wayland and X11) |
| 50 | Not tested yet, so not declared in `metadata.json` |
| 51 | Supported (Wayland only, since GNOME removed X11 sessions) |

### Conflicts

- **Dynamic Panel**: do not enable it at the same time. Both extensions would change the same panel.
  The preferences window shows a warning if it is enabled.
- **Blur my Shell**: it can stay installed, but turn off its *Panel* blur while this extension's blur
  is on. Otherwise the two blurs stack.

## Installation

### From source

```sh
git clone https://github.com/rafaelmotacr/blur-my-dynamic-panel.git
cd blur-my-dynamic-panel
./pack.sh
gnome-extensions install --force blur-my-dynamic-panel@rafaelmotacr.shell-extension.zip
```

Log out and back in (on Wayland, GNOME Shell only loads new extensions at login), then run:

```sh
gnome-extensions disable dynamic-panel@velhlkj.com   # if you had Dynamic Panel installed
gnome-extensions enable blur-my-dynamic-panel@rafaelmotacr
```

`pack.sh` needs `gnome-extensions`, which comes with GNOME Shell.

### Bringing over your Dynamic Panel settings

The panel settings use the same keys as Dynamic Panel, so you can copy them over:

```sh
dconf dump /org/gnome/shell/extensions/dynamic-panel/ \
  | dconf load /org/gnome/shell/extensions/blur-my-dynamic-panel/
```

Blur settings start from defaults. They are stored separately from Blur my Shell's settings.

## Independence from the original extensions

This extension has its own UUID (`blur-my-dynamic-panel@rafaelmotacr`), its own GSettings schema
(`org.gnome.shell.extensions.blur-my-dynamic-panel`), its own translation domain, and prefixed CSS
classes and icon names (`dp-blur-*`, `bmdp-*`). Installing it does not overwrite or change Dynamic
Panel or Blur my Shell, and updates to those extensions do not reach this one.

In the source code, "Dynamic Panel" and "Blur my Shell" in comments mean the part of this extension
that came from each project.

## Project layout

```
extension.js, prefs.js, lib/*.js   Panel logic and preferences          (from Dynamic Panel)
lib/blur/                          Panel blur, effects, pipelines, UI   (from Blur my Shell)
lib/blur_bridge.js                 Connects the blur to the panel modes (new)
lib/blur/integration.js            Sets up the blur for the panel       (new, partly from Blur my Shell)
lib/struts.js                      Stable work area                     (new)
schemas/                           Settings from both projects plus new keys
locale/                            Translations from Dynamic Panel
```

Each source file has a header that says which project it came from.

## Credits

- **[Dynamic Panel](https://github.com/velade/dynamic-panel)**, Copyright (c) 2024 龍翔翎 (velade):
  the panel modes, colors, preferences and translations.
- **[Blur my Shell](https://github.com/aunetx/blur-my-shell)**, Copyright (c) aunetx and
  contributors: the blur engine, effects, pipelines and their preferences.
- Blur my Shell itself includes third-party code, and its notices are kept in the files:
  - the refraction shader, ported from [Liquid (Gl)ass](https://github.com/winaviation-tweaks/liquid-ass)
    by winaviation and relicensed under the GPL v3 with the author's permission
    (`lib/blur/effects/refraction/refraction.glsl`)
  - simplex noise by Ashima Arts and Stefan Gustavson, MIT (`lib/blur/effects/wave/wave.glsl`)
  - a helper from [Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) by Simon
    Schneegans (`lib/blur/conveniences/utils.js`)
- **Merging, GNOME 51 support and performance work:** Rafael Mota
  ([@rafaelmotacr](https://github.com/rafaelmotacr)).

## License

Blur My Dynamic Panel is distributed under the **GNU General Public License, version 3 or later**
([`LICENSE`](LICENSE)). It has to be: it includes code from Blur my Shell, which uses that license.

The parts that come from Dynamic Panel were released under the **M.W.B License**, an MIT-style
license. Its copyright and permission notice must stay with those parts, so it is kept in
[`LICENSES/MWB-Dynamic-Panel.txt`](LICENSES/MWB-Dynamic-Panel.txt) and included in every package.

This program is distributed WITHOUT ANY WARRANTY. See the GNU General Public License for details.
