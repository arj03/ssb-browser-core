module.exports.setup = function (dir, config, extraModules, ssbLoaded) {
  const { WindowController } = require("./window-controller.js")
  const path = require('path')

  window.windowController = new WindowController()

  window.windowList = (window.opener && window.opener.windowList ? window.opener.windowList : [ window ])

  module.exports.initSSB = function() {
    // Before we start up ssb-browser-core, let's check to see if we do not yet have an id, since this would mean that we need to display the onboarding screen.
    const ssbKeys = require('ssb-keys')
    window.firstTimeLoading = false
    try {
      ssbKeys.loadSync(path.join(dir, 'secret'))
    } catch(err) {
      window.firstTimeLoading = true
    }
    
    if (window.updateFirstTimeLoading)
      window.updateFirstTimeLoading()

    require('./core').init(dir, config, extraModules)
    SSB.uniqueID = (new Date()).getTime()
    window.singletonSSB = SSB // Using a different name so that anything trying to use the non-singleton global will fail so we can find them.

    if (SSB.events._events["SSB: loaded"])
      ssbLoaded()
    else
      SSB.events.once('SSB: loaded', ssbLoaded)
  }
}

module.exports.init = function (config, extraModules, ssbLoaded) {
  module.exports.setup("/.ssb-lite", config, extraModules, ssbLoaded) 
}

var onErrorCallbacks = []
var onSuccessCallbacks = []
var ssbChangedCallbacks = []
var lastSSB = null

function runOnChangeIfNeeded(SSB) {
  if (lastSSB != SSB.uniqueID) {
    lastSSB = SSB.uniqueID
    for (f in ssbChangedCallbacks)
      ssbChangedCallbacks[f]()
  }
}

function runOnError(err) {
  for (f in onErrorCallbacks)
    onErrorCallbacks[f](err)
}

function runOnSuccess() {
  for (f in onSuccessCallbacks)
    onSuccessCallbacks[f]()
}

// Allows for registering callbacks which run any time the active SSB is switched, including if we initialize or we have to register with a new SSB in another window.
module.exports.onChangeSSB = function(cb) {
  ssbChangedCallbacks.push(cb)
}

module.exports.onError = function(cb) {
  onErrorCallbacks.push(cb)
}

module.exports.onSuccess = function(cb) {
  onSuccessCallbacks.push(cb)
}

module.exports.getSSB = function() {
  if (window.singletonSSB) {
    if (windowController.isMaster) {
      // We're already holding an SSB object, so we can return it right away.
      runOnChangeIfNeeded(window.singletonSSB)
      runOnSuccess()
      return [ null, window.singletonSSB ]
    } else {
      // We have an initialized SSB but lost our WindowController status, which means we probably froze up for long enough that another window gave up on listening for our heatbeat pings.
      // We need to get rid of our SSB object as soon as possible and then fall back to trying to get it from another window.
      delete window.singletonSSB
    }
  }

  var err = "Acquiring database lock - Only one instance of ssb-browser is allowed to run at a time."
  if (windowController.isMaster) {
    // We've been elected as the SSB holder window but have no SSB yet.  Initialize an SSB object.
    module.exports.initSSB()
    runOnChangeIfNeeded(window.singletonSSB)
    runOnSuccess()
    return [ null, window.singletonSSB ]
  } else {
    // We're not supposed to be running an SSB.  But there might be another window with one.
    for (w in window.windowList) {
      var otherWindow = window.windowList[w]
      if (otherWindow != window && otherWindow.windowController && otherWindow.getSSBSingleton) {
        if (window.windowController.others && window.windowController.others[otherWindow.windowController.id]) {
          // They're still responding to pings.
          let [ err, otherSSB ] = otherWindow.getSSBSingleton().getSSB()
          if (otherSSB) {
            runOnChangeIfNeeded(otherSSB)
            runOnSuccess()
            return [ null, otherSSB ]
          }
        }
      }
    }
  }

  runOnError(err)
  return [ err, null ]
}

var ssbEventuallyCB = []

function checkSSBEventually()
{
  let [ err, maybeSSB ] = module.exports.getSSB()

  for (let i = 0; i < ssbEventuallyCB.length; ++i)
  {
    const check = ssbEventuallyCB[i]
    if (check.isRelevantCB && !check.isRelevantCB())
      ssbEventuallyCB.splice(i, 1)

    let isOk = false
    if (!err)
      try { isOk = check.ssbCheckCB(maybeSSB) } catch (e) {}

    if (isOk) {
      try { check.resultCB(err, maybeSSB) } catch (e) {}
      ssbEventuallyCB.splice(i, 1)
    } else if (check.retries > 0) {
      check.retries -= 1
    } else {
      try { check.resultCB("Could not lock database", null) } catch (e) {}
      ssbEventuallyCB.splice(i, 1)
    }
  }

  if (ssbEventuallyCB.length > 0)
    setTimeout(checkSSBEventually, 250)
}

module.exports.getSSBEventually = function(timeout, isRelevantCB, ssbCheckCB, resultCB) {
  let [ err, maybeSSB ] = this.getSSB()

  const isOk = ssbCheckCB(maybeSSB)

  if (!isOk) {
    if (timeout != 0) {
      ssbEventuallyCB.push({ retries: timeout === -1 ? 10000 : timeout / 250,
                             isRelevantCB, ssbCheckCB, resultCB })
      if (ssbEventuallyCB.length === 1)
        setTimeout(checkSSBEventually, 250)

      return
    }
  }

  resultCB(err, isOk ? maybeSSB : null)
}

module.exports.getSimpleSSBEventually = function(isRelevantCB, resultCB) {
  module.exports.getSSBEventually(-1, isRelevantCB, (SSB) => { return SSB && SSB.db }, resultCB)
}

module.exports.openWindow = function(href) {
  window.windowList.push(window.open(href))
}

window.getSSBSingleton = function() { return module.exports }
