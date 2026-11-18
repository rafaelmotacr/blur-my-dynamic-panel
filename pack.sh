#!/usr/bin/env sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds blur-my-dynamic-panel@rafaelmotacr.shell-extension.zip in the current directory.
# `gnome-extensions pack` compiles the GSettings schema into the zip by itself.
set -eu
cd "$(dirname "$0")"
gnome-extensions pack --force \
    --extra-source=lib \
    --extra-source=icons \
    --extra-source=locale \
    --extra-source=LICENSE \
    --extra-source=LICENSES \
    --extra-source=README.md \
    .
