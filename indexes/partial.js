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
  var state = {}

  var f = AtomicFile(path.join(dir, "indexes/partial.json"))

  function load() {
    f.get((err, data) => {
      if (data)
        state = data.state
    })
  }

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

    get: function() {
      if (Object.keys(state).length == 0)
        load()
      return state
    },

    load,
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
