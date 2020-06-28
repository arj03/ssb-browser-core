const jitdb = require('jitdb')
const isFeed = require('ssb-ref').isFeed

module.exports = function (log) {
  const bValue = new Buffer('value')
  const bContent = new Buffer('content')

  const bType = new Buffer('type')
  const bAboutValue = new Buffer('about')

  function seekType(buffer) {
    var p = 0 // note you pass in p!
    p = bipf.seekKey(buffer, p, bValue)

    if (~p) {
      p = bipf.seekKey(buffer, p, bContent)
      if (~p)
        return bipf.seekKey(buffer, p, bType)
    }
  }

  var db = jitdb(log.path, "./indexes")
  const query = { type: 'EQUAL', data: { seek: seekType, value: bAboutType, indexName: "type_about" } }

  var profiles = {}

  db.query(query, false, (err, results) => {
    results.forEach(data => {
      if (data.content.about != msg.author) continue

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

  // FIXME: persistance
  // FIXME: changes

  return {
    getProfiles: function(cb) {
      cb(null, profiles)
    }
  }
}
