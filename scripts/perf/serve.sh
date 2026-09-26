#!/bin/sh
# serve.sh start <built repo dir> | stop
# One production server on :3100 at a time: two `next start` servers and a headed Chromium run the dev
# machine out of memory (scripts/perf/README.md). The dir must already be built (`bun run build`).
PORT=3100
listener() { netstat -ano | grep ":$PORT .*LISTENING" | awk '{print $5}' | head -1; }
case "$1" in
  start)
    [ -n "$(listener)" ] && { echo "something already listens on :$PORT; stop it first" >&2; exit 1; }
    (cd "$2" && bun run start --port $PORT > /dev/null 2>&1 &)
    for _ in $(seq 1 90); do curl -s -o /dev/null "http://localhost:$PORT/" && exit 0; sleep 1; done
    echo "the server on :$PORT didn't come up" >&2; exit 1 ;;
  stop)
    pid=$(listener); [ -n "$pid" ] && taskkill //F //T //PID "$pid" > /dev/null 2>&1
    sleep 2 ;;
  *) echo "usage: serve.sh start <dir> | stop" >&2; exit 2 ;;
esac
