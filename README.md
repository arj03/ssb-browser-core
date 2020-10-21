# SSB browser core

Secure scuttlebutt core (similar to [ssb-server]) in a browser.

This is a full implementation of ssb running in the browser only (but
not limited to, of course). The key of your feed is stored in the
browser together with the log, indexes and smaller images. To reduce
storage and network requirements, partial replication has been
implemented. Wasm is used for crypto and is around 90% the speed of
the C implementation. A WebSocket is used to connect to pubs. The
`bundle-core.js` file in dist/ is roughly 2mb.

Replication in the browser is quite a bit slower than in node, around
4-5x. There doesn't seem to be a single cause, it appears to be all
the diferrent layers that are [slower]: end-to-end encryption,
database write etc.

SSB conn is used for connections and rooms are supported. Partial
replication is implemented which allows two connected browsers to do a
partial sync.

Partial replication [speed] on a fast laptop is roughly 425 feeds in 56
seconds, and roughly half of that on a slow laptop or when running on
battery.

![Diagram](./diagram.svg)

<details>
digraph hierarchy {

  nodesep=1.0 // increases the separation between nodes
  node [shape=record];
  
  { rank=same SSBBrowserCore Validate Keys }
  { rank=same SSBBrowserCore SecretStack MuxRPC }

  SSBBrowserCore->{Network Connections Sync DB Feed}
                   Feed->{Validate Keys}
                   DB->{JITDB AsyncFlumelog Indexes}
                   Connections->{SSBconn Rooms}
                   Network->{SecretStack MuxRPC SHS}
                   Sync->{CreateHistStream Partial EBT}
}
</details>

# api

Once you load the `bundle-core.js` file in a browser a global SSB
object will be available.

The api is not meant to be 100% compatible with regular
ssb-db. Overall there are two major parts: [`db`](#db) and
[`net`](#net).

# config

Loading the bundle-core file as above will use `browser.js`, meaning
default options. It is also possible to overwrite config options,
like:

```
require('../core.js').init(dir, { blobs: { max: 512 * 1024 } })
```

Default config options are defined in `net.js`.

## Runtime configurations

### hops

The number of hops from which to store feeds in full. Hops + 1 will be
stored in partial state, meaning profiles, contacts and latest
messages will be stored.

Default is 1.

## db

### get(id, cb)

Will get a message with `id` from the database. If the message is not
found an err will be returned.

### getSync(id, cb)

Same as `get` except this method will wait for the indexes to be in
sync with the main log.

### validateAndAdd(msg, cb)

Validate a raw message (without id and timestamp), meaning if its the
first message from the feed, validate it without the previous pointer
otherwise it has to be the next message for the feed. Callback is the
stored message (id, timestamp, value = original message) or err.

### validateAndAddOOO(msg, cb)

Works the same way as validateAndAdd, expect that it will always do
validate without the previous pointer, meaning it can be used to
insert out of order messages from the feed.

### add(msg, cb)

Add a raw message (without id and timestamp) to the database. Callback
is the stored message (id, timestamp, value = original message) or
err.

### get(key, cb)

Get a message based on the key. Callback is the stored message (id,
timestamp, value = original message) or err.

### del(key, cb)

Remove a message from the database. Please note that this can create
problems with replication, in that a remote peer that does not have
this message will not be able to get this messages and any message
that comes afterwards.

### deleteFeed(feedId, cb)

Delete all messages for a particular feed and removes any state
associated with the feed.

### getStatus()

Gets the current db status, same functionality as
[db.status](https://github.com/ssbc/ssb-db#dbstatus) in ssb-db.

### jitdb

Returns a [jitdb] instance of the database useful for queries.

### onDrain(cb)

Will cb when all outstanding writes for the log has been written to storage.

### getLatest(feedId, cb)

Returns the latest state ({ id (msg key), sequence, timestamp }) for a feedId.

### getDataFromAuthorSequence()

Internal method for EBT.

### contacts

The contacts index for the friends graph.

Contains the method `getGraphForFeed(feed, cb)` that will return an
object of: following, blocking and extended given the feed.

### profiles.get(cb)

Returns the profiles index.

### getMessagesByRoot(key, cb)

Returns all the messages for a particular root in sorted order.

### getMessagesByMention(key, cb)

Returns a sorted array messages that has a particular key in the
mentions array. This is useful for notifications for a particular
feed.

## net

This is the [secret-stack] module with a few extra modules
loaded. [ssb-ws] is used to create web socket connections to pubs.

### id

The public key of the current user

### rpc:connect event

Example:

```
SSB.net.on('rpc:connect', (rpc) => {
  console.log("connected")
  rpc.on('closed', () => console.log("bye"))
})
```

### connectAndRemember(addr, data)

Will connect and store as to automatically reconnect on
reload. Options are as described in [ssb-conn].

### connect(addr, cb)

Connect to addr only once. Cb is (err, rpc)

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

### Browser specific methods on net

For partial replication a special plugin has been created and
implemented in browser core, other clients such as a pub needs to have
the [ssb-partial-replication] plugin installed.

Once a rpc connection has been established, a few extra methods are
available under SSB.net.partialReplication. See plugin for
documentation.

## SSB

Other things directly on the global SSB object

### dir

The path to where the database and blobs are stored.

### validate

The [ssb-validate] module.

### state

The current [state](https://github.com/ssbc/ssb-validate#state) of
known feeds.

### publish(msg, cb)

Validates a message and stores it in the database. See db.add for format.

### getPeer()

Gets one of the connected peers that is not a room server.

### box

[box](https://github.com/ssbc/ssb-keys#boxcontent-recipients--boxed)
method from ssb-keys. Useful for private messages.

### blobFiles

The [ssb-blob-files] module.

### SSB: loaded event

Because loading wasm is async, an event will be fired when `SSB` is
ready to use. Example:

```
SSB.events.on('SSB: loaded', function() {
  console.log("ready to rock!")
})
```

&nbsp;
&nbsp;

There are a few other undocumented methods, these will probably be
moved to another module in a later version as they are quite tied to
[ssb-browser-demo].

# Browser compatibility

Tested with Chrome and Firefox. Chrome is faster because it uses fs
instead of indexeddb. Also tested on android using Chrome and iOS
using safari.

# Building

Run `npm run build` for debugging and `npm run release` for a smaller
dist file.

For a smaller bundle file you can apply (patch -p0 < x.patch):
 - patches/sodium-browserify.patch

[ssb-server]: https://github.com/ssbc/ssb-server
[ssb-browser-demo]: https://github.com/arj03/ssb-browser-demo
[secret-stack]: https://github.com/ssbc/secret-stack
[ssb-ws]: https://github.com/ssbc/ssb-ws
[ssb-validate]: https://github.com/ssbc/ssb-validate
[ssb-blob-files]: https://github.com/ssbc/ssb-blob-files
[ssb-ooo]: https://github.com/ssbc/ssb-ooo
[ssb-conn]: https://github.com/staltz/ssb-conn

[ssb-get-thread]: https://github.com/arj03/ssb-get-thread
[ssb-partial-replication]: https://github.com/arj03/ssb-partial-replication
[jitdb]: https://github.com/arj03/jitdb

[slower]: https://github.com/arj03/ssb-browser-core/blob/master/scripts/sync.js#L17
[speed]: https://github.com/arj03/ssb-browser-core/blob/master/scripts/full-sync.js
