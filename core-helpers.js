const validate = require('ssb-validate')
const keys = require('ssb-keys')
const pull = require('pull-stream')
const raf = require('polyraf')

var remote

exports.connected = function(cb)
{
  if (!remote || remote.closed)
  {
    SSB.isInitialSync = false // for ssb-ebt
    SSB.net.connect(SSB.remoteAddress, (err, rpc) => {
      if (err) throw(err)

      remote = rpc
      cb(remote)
    })
  } else
    cb(remote)
}

exports.removeDB = function() {
  const path = require('path')

  const file = raf(path.join(SSB.dir, 'log.offset'))
  file.open((err, done) => {
    if (err) return console.error(err)
    file.destroy()
  })

  localStorage['last.json'] = JSON.stringify({})
  localStorage['profiles.json'] = JSON.stringify({})

  console.log("remember to delete indexdb indexes as well!")
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
    if (!SSB.state.feeds[SSB.net.id])
      SSB.net.replicate.request(SSB.net.id, true)

    if (SSB.syncOnlyFeedsFollowing) {
      SSB.db.friends.hops((err, hops) => {
        for (var feed in hops)
          if (hops[feed] == 1)
            SSB.net.replicate.request(feed, true)
      })
    } else {
      for (var feed in SSB.state.feeds)
        SSB.net.replicate.request(feed, true)
    }
  })
}

exports.saveProfiles = function() {
  localStorage['profiles.json'] = JSON.stringify(SSB.profiles)
}

exports.loadProfiles = function() {
  if (localStorage['profiles.json'])
    SSB.profiles = JSON.parse(localStorage['profiles.json'])
}
