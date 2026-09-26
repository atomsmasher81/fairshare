#!/bin/sh
# First run: create secrets once and keep them in the data volume, so there's nothing to configure.
set -e
mkdir -p /data
SECRETS=/data/secrets.env
if [ ! -f "$SECRETS" ]; then
  node -e '
    const c = require("crypto"), wp = require("web-push"), k = wp.generateVAPIDKeys();
    require("fs").writeFileSync(process.argv[1],
      `SESSION_SECRET=${c.randomBytes(32).toString("hex")}\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\n`, { mode: 0o600 });
  ' "$SECRETS"
  echo "Generated session secret and push keys in $SECRETS"
fi
# Values from the environment win over generated ones
set -a; . "$SECRETS"; set +a
[ -n "$FS_SESSION_SECRET" ] && export SESSION_SECRET="$FS_SESSION_SECRET"
[ -n "$FS_VAPID_PUBLIC_KEY" ] && export VAPID_PUBLIC_KEY="$FS_VAPID_PUBLIC_KEY"
[ -n "$FS_VAPID_PRIVATE_KEY" ] && export VAPID_PRIVATE_KEY="$FS_VAPID_PRIVATE_KEY"

npx prisma migrate deploy
exec "$@"
