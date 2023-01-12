const validate = require('ssb-validate')
const keys = require('ssb-keys')
const pull = require('pull-stream')
const raf = require('polyraf')
const path = require('path')

exports.connectAndRemember = function (addr, data) {
  SSB.conn.connect(addr, data, (err, rpc) => {
    SSB.conn.remember(addr, Object.assign(data, { autoconnect: true }))
  })
}

exports.getPeer = function() {
  let connPeers = Array.from(SSB.conn.hub().entries())
  connPeers = connPeers.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
  var goodPeer = connPeers.find(cp => cp.data.type != 'room')

  let peers = Object.values(SSB.peers).flat()

  if (goodPeer) return peers.find(p => p.id == goodPeer.data.key)
  else if (peers.length > 0) return peers[0]
  else return null
}

function deleteDatabaseFile(filename) {
  const file = raf(path.join(SSB.config.path, filename))
  file.open((err, done) => {
    if (err) return console.error(err)
    file.destroy()
  })
}

exports.removeDB = function() {
  deleteDatabaseFile('log.bipf')

  // remove all indexes including jitdb and partial
  const IdbKvStore = require('idb-kv-store')
  const store = new IdbKvStore(path.join(SSB.dir, "indexes"))
  store.clear()
}

exports.removeBlobs = function() {
  function listDir(fs, path)
  {
    fs.root.getDirectory(path, {}, function(dirEntry) {
      var dirReader = dirEntry.createReader()
      dirReader.readEntries(function(entries) {
        for(var i = 0; i < entries.length; i++) {
          var entry = entries[i]
          if (entry.isDirectory) {
            //console.log('Directory: ' + entry.fullPath);
            listDir(fs, entry.fullPath)
          }
          else if (entry.isFile) {
            console.log('deleting file: ' + entry.fullPath)
            const file = raf(entry.fullPath)
            file.open((err, done) => {
              if (err) return console.error(err)
              file.destroy()
            })
          }
        }
      })
    })
  }

  window.webkitRequestFileSystem(window.PERSISTENT, 0, function (fs) {
    listDir(fs, '/.ssb-lite/blobs')
  })
}

exports.convertHopsIntoGraph = function(hops) {
  const following = []
  const blocking = []
  const extended = []

  const feeds = Object.keys(hops)
  for (var i = 0; i < feeds.length; ++i) {
    const feed = feeds[i]
    if (hops[feed] == 1)
      following.push(feed)
    else if (hops[feed] > 0 && hops[feed] <= SSB.config.friends.hops)
      extended.push(feed)
    else if (hops[feed] == -1)
      blocking.push(feed) 
  }

  return { following, extended, blocking }
}

exports.getGraphForFeed = function(feedId, cb) {
  SSB.friends.hops({ start: feedId }, (err, hops) => {
    if (err) return cb(err)
    else cb(null, exports.convertHopsIntoGraph(hops, feedId == SSB.id))
  })
}
