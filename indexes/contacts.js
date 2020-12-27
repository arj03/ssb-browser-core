const bipf = require('bipf')
const pull = require('pull-stream')
const pl = require('pull-level')
const jsonCodec = require('flumecodec/json')
const Plugin = require('ssb-db2/indexes/plugin')

// 1 index:
// - [from, to] => distance

module.exports = function (log, dir) {
  const bValue = Buffer.from('value')
  const bAuthor = Buffer.from('author')
  const bContent = Buffer.from('content')
  const bType = Buffer.from('type')
  const bContact = Buffer.from('contact')

  let batch = []

  const name = 'contacts'
  const { level, offset, stateLoaded, onData, writeBatch } = Plugin(
    dir,
    name,
    1,
    handleData,
    writeData
  )

  function writeData(cb) {
    level.batch(batch, { keyEncoding: 'json' }, cb)
    batch = []
  }

  function handleData(record, processed) {
    if (record.offset < offset.value) return
    if (!record.value) return // deleted

    let p = 0 // note you pass in p!
    p = bipf.seekKey(record.value, p, bValue)
    if (!~p) return

    const pAuthor = bipf.seekKey(record.value, p, bAuthor)
    const author = bipf.decode(record.value, pAuthor)

    const pContent = bipf.seekKey(record.value, p, bContent)
    if (!~pContent) return

    const pType = bipf.seekKey(record.value, pContent, bType)
    if (!~pType) return

    if (bipf.compareString(record.value, pType, bContact) === 0) {
      const content = bipf.decode(record.value, pContent)
      const to = content.contact

      if (isFeed(author) && isFeed(to)) {
        batch.push({
          type: 'put',
          key: [author, to],
          value: getStatus(author, content)
        })

        /* FIXME
        if (from == SSB.net.id) {
          for (var i = 0; i < notifyOnGraphChanges.length; ++i)
            notifyOnGraphChanges[i]()
        }
        */
      }
    }

    return batch.length
  }
  
  function get(from, to, cb) {
    level.get([from, to], (err, status) => {
      if (err) cb(err)
      else cb(null, parseInt(status, 10))
    })
  }

  function getFeed(from, cb) {
    pull(
      pl.read(level, {
        gte: [from, ''],
        lte: [from, undefined],
        keyEncoding: jsonCodec,
        keys: false,
      }),
      pull.collect((err, data) => {
        console.log("got feed data", data)
        if (err) return cb(err)
        else cb(null, data)
      })
    )
  }

  // FIXME
  let notifyOnGraphChanges = []
  function onGraphChange(cb) {
    notifyOnGraphChanges.push(cb)
    function remove() {
      notifyOnGraphChanges = notifyOnGraphChanges.filter(n => n != cb)
    }
    return remove
  }
  
  function isFollowing(source, dest) {
    if (!hops[source]) return false
    return hops[source][dest] === 1
  }

  function isBlocking(source, dest) {
    if (!hops[source]) return false
    return hops[source][dest] === -1
  }

  function getGraphForFeed(feed, cb) {
    getFeed(feed, (err, data) => {
      hops[feed] = data
      cb(err, getGraphForFeedSync(feed))
    })
  }

  // FIXME: cache
  let hops = {}

  // might return empty when hops is not loaded yet
  function getGraphForFeedSync(feed) {
    let following = []
    let blocking = []
    let extended = []

    for (let relation in hops[feed]) {
      if (isFollowing(feed, relation))
        following.push(relation)
      else if (isBlocking(feed, relation))
        blocking.push(relation)
    }

    for (let feedId in hops) {
      if (feedId === feed)
        continue

      if (!following.includes(feedId))
        continue

      for (let relation in hops[feedId]) {
        if (isFollowing(feedId, relation)) {
          if (relation === feed)
            continue

          if (following.includes(relation))
            continue

          if (blocking.includes(relation))
            continue

          extended.push(relation)
        }
      }
    }

    return {
      following,
      blocking,
      extended: [...new Set(extended)]
    }
  }

  return {
    offset,
    stateLoaded,
    onData,
    writeBatch,
    name,

    remove: level.clear,
    close: level.close.bind(level),

    get,
    getFeed,
    getGraphForFeed,
    isFollowing,
    isBlocking,
  }
}
