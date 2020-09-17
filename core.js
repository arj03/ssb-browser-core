exports.init = function (dir, config) {
  const pull = require('pull-stream')

  const EventEmitter = require('events')
  SSB = {
    events: new EventEmitter()
  }

  // outside browser
  if (typeof localStorage === "undefined" || localStorage === null) {
    const path = require('path')
    const fs = require('fs')

    if (!fs.existsSync(dir))
      fs.mkdirSync(dir)

    var LocalStorage = require('node-localstorage').LocalStorage
    localStorage = new LocalStorage(path.join(dir, 'localstorage'))
  }

  const s = require('sodium-browserify')
  s.events.on('sodium-browserify:wasm loaded', function() {

    console.log("wasm loaded")

    var net = require('./net').init(dir, config)
    var db = require('./db').init(dir, config)

    console.log("my id: ", net.id)

    var helpers = require('./core-helpers')

    var validate = require('ssb-validate')
    var state = validate.initial()

    // restore current state
    db.getAllLatest((err, last) => {
      // copy to so we avoid weirdness, because this object
      // tracks the state coming in to the database.
      for (var k in last) {
        state.feeds[k] = {
          id: last[k].id,
          timestamp: last[k].timestamp,
          sequence: last[k].sequence,
          queue: []
        }
      }
    })

    SSB = Object.assign(SSB, {
      db,
      net,
      dir,

      getPeer: helpers.getPeer,

      validate,
      state,

      removeDB: helpers.removeDB,
      removeIndexes: helpers.removeIndexes,
      removeBlobs: helpers.removeBlobs,

      box: require('ssb-keys').box,
      blobFiles: require('ssb-blob-files'),

      // sbot convenience wrappers
      publish: function(msg, cb) {
        state.queue = []
        state = validate.appendNew(state, null, net.config.keys, msg, Date.now())
        console.log(state.queue[0])
        db.add(state.queue[0].value, (err, data) => {
          net.post(data.value) // tell ebt
          cb(err, data)
        })
      },

      // config
      hops: 1, // this means download full log for hops and partial logs for hops + 1
    })

    // helper for rooms to allow connecting to friends directly
    SSB.net.friends = {
      hops: function(cb) {
        db.contacts.getGraphForFeed(SSB.net.id, (err, graph) => {
          let hops = {}
          graph.following.forEach(f => hops[f] = 1)
          graph.extended.forEach(f => hops[f] = 2)
          cb(err, hops)
        })
      }
    }

    SSB.net.conn.start()

    SSB.events.emit("SSB: loaded")
  })
}
