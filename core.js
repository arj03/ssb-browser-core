exports.init = function (dir, config) {
  const FeedSyncer = require('./feed-syncer')

  const EventEmitter = require('events')
  SSB = {
    events: new EventEmitter()
  }

  // outside browser
  /*
  if (typeof localStorage === "undefined" || localStorage === null) {
    const path = require('path')
    const fs = require('fs')

    if (!fs.existsSync(dir))
      fs.mkdirSync(dir)

    var LocalStorage = require('node-localstorage').LocalStorage
    localStorage = new LocalStorage(path.join(dir, 'localstorage'))
  }
  */

  const s = require('sodium-browserify')
  s.events.on('sodium-browserify:wasm loaded', function() {

    console.log("wasm loaded")

    var net = require('./net').init(dir, config)

    console.log("my id: ", net.id)

    var helpers = require('./core-helpers')

    SSB = Object.assign(SSB, {
      db: net.db,
      net,
      dir,
      feedSyncer: FeedSyncer(dir, net.id, net.db),

      getPeer: helpers.getPeer,

      removeDB: helpers.removeDB,
      removeIndexes: helpers.removeIndexes,
      removeBlobs: helpers.removeBlobs,

      box: require('ssb-keys').box,
      blobFiles: require('ssb-blob-files'),

      // sbot convenience wrappers
      publish: net.db.publish,

      // config
      hops: 1, // this means download full log for hops and partial logs for hops + 1
    })

    // helper for rooms to allow connecting to friends directly
    SSB.net.friends = {
      hops: function(cb) {
        net.db.getIndex('contacts').getGraphForFeed(SSB.net.id, (err, graph) => {
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
