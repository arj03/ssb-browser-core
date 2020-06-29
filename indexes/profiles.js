const bipf = require('bipf')
const isFeed = require('ssb-ref').isFeed

module.exports = function (db) {
  const bValue = Buffer.from('value')
  const bContent = Buffer.from('content')

  const bType = Buffer.from('type')
  const bAboutValue = Buffer.from('about')

  function seekType(buffer) {
    var p = 0 // note you pass in p!
    p = bipf.seekKey(buffer, p, bValue)

    if (~p) {
      p = bipf.seekKey(buffer, p, bContent)
      if (~p)
        return bipf.seekKey(buffer, p, bType)
    }
  }

  db.onReady(() => {
    const query = { type: 'EQUAL', data: { seek: seekType, value: bAboutValue, indexName: "type_about" } }

    var profiles = {}

    db.query(query, false, (err, results) => {
      console.log("about messages", results.length)
      results.forEach(data => {
        if (data.content.about != msg.author) return

        let profile = profilesBuild[data.value.author] || {}

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
