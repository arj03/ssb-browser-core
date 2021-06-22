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
      hops: 2,
      hookReplicate: false
    },
    connections: {
      incoming: {
        tunnel: [{ scope: 'public', transform: 'shs' }],
        dht: [{ scope: 'public', transform: 'shs' }]
      },
      outgoing: {
        net: [{ transform: 'shs' }],
        ws: [{ transform: 'shs' }, { transform: 'noauth' }],
        tunnel: [{ transform: 'shs' }],
        dht: [{ transform: 'shs' }]
      }
    },
    path: dir,
    timers: {
      inactivity: 30e3
    },
    conn: {
      autostart: false,
      hops: 1,
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
      .use(require('ssb-db2/db'))
      .use(require('ssb-db2/compat'))
      .use(require('ssb-friends'))
      .use(require('ssb-ebt'))
      .use(require('./ssb-partial-replication'))
      .use(require('./simple-ooo'))
      .use(require('ssb-ws'))
      .use(require('ssb-conn'))
      .use(require('ssb-room-client'))
      .use(require('ssb-no-auth'))
      .use(require("./simple-blobs"))
      .use(require('ssb-dht-invite'))

  if (extraModules)
    secretStack = extraModules(secretStack)

  var r = secretStack()

  function rpcSync(rpc) {
    if (SSB.feedSyncer.syncing.value)
      ; // only one can sync at a time
    else if (SSB.feedSyncer.inSync())
      helpers.EBTSync(rpc)
    else
      helpers.fullSync(rpc)
  }

  r.sync = function(rpc) {
    if (localStorage["/.ssb-lite/restoreFeed"] === "true") {
      SSB.feedSyncer.syncing.set(true)
      SSB.syncFeedFromSequence(SSB.net.id, 0, () => {
        SSB.feedSyncer.syncing.set(false)
        rpcSync(rpc)
      })
      delete localStorage["/.ssb-lite/restoreFeed"]
    } else
      rpcSync(rpc)
  }

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

    let connPeers = Array.from(SSB.net.conn.hub().entries())
    connPeers = connPeers.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
    var peer = connPeers.find(x => x.data.key == rpc.id)
    if (!peer || peer.data.type === 'room') return

    if (isClient) {
      console.log("syncing with", rpc.id)
      r.sync(rpc)
    }
  })

  r.on('replicate:finish', function () {
    console.log("finished ebt replicate")
  })

  r.connectAndRemember = function(addr, data) {
    r.conn.connect(addr, data, (err, rpc) => {
      r.conn.remember(addr, Object.assign(data, { autoconnect: true }))
    })
  }

  r.directConnect = function(addr, cb) {
    r.conn.connect(addr, cb)
  }

  return r
}
