#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep this demo's JDK separate from Android Studio's bundled Java version.
if [[ -z "${JAVA_HOME:-}" && -d "$PWD/.local/jdk-17/Contents/Home" ]]; then
  export JAVA_HOME="$PWD/.local/jdk-17/Contents/Home"
elif [[ -z "${JAVA_HOME:-}" && "$(uname)" == "Darwin" ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  echo "Set JAVA_HOME to a JDK 17 installation before running Android." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

export PATH="$JAVA_HOME/bin:${ANDROID_HOME:+$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:}$PATH"
# Android's adb reverse expects an IPv4-reachable Metro server on this Mac.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"
# The artifact host's IPv6 route is unavailable on this development network.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }-Djava.net.preferIPv4Stack=true"
exec ./node_modules/.bin/expo run:android "$@"
