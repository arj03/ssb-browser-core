const bipf = require('bipf')
const Obv = require('obv')
const AtomicFile = require('atomic-file')
const debounce = require('lodash.debounce')
const push = require('push-stream')
const sort = require('ssb-sort')
const path = require('path')

module.exports = function (log, dir) {
  const queueMentions = require('../waiting-queue')()
  const queueRoots = require('../waiting-queue')()

  var seq = Obv()
  seq.set(0)

  function handleData(data) {
    var p = 0 // note you pass in p!
    p = bipf.seekKey(data.value, p, new Buffer('value'))
    if (~p) {
      var p2 = bipf.seekKey(data.value, p, new Buffer('content'))
      if (~p2) {
        var pContent = bipf.seekKey(data.value, p2, new Buffer('root'))
        if (~pContent) {
          const root = bipf.decode(data.value, pContent)
          if (root) {
            let d = roots[root] || []
            d.push(data.seq)
            roots[root] = d
          }
        }
          
        var p3 = bipf.seekKey(data.value, p2, new Buffer('mentions'))
        if (~p3) {
          const mentionsData = bipf.decode(data.value, p3)
          if (Array.isArray(mentionsData)) {
            mentionsData.forEach(mention => {
              if (mention.link &&
                  typeof mention.link === 'string' &&
                  (mention.link[0] === '@' || mention.link[0] === '%')) {
                let d = mentions[mention.link] || []
                d.push(data.seq)
                mentions[mention.link] = d
              }
            })
          }
        }
      }
    }

    seq.set(data.seq)
    save()
  }

  var f = AtomicFile(path.join(dir, "indexes/mentions.json"))

  function atomicSave()
  {
    f.set({
      seq: seq.value,
      mentions,
      roots
    }, () => {})
  }
  var save = debounce(atomicSave, 250)

  var mentions = {}
  var roots = {}
  
  f.get((err, data) => {
    if (!err && data.seq) {
      seq.set(data.seq)
      mentions = data.mentions
      roots = data.roots
      queueMentions.done(null, mentions)
      queueRoots.done(null, roots)
    }
    
    console.time("mentions")

    log.stream({ gt: seq.value }).pipe({
      paused: false,
      write: handleData,
      end: () => {
        console.timeEnd("mentions")

        log.stream({ gt: seq.value, live: true }).pipe({
          paused: false,
          write: handleData
        })

        queueMentions.done(null, mentions)
        queueRoots.done(null, roots)
      }
    })
  })

  function queueGet(queue, key, cb)
  {
    queue.get((err, data) => {
      if (data && data[key]) {
        push(
          push.values(data[key]),
          push.asyncMap(log.get),
          push.collect((err, results) => {
            const msgs = results.map(x => bipf.decode(x, 0))
            sort(msgs)
            msgs.reverse()
            cb(null, msgs)
          })
        )
      }
    })
  }

  return {
    getMessagesByMention: function(key, cb) {
      queueGet(queueMentions, key, cb)
    },
    getMessagesByRoot: function(rootId, cb) {
      queueGet(queueRoots, rootId, cb)
    },
    seq,
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
