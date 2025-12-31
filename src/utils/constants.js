"use strict";
const { getType } = require("./format");
const stream = require("stream");
function getFrom(html, a, b) {
  const i = html.indexOf(a);
  if (i < 0) return;
  const start = i + a.length;
  const j = html.indexOf(b, start);
  return j < 0 ? undefined : html.slice(start, j);
}
function isReadableStream(obj) {
  return (
    obj instanceof stream.Stream &&
    (getType(obj._read) === "Function" ||
      getType(obj._read) === "AsyncFunction") &&
    getType(obj._readableState) === "Object"
  );
}

module.exports = {
  getFrom,
  isReadableStream
};
