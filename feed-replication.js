const pull = require('pull-stream')
const validate = require('ssb-validate')
const FastPriorityQueue = require('fastpriorityqueue')
const Partial = require('./partial')

exports.name = 'feedReplication'
exports.version = '1.0.0'
exports.manifest = {
  request: 'sync',
  updatePartialState: 'async',
  partialStatus: 'sync',
  inSync: 'sync'
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
      pull(
        rpcCall(),
        pull.collect((err, msgs) => {
          if (err) {
            console.error(err.message)
            return cb(err)
          }

          // FIXME: prune contact and about from latest 25 messages
          sbot.db.addOOOBatch(msgs, (err) => {
            if (err) return cb(err)
            var newState = {}
            newState[key] = true
            partial.updateState(feed, newState, (err) => { cb(err, feed) })
          })
        })
      )
    } else
      cb(null, feed)
  }

  let synced = {}

  function getLatestSequence(feed, cb) {
    pull(
      sbot.db.getAllLatest(),
      pull.collect((err, latest) => {
        if (err) return cb(err)

        const l = latest.find(l => l.key === feed)
        cb(null, l ? l.sequence + 1 : 0)
      })
    )
  }
  
  function syncFeed(rpc, feed, hops, cb) {
    // idempotent
    if (synced[feed]) return cb()

    synced[feed] = 1

    if (hops === 0) {
      cb() // move along selfie
    } else if (hops === 1) {
      if (!partialState[feed] || !partialState[feed]['full']) {
        console.log("full replication of", feed)
        getLatestSequence(feed, (err, latestSeq) => {
          pull(
            rpc.partialReplication.getFeed({ id: feed, seq: latestSeq, keys: false }),
            //pull.asyncMap(sbot.db.add),
            pull.collect((err, messages) => {
              if (err) return cb(err)

              sbot.db.addBatch(messages, () => {
                waitingEBTRequests.set(feed, true)
                partial.updateState(feed, { full: true }, cb)
              })
            })
          )
        })
      } else
        cb()
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
  
  pull(
    sbot.conn.hub().listen(),
    pull.filter(event => {
      const okType = event.type === 'connected' || event.type === 'disconnected'
      if (okType && event.details) {
        let connPeers = Array.from(sbot.conn.hub().entries())
        connPeers = connPeers.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
        const peer = connPeers.find(x => x.data.key == event.details.rpc.id)
        return peer && peer.data.type !== 'room'
      } else
        return false
    }),
    pull.drain(event => {
      if (event.type === 'connected')
        remotes.set(event.details.rpc, 0)
      else
        remotes.delete(event.details.rpc)
      runQueue()
    })
  )

  // queue of { feed, hops, validFrom }
  var queue = new FastPriorityQueue(function(lhs, rhs) {
    return rhs.hops > lhs.hops
  })

  let currentHops = {}

  // wrapper around EBT
  function request(destination, hops, replicating) {
    currentHops[destination] = hops

    if (replicating)
      queue.add({ feed: destination, hops, validFrom: (+new Date()) + 200 })
    else {
      waitingEBTRequests.delete(destination)
      queue.removeMany((e) => e.feed === destination)
      sbot.ebt.request(destination, false)
    }

    runQueue()
  }

  let remotes = new Map() // rpc -> concurrent requests
  let waitingQueue = false
  let waitingEBTRequests = new Map()

  function endWaitingQueue() {
    waitingQueue = false
    runQueue()
  }

  function runQueue() {
    // prerequisites
    if (queue.isEmpty()) {
      //console.log(new Date())

      sbot.db.onDrain('ebt', () => {
        for (let feed of waitingEBTRequests.keys())
          sbot.ebt.request(feed, true)
        waitingEBTRequests.clear()
      })

      return
    }
    if (partialState === null) return
    if (remotes.size == 0) return

    let lowest = null
    let concurrentRequests = 0
    for (let [rpc, concurrent] of remotes) {
      if (lowest === null)
        lowest = { rpc, concurrent }
      else if (lowest.concurrent < concurrent)
        lowest = { rpc, concurrent }
      concurrentRequests += concurrent
    }

    if (concurrentRequests === 7) return

    let el = queue.peek()

    if (el.validFrom < +new Date()) {
      queue.poll()

      remotes.set(lowest.rpc, lowest.concurrent + 1)
      syncFeed(lowest.rpc, el.feed, el.hops, () => {
        remotes.set(lowest.rpc, remotes.get(lowest.rpc) - 1)
        setImmediate(runQueue) // don't blow up the stack
      })

      runQueue()
    } else if (!waitingQueue) {
      waitingQueue = true
      setTimeout(endWaitingQueue, 100)
    }
  }

  function updatePartialState(feed, changes, cb) {
    partial.updateState(feed, changes, cb)
  }

  function partialStatus() {
    let partialState = partial.getSync()
    let currentGraph = SSB.convertHopsIntoGraph(currentHops)

    // full
    let totalFull = currentGraph.following.length
    let fullSynced = 0

    // partial
    let totalPartial = currentGraph.extended.length
    let profilesSynced = 0
    let contactsSynced = 0
    let messagesSynced = 0

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

  function getGraph() {
    return SSB.convertHopsIntoGraph(currentHops)
  }

  function inSync() {
    return queue.isEmpty()
  }

  return {
    request,
    updatePartialState,
    partialStatus,
    inSync,
    getGraph
  }
}
