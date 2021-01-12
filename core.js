exports.init = function (dir, config) {
  const FeedSyncer = require('./feed-syncer')

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

      box: require('ssb-keys').box,
      blobFiles: require('ssb-blob-files'),

      partial,

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
      },
      isFollowing: function(opts, cb) {
          // See https://github.com/ssbc/ssb-friends/blob/master/index.js#L33
          console.log('isFollowing shim until ssb-friends can be ported to new database');
          cb(null, net.db.getIndex('contacts').isFollowing(opts.source, opts.dest));
        }
    }

    SSB.net.conn.start()

    SSB.events.emit("SSB: loaded")
  })
}
