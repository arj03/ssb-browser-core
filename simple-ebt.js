'use strict'
var pull = require('pull-stream')
var EBT = require('epidemic-broadcast-trees')
var path = require('path')
var toPull = require('push-stream-to-pull-stream')
var isFeed = require('ssb-ref').isFeed

var Store = require('lossy-store')
var toUrlFriendly = require('base64-url').escape

exports.name = 'ebt'

exports.version = '1.0.0'

exports.manifest = {
  replicate: 'duplex',
  request: 'sync',
  peerStatus: 'sync'
}
exports.permissions = {
  anonymous: {allow: ['replicate']},
}

//there was a bug that caused some peers
//to request things that weren't feeds.
//this is fixed, so just ignore anything that isn't a feed.
function cleanClock(clock, message) {
  for(var k in clock)
    if(!isFeed(k)) {
      delete clock[k]
    }
}

exports.init = function (sbot, config) {
  var dir = config.path ? path.join(config.path, 'ebt') : null
  var store = Store(dir, null, toUrlFriendly)

  var ebt = EBT({
    logging: config.ebt && config.ebt.logging,
    id: sbot.id,
    getClock: function (id, cb) {
      store.ensure(id, function () {
        var clock = store.get(id) || {}
        cleanClock(clock)
        cb(null, clock)
      })
    },
    setClock: function (id, clock) {
      cleanClock(clock, 'non-feed key when saving clock')
      store.set(id, clock)
    },
    getAt: function (pair, cb) {
      sbot.getAtSequence([pair.id, pair.sequence], function (err, data) {
        cb(err, data ? data.value : null)
      })
    },
    append: function (msg, cb) {
      sbot.add(msg, function (err, msg) {
        cb(err && err.fatal ? err : null, msg)
      })
    },
    isFeed
  })

  function getClock() {
    SSB.db.getLast((err, last) => {
      var clock = {}
      for (var k in last) {
        clock[k] = last[k]
      }

      ebt.state.clock = clock || {}
      ebt.update()
    })
  }

  SSB.events.on('SSB: loaded', getClock)

  sbot.post(function(msg) {
    ebt.onAppend(msg.value)
  })

  function onClose() {
    sbot.emit('replicate:finish', ebt.state.clock)
  }

  return {
    replicate: function(opts) {
      if (opts.version !== 2 && opts.version != 3)
        throw new Error('expected ebt.replicate({version: 3 or 2})')
      return toPull.duplex(ebt.createStream(this.id, opts.version, false))
    },
    //get replication status for feeds for this id.
    peerStatus: function(id) {
      id = id || sbot.id
      var data = {
        id: id,
        seq: ebt.state.clock[id],
        peers: {},
      }

      for (var k in ebt.state.peers) {
        var peer = ebt.state.peers[k]
        if(peer.clock[id] != null || peer.replicating[id] != null) {
          var rep = peer.replicating && peer.replicating[id]
          data.peers[k] = {
            seq: peer.clock[id],
            replicating: rep
          }
        }
      }

      return data
    },
    request: ebt.request,
    startEBT: function(rpc) {
      var opts = {version: 3}
      var a = toPull.duplex(ebt.createStream(rpc.id, opts.version, true))
      var b = rpc.ebt.replicate(opts, function (err) {
        if(err) {
          rpc.removeListener('closed', onClose)
          rpc._emit('fallback:replicate', err)
        }
      })

      pull(a, b, a)
      rpc.on('closed', onClose)
    }
  }
}
