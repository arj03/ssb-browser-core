const isFeed = require('ssb-ref').isFeed
const Obv = require('obv')

module.exports = function (db) {
  const queue = require('../waiting-queue')()
  const bAboutValue = Buffer.from('about')

  var seq = Obv()
  seq.set(0)

  var profiles = {}
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

  db.onReady(() => {
    const filename = "/indexes/profiles.json"
    const indexWriter = require('./index-persistance')()
    indexWriter.load(filename, (err, file) => {
      if (!err) {
        seq.set(file.seq)
        profiles = file.data
        queue.done(null, profiles)
      } else {
        console.time("profiles")

        db.query(query, 0, (err, results) => {
          results.forEach(updateData)
          seq.set(db.getSeq(query))

          console.timeEnd("profiles")

          indexWriter.save(filename, seq.value,
                           () => Buffer.from(JSON.stringify(profiles)))

          queue.done(null, profiles)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateData)
        seq.set(db.getSeq(query))
        indexWriter.save(filename, seq.value,
                         () => Buffer.from(JSON.stringify(profiles)))
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
