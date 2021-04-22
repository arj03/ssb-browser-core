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
  const { readFile, writeFile } = require('atomic-file-rw')
  const debounce = require('lodash.debounce')
  const path = require('path')
  const DeferredPromise = require('p-defer')

  const stateLoaded = DeferredPromise()
  var state = {}

  const filename = path.join(dir, "indexes/partial.json")

  function get(cb) {
    readFile(filename, (err, data) => {
      if (err) {
        stateLoaded.resolve()
        return cb(err, {})
      }

      if (data)
        state = JSON.parse(data).state

      stateLoaded.resolve()
      cb(null, state)
    })
  }

  function atomicSave()
  {
    writeFile(filename, JSON.stringify({ state }), (err) => {
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
      // FIXME
      //f.destroy(cb)
    }
  }
}
