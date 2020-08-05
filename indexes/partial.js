/*
 format:
 id => {
   full,
   syncedProfile,
   syncedContacts,
   syncedMessages,
 }
*/

const AtomicFile = require('atomic-file')
const path = require('path')

module.exports = function (dir) {
  const queue = require('../waiting-queue')()
  var state = {}

  var f = AtomicFile(path.join(dir, "indexes/partial.json"))

  f.get((err, data) => {
    if (data)
      state = data.state

    queue.done(null, state)
  })

  function save() {
    f.set({ state }, () => {})
  }

  return {
    updateState: function(feedId, updateFeedState) {
      let feedState = state[feedId] || {}
      state[feedId] = Object.assign(feedState, updateFeedState)
      save()
    },

    removeFeed: function(feedId) {
      delete state[feedId]
      save()
    },

    get: queue.get,
    getSync: function() {
      return state
    },

    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
