module.exports = function (log, partial, contacts) {
  const pull = require('pull-stream')

  function getFeeds(cb) {
    contacts.getHops((err, hops) => {
      let fullFeeds = []
      let partialFeeds = []
      let blocking = []
      const ssbId = SSB.net.id

      for (var relation in hops[ssbId]) {
        if (hops[ssbId][relation] === 1)
          fullFeeds.push(relation)
        else if (hops[ssbId][relation] === -1)
          blocking.push(relation)
      }

      for (var feedId in hops) {
        if (feedId === ssbId)
          continue

        for (var relation in hops[feedId]) {
          if (hops[feedId][relation] === 1) {
            if (relation === ssbId)
              continue

            if (fullFeeds.includes(relation))
              continue

            if (blocking.includes(relation))
              continue
            
            partialFeeds.push(relation)
          }
        }
      }

      cb(err, { fullFeeds, partialFeeds: [...new Set(partialFeeds)] })
    })
  }

  function syncMessages(feed, key, rpcCall, partialState, cb) {
    if (!partialState[feed] || !partialState[feed][key]) {
      pull(
        rpcCall,
        pull.asyncMap(SSB.db.validateAndAddOOO),
        pull.collect((err, msgs) => {
          if (err) {
            console.error(err.message)
            return cb(err)
          }

          SSB.state.queue = []
          var newState = {}
          newState[key] = true
          partial.updateState(feed, newState)
          cb(null, feed)
        })
      )
    } else
      cb(null, feed)
  }
  
  function syncFeeds(cb) {
    let partialState = partial.get()
    getFeeds((err, feeds) => {
      SSB.connected((rpc) => {
        pull(
          pull.values(feeds.fullFeeds),
          pull.asyncMap((feed, cb) => {
            if (!partialState[feed] || !partialState[feed]['full']) {
              pull(
                rpc.partialReplication.getFeed({ id: feed, seq: 0, keys: false }),
                pull.asyncMap(SSB.db.validateAndAdd),
                pull.collect((err) => {
                  if (err) throw err
                  
                  SSB.state.queue = []
                  partial.updateState(feed, { full: true })
                  cb()
                })
              )
            } else
              cb()
          }),
          pull.collect(() => {
            pull(
              pull.values(feeds.partialFeeds),
              pull.asyncMap((feed, cb) => {
                syncMessages(feed, 'syncedMessages',
                             rpc.partialReplication.getFeedReverse({ id: feed, keys: false, limit: 25 }),
                             partialState, cb)
              }),
              pull.asyncMap((feed, cb) => {
                syncMessages(feed, 'syncedProfile',
                             rpc.partialReplication.getMessagesOfType({id: feed, type: 'about'}),
                             partialState, cb)
              }),
              pull.asyncMap((feed, cb) => {
                syncMessages(feed, 'syncedContacts',
                             rpc.partialReplication.getMessagesOfType({id: feed, type: 'contact'}),
                             partialState, cb)
              }),
              pull.collect(() => {
                console.log("done")
                if (cb) cb()
              })
            )
          })
        )
      })
    })
  }
  
  return {
    syncFeeds
  }
}
