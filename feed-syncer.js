module.exports = function (partial, contacts) {
  const pull = require('pull-stream')
  const paramap = require('pull-paramap')

  function syncMessages(feed, key, rpcCall, partialState, cb) {
    if (!partialState[feed] || !partialState[feed][key]) {
      pull(
        rpcCall(),
        pull.asyncMap(SSB.db.validateAndAddOOO),
        pull.collect((err, msgs) => {
          if (err) {
            console.error(err.message)
            return cb(err)
          }

          SSB.state.queue = []
          var newState = {}
          newState[key] = true
          partial.updateState(feed, newState, (err) => { cb(err, feed) })
        })
      )
    } else
      cb(null, feed)
  }

  var syncing = false
  
  function syncFeeds(rpc, cb) {
    syncing = true
    console.log("syncing feeds")
    partial.get((err, partialState) => {
      contacts.getGraphForFeed(SSB.net.id, (err, graph) => {
        console.time("full feeds")
        pull(
          pull.values(graph.following),
          pull.asyncMap((feed, cb) => {
            if (!partialState[feed] || !partialState[feed]['full']) {
              pull(
                rpc.partialReplication.getFeed({ id: feed, seq: 0, keys: false }),
                pull.asyncMap(SSB.db.validateAndAdd),
                pull.collect((err) => {
                  if (err) throw err

                  SSB.state.queue = []
                  partial.updateState(feed, { full: true }, cb)
                })
              )
            } else
              cb()
          }),
          pull.collect(() => {
            console.timeEnd("full feeds")

            console.time("partial feeds")
            contacts.getGraphForFeed(SSB.net.id, (err, graph) => {
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
                  contacts.getGraphForFeed(SSB.net.id, (err, newGraph) => {
                    if (JSON.stringify(graph) === JSON.stringify(newGraph)) {
                      syncing = false

                      if (cb) cb()
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
    syncFeeds,
    syncing,
    inSync: function() {
      const partialState = partial.getSync()
      const graph = contacts.getGraphForFeedSync(SSB.net.id)

      // partial
      let totalPartial = 0
      let profilesSynced = 0
      let contactsSynced = 0
      let messagesSynced = 0

      // full
      let fullSynced = 0
      let totalFull = 0

      graph.following.forEach(relation => {
        if (partialState[relation] && partialState[relation]['full'])
          fullSynced += 1

        totalFull += 1
      })

      graph.extended.forEach(relation => {
        if (partialState[relation] && partialState[relation]['syncedProfile'])
          profilesSynced += 1
        if (partialState[relation] && partialState[relation]['syncedContacts'])
          contactsSynced += 1
        if (partialState[relation] && partialState[relation]['syncedMessages'])
          messagesSynced += 1

        totalPartial += 1
      })

      return totalPartial == messagesSynced &&
        totalPartial == contactsSynced &&
        totalPartial == profilesSynced &&
        totalFull == fullSynced
    }
  }
}
