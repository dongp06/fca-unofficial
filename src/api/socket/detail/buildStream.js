"use strict";

const { Writable, PassThrough } = require("stream");
const Duplexify = require("duplexify");

function buildProxy() {
  let target = null;
  let ended = false;
  const Proxy = new Writable({
    autoDestroy: true,
    write(chunk, enc, cb) {
      if (ended || this.destroyed) return cb();
      const ws = target;
      if (ws && ws.readyState === 1) {
        try {
          ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), cb);
        } catch (e) {
          cb(e);
        }
      } else cb();
    },
    writev(chunks, cb) {
      if (ended || this.destroyed) return cb();
      const ws = target;
      if (!ws || ws.readyState !== 1) return cb();
      try {
        for (const { chunk } of chunks) {
          ws.send(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        cb();
      } catch (e) {
        cb(e);
      }
    },
    final(cb) {
      ended = true;
      const ws = target;
      target = null;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
        try {
          typeof ws.terminate === "function" ? ws.terminate() : ws.close();
        } catch { }
      }
      cb();
    }
  });
  Proxy.setTarget = ws => {
    if (ended) return;
    target = ws;
  };
  Proxy.hardEnd = () => {
    ended = true;
    target = null;
  };
  return Proxy;
}

function buildStream(options, WebSocket, Proxy) {
  const readable = new PassThrough();
  const Stream = Duplexify(undefined, undefined, Object.assign({ end: false, autoDestroy: true }, options));
  const NoopWritable = new Writable({ write(_c, _e, cb) { cb(); } });
  let ws = WebSocket;
  let pingTimer = null;
  let livenessTimer = null;
  let lastActivity = Date.now();
  let attached = false;
  let style = "prop";
  let closed = false;

  const toBuffer = d => {
    if (Buffer.isBuffer(d)) return d;
    if (d instanceof ArrayBuffer) return Buffer.from(d);
    if (ArrayBuffer.isView(d)) return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
    return Buffer.from(String(d));
  };

  const swapToNoopWritable = () => {
    try { Stream.setWritable(NoopWritable); } catch { }
  };

  const onOpen = () => {
    if (closed) return;
    Proxy.setTarget(ws);
    Stream.setWritable(Proxy);
    Stream.setReadable(readable);
    Stream.emit("connect");
    lastActivity = Date.now();
    clearInterval(pingTimer);
    clearInterval(livenessTimer);
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      if (typeof ws.ping === "function") {
        try { ws.ping(); } catch { }
      } else {
        try { ws.send("ping"); } catch { }
      }
    }, 30000);
    livenessTimer = setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - lastActivity > 65000) {
        try { typeof ws.terminate === "function" ? ws.terminate() : ws.close(); } catch { }
      }
    }, 10000);
  };

  const onMessage = data => {
    lastActivity = Date.now();
    readable.write(toBuffer(style === "dom" && data && data.data !== undefined ? data.data : data));
  };

  const onPong = () => {
    lastActivity = Date.now();
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(pingTimer);
    clearInterval(livenessTimer);
    pingTimer = null;
    livenessTimer = null;
    Proxy.hardEnd();
    swapToNoopWritable();
    if (ws) {
      detach(ws);
      try {
        if (ws.readyState === 1) {
          typeof ws.terminate === "function" ? ws.terminate() : ws.close();
        }
      } catch { }
      ws = null;
    }
    readable.end();
  };

  const onError = err => {
    cleanup();
    Stream.destroy(err);
  };

  const onClose = () => {
    cleanup();
    Stream.end();
    if (!Stream.destroyed) Stream.destroy();
  };

  const attach = w => {
    if (attached || !w) return;
    attached = true;
    if (typeof w.on === "function" && typeof w.off === "function") {
      style = "node";
      w.on("open", onOpen);
      w.on("message", onMessage);
      w.on("error", onError);
      w.on("close", onClose);
      if (typeof w.on === "function") w.on("pong", onPong);
    } else if (typeof w.addEventListener === "function" && typeof w.removeEventListener === "function") {
      style = "dom";
      w.addEventListener("open", onOpen);
      w.addEventListener("message", onMessage);
      w.addEventListener("error", onError);
      w.addEventListener("close", onClose);
    } else {
      style = "prop";
      w.onopen = onOpen;
      w.onmessage = onMessage;
      w.onerror = onError;
      w.onclose = onClose;
    }
  };

  const detach = w => {
    if (!attached || !w) return;
    attached = false;
    if (style === "node" && typeof w.off === "function") {
      w.off("open", onOpen);
      w.off("message", onMessage);
      w.off("error", onError);
      w.off("close", onClose);
      if (typeof w.off === "function") w.off("pong", onPong);
    } else if (style === "dom" && typeof w.removeEventListener === "function") {
      w.removeEventListener("open", onOpen);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      w.removeEventListener("close", onClose);
    } else {
      w.onopen = null;
      w.onmessage = null;
      w.onerror = null;
      w.onclose = null;
    }
  };

  attach(ws);
  if (ws && ws.readyState === 1) onOpen();

  Stream.on("prefinish", swapToNoopWritable);
  Stream.on("finish", cleanup);
  Stream.on("close", cleanup);
  Proxy.on("close", swapToNoopWritable);

  return Stream;
}

module.exports = {
  buildProxy,
  buildStream
};
