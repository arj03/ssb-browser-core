const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-sync'

require("setimmediate") // for webpack :(

require('../core.js').init(dir)

SSB.events.on('SSB: loaded', function() {

  const { where, and, isPublic, type, paginate, descending, toCallback } = SSB.dbOperators

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // wtf
  // var remoteAddress = 'wss://between-two-worlds.dk:8990~noauth:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='
  var remoteAddress = 'wss://between-two-worlds.dk:8989~shs:lbocEWqF2Fg6WMYLgmfYvqJlMfL7hiqVAV6ANjHWNw8='
  // var remoteAddress = 'ws://between-two-worlds.dk:8989~shs:mvYGZ9GhdAHTXP+QSgQmpdu7fZBwzZTRAlpTiIClt1E='
  // var remoteAddress = 'ws://localhost:8989~shs:mvYGZ9GhdAHTXP+QSgQmpdu7fZBwzZTRAlpTiIClt1E='
  // var remoteAddress = 'ws://localhost:8989~shs:6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0='

  //SSB.net.id = '@VIOn+8a/vaQvv/Ew3+KriCngyUXHxHbjXkj4GafBAY0=.ed25519'

  const validate2 = require('ssb-validate2-rsjs')
  validate2.ready(() => {
  
  SSB.net.connect(remoteAddress, (err, rpc) => {
    console.time("downloading main profile")

    if (err) console.error(err)
    
    pull(
      rpc.partialReplication.getFeed({
        id: "@VIOn+8a/vaQvv/Ew3+KriCngyUXHxHbjXkj4GafBAY0=.ed25519",
        seq: 0, keys: false
      }),
      pull.asyncMap(SSB.db.add),
      pull.collect((err, msgs) => {
        if (err) throw err
        
        console.timeEnd("downloading main profile")
        console.log(msgs.length)

        console.log("starting sync")
        SSB.feedSyncer.syncFeeds(rpc, () => {
          console.log("db", SSB.db.getStatus())
          console.log("feed", SSB.feedSyncer.status())
          console.time("query")
          SSB.db.query(
            where(
              and(
                type('post'),
                isPublic()
              )
            ),
            paginate(25),
            descending(),
            toCallback((err, answer) => {
              console.timeEnd("query")
              console.log("got", answer.results.length)
              console.log("db", SSB.db.getStatus())
              console.log("feed", SSB.feedSyncer.status())
            })
          )
        })
      })
    )
  })
  })
})
