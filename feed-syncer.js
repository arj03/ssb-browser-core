module.exports = function (net, partial) {
  const pull = require('pull-stream')
  const paramap = require('pull-paramap')
  const validate = require('ssb-validate')
  const Obz = require('obz')

  // cache for sync calls
  let lastGraph = { following: [], extended: [] }

  function convertHopsIntoGraph(hops, isSelf = true) {
    const following = []
    const blocking = []
    const extended = []

    const feeds = Object.keys(hops)
    for (var i = 0; i < feeds.length; ++i) {
      const feed = feeds[i]
      if (hops[feed] == 1)
        following.push(feed)
      else if (hops[feed] > 0 && hops[feed] <= net.config.friends.hops)
        extended.push(feed)
      else if (hops[feed] == -1) // FIXME: respect hops setting
        blocking.push(feed) 
    }

    if (isSelf) {
      lastGraph = { following, extended, blocking }
      return lastGraph
    } else return { following, extended, blocking }
  }

  function syncMessages(feed, key, rpcCall, partialState, cb) {
    if (!partialState[feed] || !partialState[feed][key]) {
      let adder = net.db.addOOO // this should be default, but is too slow
      if (key == 'syncedMessages') { // false for go!
        const oooState = validate.initial()
        adder = (msg, cb) => net.db.addOOOStrictOrder(msg, oooState, cb)
      } else { // hack, FIXME: creates duplicate messages
        adder = (msg, cb) => {
          const oooState = validate.initial()
          net.db.addOOOStrictOrder(msg, oooState, cb)
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

  var syncing = Obz(false)

  function ebtHasData(feed, cb) {
    net.ebt.peerStatus((err, status) => {
      if (err) return cb(err)

      cb(null, status.seq > 0)
    })
  }

  function ebtCallbackWhenData(feed, cb) {
    ebtHasData(feed, (err, hasData) => {
      if (hasData) return cb()

      setTimeout(1000, ebtCallbackWhenData)
    })
  }

  function onboardViaEBT(rpc, feed, cb) {
    net.ebt.request(feed, true)
    ebtCallbackWhenData(feed, cb)
  }
  
  function syncFeeds(rpc, cb) {
    syncing.set(true)
    console.log("syncing feeds")
    partial.get((err, partialState) => {
      net.friends.hops((err, hops) => {
        const graph = convertHopsIntoGraph(hops)
        console.time("full feeds")
        pull(
          pull.values(graph.following),
          pull.asyncMap((feed, cb) => {
            if (!partialState[feed] || !partialState[feed]['full']) {
              net.db.getAllLatest((err, latest) => {
                const latestSeq = latest[feed] ? latest[feed].sequence + 1 : 0
                pull(
                  rpc.partialReplication.getFeed({ id: feed, seq: latestSeq, keys: false }),
                  pull.asyncMap(net.db.add),
                  pull.collect((err) => {
                    if (err) {
                      if (!err.message || err.message.indexOf("is not in list of allowed methods") < 0) throw err

                      // Try it without partial replication.
                      onboardViaEBT(rpc, feed, function() {
                        partial.updateState(feed, { full: true }, cb)
                      })
                    } else {
                      partial.updateState(feed, { full: true }, cb)
                    }
                  })
                )
              })
            } else
              cb()
          }),
          pull.collect(() => {
            console.timeEnd("full feeds")

            console.time("partial feeds")

            net.friends.hops((err, hops) => {
              const graph = convertHopsIntoGraph(hops)

              pull(
                pull.values(graph.extended),
                paramap((feed, cb) => {
                  syncMessages(feed, 'syncedMessages',
                               () => rpc.partialReplication.getFeedReverse({ id: feed, keys: false, limit: 25 }),
                               partialState, cb)
                }, 5),
                paramap((feed, cb) => {
                  syncMessages(feed, 'syncedProfile',
                               () => rpc.partialReplication.getMessagesOfType({id: feed, type: 'about'}),
                               partialState, cb)
                }, 5),
                paramap((feed, cb) => {
                  syncMessages(feed, 'syncedContacts',
                               () => rpc.partialReplication.getMessagesOfType({id: feed, type: 'contact'}),
                               partialState, cb)
                }, 5),
                pull.collect(() => {
                  console.timeEnd("partial feeds")

                  // check for changes that happened while running syncFeeds
                  net.friends.hops((err, hops) => {
                    const newGraph = convertHopsIntoGraph(hops)
                    if (JSON.stringify(graph) === JSON.stringify(newGraph)) {
                      syncing.set(false)

                      if (cb) cb(rpc)
                    }
                    else // sync new changes
                      syncFeeds(rpc, cb)
                  })
                })
              )
            })
          })
        )
      })
    })
  }
  
  return {
    getLastGraph: () => lastGraph,
    convertHopsIntoGraph,
    syncFeeds,
    syncing,
    status: function() {
      const partialState = partial.getSync()

      // full
      let fullSynced = 0
      let totalFull = 0

      // partial
      let profilesSynced = 0
      let contactsSynced = 0
      let messagesSynced = 0
      let totalPartial = 0

      lastGraph.following.forEach(relation => {
        if (partialState[relation] && partialState[relation]['full'])
          fullSynced += 1

        totalFull += 1
      })

      lastGraph.extended.forEach(relation => {
        if (partialState[relation] && partialState[relation]['syncedProfile'])
          profilesSynced += 1
        if (partialState[relation] && partialState[relation]['syncedContacts'])
          contactsSynced += 1
        if (partialState[relation] && partialState[relation]['syncedMessages'])
          messagesSynced += 1

        totalPartial += 1
      })

      return {
        totalPartial,
        profilesSynced,
        contactsSynced,
        messagesSynced,
        totalFull,
        fullSynced,
      }
    },
    inSync: function() {
      const partialState = partial.getSync()

      // partial
      let totalPartial = 0
      let profilesSynced = 0
      let contactsSynced = 0
      let messagesSynced = 0

      // full
      let fullSynced = 0
      let totalFull = 0

      lastGraph.following.forEach(relation => {
        if (partialState[relation] && partialState[relation]['full'])
          fullSynced += 1

        totalFull += 1
      })

      lastGraph.extended.forEach(relation => {
        if (partialState[relation] && partialState[relation]['syncedProfile'])
          profilesSynced += 1
        if (partialState[relation] && partialState[relation]['syncedContacts'])
          contactsSynced += 1
        if (partialState[relation] && partialState[relation]['syncedMessages'])
          messagesSynced += 1

        totalPartial += 1
      })

      if (totalPartial === 0 && totalFull === 0)
        return false

      return totalPartial == messagesSynced &&
        totalPartial == contactsSynced &&
        totalPartial == profilesSynced &&
        totalFull == fullSynced
    }
  }
}
