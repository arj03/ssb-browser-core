# SSB browser core

Secure scuttlebutt core (similar to [ssb-server]) in a browser.

# api

Once you load the `bundle-core.js` file in a browser a global SSB
object will be available.

The api is not meant to be 100% compatible with regular
ssb-db. Overall there are two major parts: `db` and `net`.

## db

### get(id, cb)

Will get a message with `id` from the database. If the message is not
found an err will be returned.

### validateAndAdd(msg, cb)

Validate a raw message (without id and timestamp), checks if the
message is of a known type. Will update profile if applicable. Finally
adds the message to the database and updates the last index. Callback
is the stored message (id, timestamp, value = original message) or
err.

### add(msg, cb)

Add a raw message (without id and timestamp) to the database. Callback
is the stored message (id, timestamp, value = original message) or
err.

### del(id, cb)

Remove a message from the database. Please note that if you remove a
message for a feed where you store all the messages in the log this
will mean that you won't be able to replicate this feed with other
peers.

### deleteFeed(feedId, cb)

Delete all messages for a particular feed.

Be sure to also call `removeFeedState` to clean up any other state
stored about the feed.

### query

The query index

### last

The last index

### clock

The clock index

### friends

The [ssb-friends] module

### peerInvites

The [ssb-peer-invites] module

### backlinks

The [ssb-backlinks] module

### getStatus

Gets the current db status, same functionality as
[db.status](https://github.com/ssbc/ssb-db#dbstatus) in ssb-db.

## net

This is the [secret-stack] module with a few extra modules
loaded. [ssb-ws] is used to create web socket connections to pubs.

### id

The public key of the current user

### add(msg, cb)

For historical reasons (see ssb-ebt) we have add here. This just calls
`SSB.db.validateAndAdd`.

### rpc:connect event

Example:

```
SSB.net.on('rpc:connect', (rpc) => {
  console.log("connected")
  rpc.on('closed', () => console.log("bye"))
})
```

### blobs

This is where the `blobs` api can be found. The module implements the
blobs protocol and so can exchange blobs with connection peers. It
also contains with the the following extra methods:

#### hash(data, cb)

Hashes data and returns the digest or err

Example:
```
onFileSelect: function(ev) {
  const file = ev.target.files[0]
  file.arrayBuffer().then(function (buffer) {
    SSB.net.blobs.hash(new Uint8Array(buffer), (err, digest) => {
      console.log(digest)
    })
  })
}
```

#### add(blobId, file, cb)

Adds the `file` (such as one obtained from ev.target.files when using
a file select) to the blob store using the blobId name. BlobId is & +
hash.

#### remoteURL(blobId)

Returns a http URL string for the current connection. This is useful
in a browser for images that you don't want to store directly on the
device.

#### privateGet(blobId, unbox, cb)

Callback with err or a url that works for e.g images that was received
in a private message.

#### localGet(blobId, unbox, cb)

If blob already exists will callback with err or a url that can be
used for images for a blob. Otherwise the blob will get requested and
if size is smaller than the maximum size, the blob will be stored
locally and used for callback, otherwise the callback will return a
`remoteURL` link.  

### ooo

The [ssb-ooo] module

### tunnelChat

Uses a modified version of [ssb-tunnel] to send and receive end-to-end
encrypted ephemeral messages between two peers.

#### acceptMessages

After being called, allow incoming connections on confirmation.

#### connect(feedId)

Connect to a remote feedId. When connected a message will be put in
`messages`.

#### sendMessage(msg)

Send a message to the remote user, adds the message to the `messages`
stream.

#### messages

A stream of messages. Example usage:

```
pull(
  messages(),
  pull.drain((msg) => {
    console.log(msg.user + "> " + msg.text)
  })
)
```

### Browser specific

Two modules are special compared to a normal SSB distribution and to
use this optional functionality the pub needs these plugins:

- [ssb-get-thread]
- [ssb-partial-replication]

Once a rpc connection has been established, the following extra
methods are available:

#### getThread.get(msgId, cb)

Will get a message includes all messages linking to the message.

#### partialReplication.partialReplication(feedId, seq, keys)

Returns a stream of messages for the given `feedId` starting from `seq`.

## dir

The path to where the database and blobs are stored.

## validate

The [ssb-validate] module.

## state

The current [state](https://github.com/ssbc/ssb-validate#state) of
known feeds.

## connected(cb)

Will ensure a connection is ready. Cb signature is (err, rpc).

## removeFeedState(feedId)

Remove any state related to feed. This complements `db.deleteFeed`
that removes the users messages from the local database.

## profiles

A dict from feedId to { name, description, image }

### loadProfiles()

Populates profiles dict from localStorage

### saveProfiles

Save the profiles dict in localStorage

## publish(msg, cb)

Validates a message and stores it in the database. See db.add for format.

## messagesByType

A convenience method around db.query to get messages of a particular type.

## remoteAddress

The remote server to connect to. Must be web socket.

## sync

Start a EBT replication with the remote server. This syncs all the
feeds known in `SSB.state.feeds`.

This uses `validMessageTypes` and `privateMessages` to determine what
gets stored locally.

FIXME: document how this works with following

## initialSync(onboard)

This will do an initial sync of feeds from the `onboard` dict. Only
profiles active within the last month and only the latest 25 messages
are synced.

The format of the onboard dict is: feedId to { latestMsg: { seq,
timestamp }, imageAbout, image, descriptionAbout, description,
nameAbout, name }

This requires [ssb-partial-replication] on the pub.

## box

[box](https://github.com/ssbc/ssb-keys#boxcontent-recipients--boxed)
method from ssb-keys. Useful for private messages.

## blobFiles

The [ssb-blob-files] module.

## validMessageTypes

An array of message types to store during sync.

FIXME: document how this works with following

## privateMessages

A boolean to indicate if private messages are to be stored during sync.

FIXME: document how this works with following


There are a few other undocumented methods, these will probably be
moved to another module in a later version as they are quite tied to
[ssb-browser-demo].

# Browser compatibility

Tested with Chrome and Firefox. Chrome is faster because it uses fs
instead of indexeddb. Also tested on android using Chrome and iOS
using safari.

# Building

The following patches (patch -p0 < x.patch) from the patches folder
are needed:
 - epidemic-broadcast-fix-replicate-multiple.patch
 - ssb-ebt.patch
 - ssb-friends.patch
 - ssb-tunnel.patch
 - ssb-peer-invites.patch
 - ssb-blob-files.patch

The following branches are references directly until patches are merged and pushed:
 - https://github.com/ssbc/ssb-validate/pull/16
 - https://github.com/ssbc/ssb-backlinks/pull/15

For a smaller bundle file, you can also apply
patches/sodium-browserify.patch

[ssb-server]: https://github.com/ssbc/ssb-server
[ssb-browser-demo]: https://github.com/arj03/ssb-browser-demo
[secret-stack]: https://github.com/ssbc/secret-stack
[ssb-ws]: https://github.com/ssbc/ssb-ws
[ssb-friends]: https://github.com/ssbc/ssb-friends
[ssb-peer-invites]: https://github.com/ssbc/ssb-peer-invites
[ssb-backlinks]: https://github.com/ssbc/ssb-backlinks
[ssb-validate]: https://github.com/ssbc/ssb-validate
[ssb-blob-files]: https://github.com/ssbc/ssb-blob-files
[ssb-ooo]: https://github.com/ssbc/ssb-ooo
[ssb-tunnel]: https://github.com/ssbc/ssb-tunnel

[ssb-get-thread]: https://github.com/arj03/ssb-get-thread
[ssb-partial-replication]: https://github.com/arj03/ssb-partial-replication
