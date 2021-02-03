exports.init = function (dir, config) {
  const FeedSyncer = require('./feed-syncer')
  const pull = require('pull-stream')

  const EventEmitter = require('events')
  SSB = {
    events: new EventEmitter(),
    dbOperators: require('ssb-db2/operators')
  }
  SSB.dbOperators.mentions = require('ssb-db2/operators/full-mentions')

  const s = require('sodium-browserify')
  s.events.on('sodium-browserify:wasm loaded', function() {

    console.log("wasm loaded")

    var net = require('./net').init(dir, config)

    console.log("my id: ", net.id)

    var helpers = require('./core-helpers')

    const Partial = require('./partial')
    const partial = Partial(dir)

    SSB = Object.assign(SSB, {
      db: net.db,
      net,
      dir,
      feedSyncer: FeedSyncer(net, partial),

      getPeer: helpers.getPeer,

      removeDB: helpers.removeDB,
      removeIndexes: helpers.removeIndexes,
      removeBlobs: helpers.removeBlobs,

      getGraph: helpers.getGraph,
      getGraphSync: helpers.getGraphSync,

      box: require('ssb-keys').box,
      blobFiles: require('ssb-blob-files'),

      partial,

      // config
      hops: 1, // this means download full log for hops and partial logs for hops + 1
    })

    // delay startup a bit
    setTimeout(() => {
      SSB.net.conn.start()
    }, 2000)

    SSB.events.emit("SSB: loaded")
  })
}
