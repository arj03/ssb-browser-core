const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-sync'

require('rimraf').sync(dir)

require('../core.js').init(dir)

SSB.events.on('SSB: loaded', function() {

  /*
  SSB.db.jitdb.onReady(() => {
    var query = {
      type: 'EQUAL',
      data: {
        seek: SSB.db.jitdb.seekType,
        value: Buffer.from('post'),
        indexType: "type"
      }
    }

    if (this.onlyThreads) {
      query = {
        type: 'AND',
        data: [{
          type: 'EQUAL',
          data: {
            seek: SSB.db.jitdb.seekType,
            value: Buffer.from('post'),
            indexType: "type"
          }
        }, {
          type: 'EQUAL',
          data: {
            seek: SSB.db.jitdb.seekRoot,
            value: undefined,
            indexType: "root"
          }
        }]
      }
    }

    console.time("latest messages")
    SSB.db.jitdb.query(query, 0, 50, (err, results) => {
      console.timeEnd("latest messages")
      console.log(results.filter(msg => !msg.value.meta))
    })
  })
  
  return
  */
  
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // wtf
  //SSB.remoteAddress = 'wss://between-two-worlds.dk:8990~noauth:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='
  SSB.remoteAddress = 'wss://between-two-worlds.dk:8989~shs:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='

  SSB.net.id = '@VIOn+8a/vaQvv/Ew3+KriCngyUXHxHbjXkj4GafBAY0=.ed25519'
  
  SSB.connected((rpc) => {
    console.time("downloading main profile")

    pull(
      rpc.partialReplication.getFeed({
        id: "@VIOn+8a/vaQvv/Ew3+KriCngyUXHxHbjXkj4GafBAY0=.ed25519",
        seq: 0, keys: false
      }),
      pull.asyncMap(SSB.db.validateAndAddOOO),
      pull.collect((err, msgs) => {
        if (err) throw err
        
        console.timeEnd("downloading main profile")
        console.log(msgs.length)

        console.log("starting sync")
        SSB.db.feedSyncer.syncFeeds(() => {})
      })
    )
  })
})
