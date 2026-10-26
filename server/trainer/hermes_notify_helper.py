"""Forwards only heartbeats actually emitted by the Node event loop."""
import os
import socket
import sys


def main():
    target = os.environ['NOTIFY_SOCKET']
    if target.startswith('@'):
        target = '\0' + target[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
        channel.connect(target)
        ready = False
        while True:
            chunk = os.read(0, 4096)
            if not chunk:
                return
            for byte in chunk:
                if byte == ord('R') and not ready:
                    channel.sendall(b'READY=1\nWATCHDOG=1')
                    ready = True
                elif byte == ord('W') and ready:
                    channel.sendall(b'WATCHDOG=1')
                else:
                    raise RuntimeError('watchdog_protocol_invalid')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit(1)
