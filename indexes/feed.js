/*
 format:

 id => {
   latestSequence,
   syncedProfile,
   syncedContacts,
   fullReplica
 }
*/

module.exports = function () {
  var state = {}
  var writer = null;

  function load() {
    if (localStorage['feed.json'])
      state = JSON.parse(localStorage['feed.json'])
  }

  function save() {
    if (!writer) {
      writer = setTimeout(() => {
        writer = null
        localStorage['feed.json'] = JSON.stringify(state)
      }, 1000)
    }
  }

  return {
    updateState: function(feedId, updateFeedState) {
      let feedState = state[feedId] || {}

      if (updateFeedState.lastestSequence)
        feedState.lastestSequence = updateFeedState.lastestSequence
      if (updateFeedState.syncedProfile)
        feedState.syncedProfile = updateFeedState.syncedProfile
      if (updateFeedState.syncedContacts)
        feedState.syncedContacts = updateFeedState.syncedContacts
      if (updateFeedState.fullReplica)
        feedState.fullReplica = updateFeedState.fullReplica

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

    load
  }
}
