const validate = require('ssb-validate')
const keys = require('ssb-keys')
const pull = require('pull-stream')
const raf = require('polyraf')

var remote

exports.connected = function(cb)
{
  if (!remote || remote.closed)
  {
    SSB.net.connect(SSB.remoteAddress, (err, rpc) => {
      if (err) throw(err)

      remote = rpc
      cb(remote)
    })
  } else
    cb(remote)
}

function deleteDatabaseFile(filename) {
  const path = require('path')
  const file = raf(path.join(SSB.dir, filename))
  file.open((err, done) => {
    if (err) return console.error(err)
    file.destroy()
  })
}

exports.removeDB = function() {
  deleteDatabaseFile('full.offset')
  deleteDatabaseFile('contacts.offset')
  deleteDatabaseFile('profiles.offset')
  deleteDatabaseFile('latest.offset')

  // FIXME:?
  localStorage['last.json'] = JSON.stringify({})
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

exports.sync = function()
{
  exports.connected((rpc) => {
    // FIXME: use friends reduce

    SSB.db.friends.hops((err, hops) => {
      for (var feed in hops)
        if (hops[feed] <= SSB.hops)
          SSB.net.ebt.request(feed, true)
    })
  })
}
