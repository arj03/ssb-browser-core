const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const ssbKeys = require('ssb-keys')
const helpers = require('./core-helpers')

const path = require('path')

exports.init = function(dir, overwriteConfig, extraModules) {
  var keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

  var config = Object.assign({
    caps: { shs: Buffer.from(caps.shs, 'base64') },
    keys,
    friends: {
      hops: 2
    },
    connections: {
      incoming: {
        tunnel: [{ scope: 'public', transform: 'shs' }]
      },
      outgoing: {
        net: [{ transform: 'shs' }],
        ws: [{ transform: 'shs' }, { transform: 'noauth' }],
        tunnel: [{ transform: 'shs' }]
      }
    },
    path: dir,
    timers: {
      inactivity: 30e3
    },
    conn: {
      autostart: false,
      populatePubs: false,
    },
    ebt: {
      logging: false
    },
    blobs: {
      sympathy: 0, //sympathy controls whether you'll replicate
      stingy: false,
      pushy: 3,
      max: 256*1024
    }
  }, overwriteConfig)

  let secretStack = SecretStack(config)
      .use(require('ssb-db2/core'))
      .use(require('ssb-classic'))
      .use(require('ssb-box'))
      .use(require('ssb-db2/compat/publish'))
      .use(require('ssb-db2/compat/post'))
      .use(require('ssb-db2/compat'))
      .use(require('ssb-conn'))
      .use(require('ssb-friends'))
      .use(require('ssb-ebt'))
      .use(require('ssb-replication-scheduler'))
      .use(require('./ssb-partial-replication')) // tangles
      .use(require('./simple-ooo'))
      .use(require('ssb-ws'))
      .use(require('ssb-room-client'))
      .use(require('ssb-no-auth'))
      .use(require("./simple-blobs"))

  if (extraModules)
    secretStack = extraModules(secretStack)

  var r = secretStack()

  r.on('rpc:connect', function (rpc, isClient) {
    console.log("connected to:", rpc.id)

    let timer

    // the problem is that the browser will close a connection after
    // 30 seconds if there is no activity, the default ping "timeout"
    // in ssb-gossip (and ssb-conn) is 5 minutes.
    //
    // tunnel (and rooms) is much better, it will give us back a pong
    // right after calling, so we can choose how often to call to keep
    // the connection alive
    function ping() {
      rpc.tunnel.ping(function (err, _ts) {
        if (err) return console.error(err)
        clearTimeout(timer)
        timer = setTimeout(ping, 10e3)
      })
    }

    ping()
  })

  return r
}
