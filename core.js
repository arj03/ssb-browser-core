exports.init = function (dir, config, extraModules) {
  const EventEmitter = require('events')
  SSBLOADER = new EventEmitter()

  // init secret stack
  const s = require('sodium-browserify')
  s.events.on('sodium-browserify:wasm loaded', () => {
    console.log("wasm loaded")

    SSB = require('./net').init(dir, config, extraModules)
    console.log("my id: ", SSB.id)

    const helpers = require('./core-helpers')

    SSB.helpers = {
      box: require('ssb-keys').box,

      connectAndRemember: helpers.connectAndRemember,
      getPeer: helpers.getPeer,
      convertHopsIntoGraph: helpers.convertHopsIntoGraph,
      getGraphForFeed: helpers.getGraphForFeed,

      removeDB: helpers.removeDB,
      removeIndexes: helpers.removeIndexes,
      removeBlobs: helpers.removeBlobs
    }

    // delay startup a bit
    const startOffline = config && config.core && config.core.startOffline
    if (!startOffline) {
      setTimeout(() => {
        SSB.conn.start()
      }, 2500)
    }

    SSBLOADER.emit("ready")
  })
}
