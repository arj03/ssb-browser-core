const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-sync'

require('rimraf').sync(dir)

require('../core.js').init(dir)

SSB.events.on('SSB: loaded', function() {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // wtf
  //var remoteAddress = 'wss://between-two-worlds.dk:8990~noauth:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='
  var remoteAddress = 'wss://between-two-worlds.dk:8989~shs:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='

  SSB.net.connect(remoteAddress, (err, rpc) => {
    console.time("downloading messages")

    // node (no db, no auth): 2 sek
    // node (no db): 3 sek
    // node: 4 sek
    
    // browser (no db, no auth): 5.5 sek
    // browser (no db): 9.5 sek
    // browser: 17 sek

    // no decrypt: (300ms)
    // no bipf encode: (300ms)

    function writeStatus() {
      setTimeout(() => {
        console.log(SSB.db.getStatus())
        writeStatus()
      }, 200)
    }
    
    pull(
      rpc.partialReplication.getFeed({
        id: "@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519",
        seq: 0, keys: false
      }),
      pull.asyncMap(SSB.db.validateAndAddOOO),
      pull.collect((err, msgs) => {
        if (err) throw err
        
        console.timeEnd("downloading messages")
        console.log(msgs.length)
        writeStatus()
      })
    )
  })
})
