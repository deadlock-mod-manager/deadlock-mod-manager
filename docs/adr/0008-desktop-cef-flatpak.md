# Run CEF within the Flatpak sandbox

Chromium's nested sandbox and zypak are incompatible with the CEF build under Flatpak, so rely on the Flatpak container and set the Chromium switch in the runtime callback. Keep libcef alongside the binary per its loader path and relocate it to a space-free directory for the zygote.
