const isFeed = require('ssb-ref').isFeed
const Obv = require('obv')
const AtomicFile = require('atomic-file')
const debounce = require('lodash.debounce')
const path = require('path')

module.exports = function (db, dir) {
  const queue = require('../waiting-queue')()

  var seq = Obv()
  seq.set(0)

  const query = {
    type: 'EQUAL',
    data: {
      seek: db.seekType,
      value: Buffer.from('about'),
      indexType: "type" }
  }

  function updateData(data) {
    if (data.value.content.about != data.value.author) return

    let profile = profiles[data.value.author] || {}

    content = data.value.content

    if (content.name)
      profile.name = content.name

    if (content.description)
      profile.description = content.description

    if (content.image && typeof content.image.link === 'string')
      profile.image = content.image.link
    else if (typeof content.image === 'string')
      profile.image = content.image

    profiles[data.value.author] = profile
  }

  var f = AtomicFile(path.join(dir, "indexes/profiles.json"))

  function atomicSave()
  {
    f.set({seq: seq.value, profiles}, () => {})
  }
  var save = debounce(atomicSave, 250)

  var profiles = {}

  db.onReady(() => {
    f.get((err, data) => {
      if (!err && data.seq >= SSB.db.getStatus().log) {
        seq.set(data.seq)
        profiles = data.profiles
        queue.done(null, profiles)
      } else {
        console.time("profiles")

        profiles = !err ? data.profiles : {}

        db.querySeq(query, !err ? data.seq : 0, (err, results) => {
          results.forEach(updateData)

          console.timeEnd("profiles")

          seq.set(db.getSeq(query))
          save()
          
          queue.done(null, profiles)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateData)
      })
    })
  })

  return {
    get: function(cb) {
      queue.get(cb)
    },
    seq,
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
