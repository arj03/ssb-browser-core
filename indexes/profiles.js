const isFeed = require('ssb-ref').isFeed
const Obv = require('obv')
const AtomicFile = require('atomic-file')
const debounce = require('lodash.debounce')

module.exports = function (db) {
  const queue = require('../waiting-queue')()
  const bAboutValue = Buffer.from('about')

  var seq = Obv()
  seq.set(0)

  const query = {
    type: 'EQUAL',
    data: {
      seek: db.seekType,
      value: bAboutValue,
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

  var f = AtomicFile("indexes/profiles.json")

  function atomicSave()
  {
    f.set({seq: seq.value, profiles}, () => {})
  }
  var save = debounce(atomicSave, 250)

  var profiles = {}

  db.onReady(() => {
    f.get((err, file) => {
      if (!err) {
        seq.set(file.seq)
        profiles = file.profiles
        queue.done(null, profiles)
      } else {
        console.time("profiles")

        db.query(query, 0, (err, results) => {
          results.forEach(updateData)
          seq.set(db.getSeq(query))

          console.timeEnd("profiles")

          save()

          queue.done(null, profiles)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateData)
        seq.set(db.getSeq(query))
        save()
      })
    })
  })

  return {
    getProfiles: function(cb) {
      queue.get(cb)
    },
    seq
  }
}
