module.exports = function (log, partial, contacts) {
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
  
  function syncFeeds(cb) {
    console.log("syncing feeds")
    partial.get((err, partialState) => {
      contacts.getGraphForFeed(SSB.net.id, (err, graph) => {
        SSB.connected((rpc) => {
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
                        const remove = contacts.onGraphChange(syncFeeds)
                        SSB.net.on('replicate:finish', remove)

                        if (cb) cb()
                      }
                      else
                        syncFeeds(cb)
                    })
                  })
                )
              })
            })
          )
        })
      })
    })
  }
  
  return {
    syncFeeds
  }
}
