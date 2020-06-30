const isFeed = require('ssb-ref').isFeed

module.exports = function (db) {
  const bAboutValue = Buffer.from('about')

  var profiles = {}

  db.onReady(() => {
    const query = { type: 'EQUAL', data: { seek: db.seekType, value: bAboutValue, indexName: "type_about" } }

    console.time("profiles")

    db.query(query, false, (err, results) => {
      results.forEach(data => {
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
      })

      console.timeEnd("profiles")
    })
  })

  // FIXME: persistance
  // FIXME: changes

  return {
    getProfiles: function(cb) {
      cb(null, profiles)
    }
  }
}
