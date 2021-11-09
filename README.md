# SSB browser core

Run Secure Scuttlebutt (similar to [ssb-server]) in a browser.

SSB browser core is a full implementation of SSB running in the
browser only (but not limited to, of course). Your feed key is stored
in the browser together with the log, indexes and smaller images. Wasm
is used for crypto and is around 90% the speed of the C
implementation. A WebSocket is used to connect to pubs or [rooms]. The
size of the bundle is roughly 2 mb.

## Usage

The simplest way to get started using ssb-browser-core is to look at
the [ssb-browser-example] repo. For a more full fledged example see
[8K demo].

Note a browser can have multiple tabs open and for this reason you
need to use a [`singleton`](#ssb-singleton) to avoid data corruption.

## Browser compatibility

Tested with Chrome and Firefox. Chrome is faster because it uses fs
instead of indexeddb. Also tested on android using Chrome and on iOS
using safari.

## Modules

![Diagram](./diagram.svg)

Boxes represent modules, some internal to browser-core and some
external. Ellipses in gray represents overall areas and are thus not
modules.

<details>
3`graphviz
digraph hierarchy {
nodesep=0.6 node [shape=record];

{ rank=same SSBBrowserCore Validate Keys } 
{ rank=same SSBBrowserCore MultiServer MuxRPC }

Network [shape=ellipse style=filled]
Connections [shape=ellipse style=filled]
Sync [shape=ellipse style=filled]
Feed [shape=ellipse style=filled]

SSBBrowserCore->{Network Connections Sync SSBDB2 Feed} Feed->{Validate Keys} Connections->{SSBConn Rooms} Network->{MultiServer MuxRPC SecretHandshake} Sync->{FeedSyncer EBT Blobs} SSBDB2->{Indexes JITDB AsyncAppendOnlyLog } }
3`
</details>

## Configuration

To change some of the default options from `net.js` you can use:

```
const ssbSingleton = require('ssb-browser-core/ssb-singleton')

function extraModules(secretStack) {
  // add extra modules here
  return secretStack
}

const config = {
  blobs: { max: 512 * 1024 }
}

ssbSingleton.setup("/.ssb-example", config, extraModules)
```

## API

The `SSB` object one gets from the [`singleton`](#ssb-singleton) is a
[secret-stack] with some extra plugins loadings by default. A few
helper functions are included under helpers:

### connectAndRemember(addr, data)

Will connect and store as to automatically reconnect on
reload. Options are as described in [ssb-conn].

### getPeer()

Gets one of the connected peers that is not a room server.

### getGraphForFeed(feed, cb)

Returns an object of: following, blocking and extended given the feed.

### box

The
[box](https://github.com/ssbc/ssb-keys#boxcontent-recipients--boxed)
method from ssb-keys. Useful for private messages.

### blobs

The blobs module is a little special compared to default ssb-blobs. It
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

## SSB Singleton

Several of the libraries we use (such as db2 and
async-append-only-log) are not thread-safe. This poses problems for
apps written using ssb-browser-core because you, as a developer, have
no control over the number of concurrent tabs a user can have open.
This causes all kinds of problems with data corruption.

Enter SSB Singleton.

SSB Singleton uses a localStorage-based mutex system and timeouts to
ensure that one (and only one) SSB object is active for the same
origin at any given time.  SSB Singleton can also manage coordinating
multiple windows so that child windows can use their parent window's
SSB object instead of just failing to acquire a lock.

This does result in a slight delay upon startup where it checks for
open locks.  So we've provided several ways to be notified when SSB
has been initialized.  Here is a rough idea of how the API works:

### SSB Singleton API

#### `setup(dir, config, extraModules)`

Setup the SSB Singleton module. This is required to be called before
trying to access SSB. Does *not* actually trigger the initialization
of SSB (see `getSSBEventually`).

* `dir` - *String*, A name like "/.ssb-lite".
* `config` - *Object*, configuration object to pass through to
  `ssb-browser-core/core`'s `init` function.
* `extraModules` - *Function (optional)*, function to call to add more
  modules to the SecretStack during initialization - passed through to
  `ssb-browser-core/core`'s `init` function.

#### `getSimpleSSBEventually(isRelevant, cb)`

Shorthand easy version of `getSSBEventually`. Retries indefinitely
(without timing out) and assumes that an SSB which has initialized its
database is suitable for your use (see `ssbCheckCB` for how this
works).

* `isRelevant` - Optional, if not provided will be a function that
  always returns true. See `getSSBEventually` for more information.
* `cb` - See `getSSBEventually` for more information.

#### `getSSBEventually(timeout, isRelevant, ssbCheck, result)`

Asynchronous function to keep trying to get an SSB object, even if one
is not currently available.

* `timeout` - *Number*, number of milliseconds to keep trying to get
  an SSB object before giving up and timing out with an error.  Pass a
  negative value to disable timing out and keep trying indefinitely.
* `isRelevant` - *Function*, a function which is called with zero
  arguments and is expected to return a boolean value of whether or
  not the caller still needs the SSB object. This can be used, for
  example, to bail on running calls to `getSSBEventually` when a Vue
  component using it has been unloaded, so we don't waste resources
  retrying forever.
* `ssbCheck` - *Function*, since `getSSBEventually` might be called
  while an SSB object is still initializing, this function is called
  to ask whether the SSB object is initialized enough to use. The
  function is passed SSB and is expected to return a boolean value for
  whether it's good enough to use. This could be: `return SSB &&
  SSB.db`.
* `cb` - *Function*, called when either there's an error, a timeout,
  or we successfully acquired SSB and it has been declared suitable by
  `ssbCheck`. Note if `isRelevant` this is not called.

#### `getSSB() => [ err, SSB ]`

Attempt to get an SSB object and immediately fail if it is not
available. If the SSB object is available, `err` will be null and
`SSB` will contain the SSB object even if it's not yet fully and
completely initialized yet. Otherwise `err` will contain the reason.

#### `openWindow(href)`

Since we can only have one SSB object active, if we want child windows
to be able to operate concurrently with us, we need to be able to
coordinate with other windows. This function programmatically opens a
new window and adds the new window's handle to a tracking list so that
child windows can coordinate with their parent window's SSB as well as
other windows within the same family in case the parent window is
closed and a new SSB holder needs to be elected. In other words, for
best results, make sure that everything in your app which can open a
window calls this function.

* `href` - *String*, URL to open in the new window, just like you
  would normally pass to `window.open`.

#### `onChangeSSB(cb)`

Register a callback which is called when the primary controller window
changes and SSB has been reinitialized.  The intended use is for
things like pull streams to be able to reinitialize themselves.  The
list of callbacks is not cleared when the controller changes, so you
only need to register here once to be notified every time a change
happens.

* `cb` - *Function*, callback with zero parameters to be called when
  the primary controller changes.

#### `onError(cb)`

Register a callback which is called when an error occurs in trying to
access SSB, such as if we're waiting for a lock or otherwise cannot
acquire an SSB.  The intended use of this is to display an error to
the user.  The list of callbacks is not cleared when an error occurs,
so you only need to register here once.

* `cb` - *Function*, callback with zero parameters to be called when
  an error occurs in acquiring an SSB object.

#### `onSuccess(cb)`

Register a callback which is called when SSB has been successfully
acquired within our window/tab.  The intended use of this is to hide
error messages shown by `onError` callbacks.  The list of callbacks is
not cleared when SSB is successfully acquired, so expect your callback
to be called many, many times over the course of the application's
operation.  Keep your callback short, sweet, and to the point.

* `cb` - *Function*, callback with zero parameters to be called when
  an SSB object has been successfully acquired.  Does not provide the
  actual SSB object - this is strictly a notification function.

## Building

Run `npm run build` for debugging and `npm run release` for a smaller
dist file.

For a smaller bundle file you can apply (patch -p0 < x.patch):
 - patches/sodium-browserify.patch

## Notes on performance

Replication in the browser is quite a bit slower than in node, around
2x. There doesn't seem to be a single cause, it appears to be all the
diferrent layers that are [slower]: end-to-end encryption, database
write etc.

Partial replication [speed] on a fast laptop is roughly 425 feeds in 56
seconds, and roughly half of that on a slow laptop or when running on
battery.


[ssb-server]: https://github.com/ssbc/ssb-server
[secret-stack]: https://github.com/ssbc/secret-stack
[ssb-blob-files]: https://github.com/ssbc/ssb-blob-files
[ssb-ooo]: https://github.com/ssbc/ssb-ooo
[ssb-conn]: https://github.com/staltz/ssb-conn
[ssb-db2]: https://github.com/ssb-ngi-pointer/ssb-db2

[rooms]: https://github.com/ssb-ngi-pointer/go-ssb-room
[8K demo]: https://github.com/ssb-ngi-pointer/8k-demo
[ssb-browser-example]: https://github.com/arj03/ssb-browser-example/
[ssb-partial-replication]: https://github.com/arj03/ssb-partial-replication
[jitdb]: https://github.com/arj03/jitdb

[slower]: https://github.com/arj03/ssb-browser-core/blob/master/scripts/sync.js#L17
[speed]: https://github.com/arj03/ssb-browser-core/blob/master/scripts/full-sync.js
