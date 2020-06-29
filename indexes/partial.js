/*
 format:
 id => {
   syncedProfile,
   syncedContacts,
   syncedMessages,
 }
*/

module.exports = function () {
  var state = {}

  // FIXME: refactor this into module
  var writer = null;
  const filename = 'partial.json'
  function load() {
    if (localStorage[filename])
      state = JSON.parse(localStorage[filename])
  }

  function save() {
    if (!writer) {
      writer = setTimeout(() => {
	writer = null
	localStorage[filename] = JSON.stringify(state)
      }, 1000)
    }
  }

  return {
    updateState: function(feedId, updateFeedState) {
      let feedState = state[feedId] || {}

      if (updateFeedState.syncedProfile)
	feedState.syncedProfile = updateFeedState.syncedProfile
      if (updateFeedState.syncedContacts)
	feedState.syncedContacts = updateFeedState.syncedContacts
      if (updateFeedState.syncedMesssages)
	feedState.syncedMesssages = updateFeedState.syncedMesssages

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
