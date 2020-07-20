/*
 format:
 id => {
   syncedProfile,
   syncedContacts,
   syncedMessages,
 }
*/

const AtomicFile = require('atomic-file')

module.exports = function () {
  var state = {}

  var f = AtomicFile("indexes/partial.json")

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

      if (updateFeedState.syncedProfile)
        feedState.syncedProfile = updateFeedState.syncedProfile
      if (updateFeedState.syncedContacts)
        feedState.syncedContacts = updateFeedState.syncedContacts
      if (updateFeedState.syncedMessages)
        feedState.syncedMessages = updateFeedState.syncedMessages

      state[feedId] = feedState

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
