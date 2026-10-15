// Verification aid, not an OS sandbox. Blocks Node network entry points in tests/CLI.
const deny = () => { throw new Error('Network use forbidden in offline verification'); };
for (const [name, methods] of Object.entries({ http:['request','get'], https:['request','get'], net:['connect','createConnection'], tls:['connect'], dgram:['createSocket'] })) {
  const mod = require('node:' + name);
  for (const method of methods) mod[method] = deny;
}
globalThis.fetch = deny;
require('node:module').syncBuiltinESMExports();
