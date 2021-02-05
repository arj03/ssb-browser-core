const validate = require('ssb-validate')
const keys = require('ssb-keys')
const pull = require('pull-stream')
const raf = require('polyraf')
const path = require('path')

exports.getPeer = function()
{
  let connPeers = Array.from(SSB.net.conn.hub().entries())
  connPeers = connPeers.filter(([, x]) => !!x.key).map(([address, data]) => ({ address, data }))
  var goodPeer = connPeers.find(cp => cp.data.type != 'room')

  let peers = Object.values(SSB.net.peers).flat()

  if (goodPeer) return peers.find(p => p.id == goodPeer.data.key)
  else if (peers.length > 0) return peers[0]
  else return null
}

function deleteDatabaseFile(filename) {
  const path = require('path')
  const file = raf(path.join(SSB.dir, filename))
  file.open((err, done) => {
    if (err) return console.error(err)
    file.destroy()
  })
}

exports.removeIndexes = function removeIndexes(fs) {
  SSB.db.clearIndexes()
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

exports.getGraphForFeed = function(feedId, cb) {
  SSB.net.friends.hops({ start: feedId }, (err, hops) => {
    if (err) return cb(err)
    else cb(null, SSB.feedSyncer.convertHopsIntoGraph(hops, false))
  })
}

exports.getGraph = function(cb) {
  SSB.net.friends.hops((err, hops) => {
    if (err) return cb(err)
    else cb(null, SSB.feedSyncer.convertHopsIntoGraph(hops))
  })
}

exports.getGraphSync = function(cb) {
  return SSB.feedSyncer.getLastGraph()
}

exports.EBTSync = function(rpc)
{
  // FIXME: live update graph

  console.log("doing ebt with", rpc.id)
  exports.getGraph((err, graph) => {
    SSB.net.ebt.updateClock(() => {
      SSB.net.ebt.request(SSB.net.id, true)

      console.log("got graph", graph)

      graph.following.forEach(feed => SSB.net.ebt.request(feed, true))
      graph.extended.forEach(feed => SSB.net.ebt.request(feed, true))

      SSB.net.ebt.startEBT(rpc)
    })
  })
}

exports.fullSync = function(rpc)
{
  SSB.feedSyncer.syncFeeds(rpc, exports.EBTSync)
}
