/*
 format:
 id => {
   full,
   syncedProfile,
   syncedContacts,
   syncedMessages,
 }
*/

module.exports = function (dir) {
  const AtomicFile = require('atomic-file')
  const debounce = require('lodash.debounce')
  const path = require('path')
  const DeferredPromise = require('p-defer')

  const stateLoaded = DeferredPromise()
  var state = {}

  var f = AtomicFile(path.join(dir, "indexes/partial.json"))

  function get(cb) {
    f.get((err, data) => {
      if (data)
        state = data.state

      stateLoaded.resolve()
      cb(err, state)
    })
  }

  function atomicSave()
  {
    f.set({ state }, (err) => {
      if (err) console.error("error saving partial", err)
    })
  }
  var saveState = debounce(atomicSave, 1000, { leading: true })

  function save(cb) {
    saveState()
    cb()
  }

  return {
    updateState: function(feedId, updateFeedState, cb) {
      stateLoaded.promise.then(() => {
        let feedState = state[feedId] || {}
        state[feedId] = Object.assign(feedState, updateFeedState)
        save(cb)
      })
    },

    removeFeed: function(feedId, cb) {
      stateLoaded.promise.then(() => {
        delete state[feedId]
        save(cb)
      })
    },

    get,
    getSync: function() {
      return state
    },

    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
