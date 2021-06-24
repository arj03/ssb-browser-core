const pull = require('pull-stream')
const validate = require('ssb-validate')
const FastPriorityQueue = require('fastpriorityqueue')
const Partial = require('./partial')

exports.name = 'feedReplication'
exports.version = '1.0.0'
exports.manifest = {
  request: 'sync',
  partialStatus: 'sync'
}
exports.permissions = {
  anonymous: {allow: []}
}

exports.init = function (sbot, config) {
  console.log("loading feed replication!")

  const partial = Partial(config.path)

  let partialState = null

  partial.get((err, state) => {
    partialState = state

    runQueue()
  })

  function syncMessages(feed, key, rpcCall, cb) {
    if (!partialState[feed] || !partialState[feed][key]) {
      // FIXME: this will be much better with rusty validation
      let adder = sbot.db.addOOO // this should be default, but is too slow
      if (key == 'syncedMessages') { // false for go!
        const oooState = validate.initial()
        adder = (msg, cb) => sbot.db.addOOOStrictOrder(msg, oooState, cb)
      } else { // hack, FIXME: creates duplicate messages
        adder = (msg, cb) => {
          const oooState = validate.initial()
          sbot.db.addOOOStrictOrder(msg, oooState, cb)
        }
      }

      pull(
        rpcCall(),
        pull.asyncMap(adder),
        pull.collect((err, msgs) => {
          if (err) {
            console.error(err.message)
            return cb(err)
          }

          var newState = {}
          newState[key] = true
          partial.updateState(feed, newState, (err) => { cb(err, feed) })
        })
      )
    } else
      cb(null, feed)
  }

  let synced = {}
  
  function syncFeed(feed, hops, cb) {
    // idempotent
    if (synced[feed]) return cb()

    synced[feed] = 1

    if (hops === 0) { // selfie
      // move along
      cb()
    } else if (hops === 1) {
      console.log("full replication of", feed)
      sbot.db.getAllLatest((err, latest) => {
        // fixme: not super efficient on already synced full feeds
        const latestSeq = latest[feed] ? latest[feed].sequence + 1 : 0
        pull(
          rpc.partialReplication.getFeed({ id: feed, seq: latestSeq, keys: false }),
          pull.asyncMap(sbot.db.add),
          pull.collect((err) => {
            if (err) return cb(err)

            waitingEBTRequests.set(feed, true)
            partial.updateState(feed, { full: true }, cb)
          })
        )
      })
    } else {
      //console.log("partial replication of", feed)
      pull(
        pull.values([feed]),
        pull.asyncMap((feed, cb) => {
          syncMessages(feed, 'syncedMessages',
                       () => rpc.partialReplication.getFeedReverse({ id: feed, keys: false, limit: 25 }), cb)
        }),
        pull.asyncMap((feed, cb) => {
          syncMessages(feed, 'syncedProfile',
                       () => rpc.partialReplication.getMessagesOfType({ id: feed, type: 'about' }), cb)
        }),
        pull.asyncMap((feed, cb) => {
          syncMessages(feed, 'syncedContacts',
                       () => rpc.partialReplication.getMessagesOfType({ id: feed, type: 'contact' }), cb)
        }),
        pull.collect((err) => {
          if (err) return cb(err)

          waitingEBTRequests.set(feed, true)
          cb()
        })
      )
    }
  }
  
  let rpc

  sbot.on('rpc:connect', function (rpcConnect, isClient) {
    // FIXME: a better way to utilize multiple connections

    /* FIXME: does't work, concurrency!
    let connPeers = Array.from(sbot.conn.hub().entries())
    connPeers = connPeers.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
    var peer = connPeers.find(x => x.data.key == rpcConnect.id)
    console.log(connPeers)
    console.log(peer)
    if (!peer || peer.data.type === 'room') return
    */

    rpc = rpcConnect

    runQueue()
  })

  // queue of { feed, hops, validFrom }
  var queue = new FastPriorityQueue(function(lhs, rhs) {
    return rhs.hops > lhs.hops
  })

  // wrapper around EBT
  function request(destination, hops, replicating) {
    if (replicating)
      queue.add({ feed: destination, hops, validFrom: (+new Date()) + 200 })
    else {
      waitingEBTRequests.delete(destination)
      queue.removeMany((e) => e.feed === destination)
      sbot.ebt.request(destination, false)
    }

    runQueue()
  }

  let concurrent = 0
  let waitingQueue = false
  let waitingEBTRequests = new Map()

  function endWaitingQueue() {
    waitingQueue = false
    runQueue()
  }

  function runQueue() {
    // prerequisites
    if (queue.isEmpty()) {
      console.log(new Date())

      sbot.db.onDrain('ebt', () => {
        for (let feed of waitingEBTRequests.keys())
          sbot.ebt.request(feed, true)
        waitingEBTRequests.clear()
      })

      return
    }
    if (partialState === null) return
    if (!rpc) return

    if (concurrent === 5) return

    let el = queue.peek()

    if (el.validFrom < +new Date()) {
      queue.poll()
      ++concurrent
      syncFeed(el.feed, el.hops, () => {
        --concurrent
        runQueue()
      })

      runQueue()
    } else if (!waitingQueue) {
      waitingQueue = true
      setTimeout(endWaitingQueue, 100)
    }
  }

  function partialStatus() {
    let partialState = partial.getSync()

    // full
    let fullSynced = 0
    let totalFull = 0

    // partial
    let profilesSynced = 0
    let contactsSynced = 0
    let messagesSynced = 0
    let totalPartial = 0

    for (var relation in partialState) {
      const status = partialState[relation]
      if (status.full)
        fullSynced += 1

      if (status.syncedProfile)
        profilesSynced += 1
      if (status.syncedContacts)
        contactsSynced += 1
      if (status.syncedMessages)
        messagesSynced += 1

      totalPartial += 1
    }

    return {
      totalPartial,
      profilesSynced,
      contactsSynced,
      messagesSynced,
      totalFull,
      fullSynced,
    }
  }

  return {
    request,
    partialStatus
  }
}
