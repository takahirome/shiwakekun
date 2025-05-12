#!/bin/bash

# MacOSでダイアログを正常に機能させるために必要な環境変数を設定
export XDG_DATA_DIRS=${XDG_DATA_DIRS:-/usr/local/share:/usr/share}
export XDG_DATA_DIRS=/usr/local/share/gsettings-schemas:/usr/share/gsettings-schemas:$XDG_DATA_DIRS 