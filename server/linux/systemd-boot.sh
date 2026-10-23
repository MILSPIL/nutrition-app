#!/bin/sh
set -eu
# Container-local namespace only. Disconnect all host propagation before making the
# hierarchy shared for systemd credential helper processes (CONTAINER_INTERFACE #8).
[ "${container:-}" = docker ]
[ -f /.dockerenv ]
mount --make-rprivate /
mount --make-rshared /
mount -o remount,ro /sys
mount --bind /proc/sys /proc/sys
mount -o remount,bind,ro /proc/sys
exec /sbin/init
