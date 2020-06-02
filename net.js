const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const ssbKeys = require('ssb-keys')

const path = require('path')

exports.init = function(dir, overwriteConfig) {
  var keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

  var config = Object.assign({
    caps: { shs: Buffer.from(caps.shs, 'base64') },
    keys,
    connections: {
      incoming: {
	tunnel: [{ transform: 'shs' }]
      },
      outgoing: {
	net: [{ transform: 'shs' }],
	ws: [{ transform: 'shs' }],
	tunnel: [{ transform: 'shs' }]
      }
    },
    path: dir,
    timers: {
      inactivity: 30e3
    },
    tunnel: {
      logging: true
    },
    ebt: {
      logging: true
    },
    blobs: {
      sympathy: 0, //sympathy controls whether you'll replicate
      stingy: false,
      pushy: 3,
      max: 256*1024
    }
  }, overwriteConfig)

  var r = SecretStack(config)
  .use(require('./ssb-db'))
  .use(require('./ssb-partial-replication'))
  .use(require('./simple-ooo'))
  .use(require('ssb-ws'))
  .use(require('ssb-ebt'))
  .use(require('ssb-tunnel'))
  .use(require('./tunnel-message'))
  .use(require("./simple-blobs"))
  ()

  var timer

  r.on('rpc:connect', function (rpc, isClient) {
    console.log("connected to:", rpc.id)

    function ping() {
      rpc.tunnel.ping(function (err, _ts) {
	if (err) return console.error(err)
	clearTimeout(timer)
	timer = setTimeout(ping, 10e3)
      })
    }

    ping()
  })

  r.on('replicate:finish', function () {
    console.log("finished ebt replicate")
  })

  r.gossip = {
    connect: function(addr, cb) {
      // hack for ssb-tunnel
      r.connect(SSB.remoteAddress, cb)
    }
  }

  return r
}
