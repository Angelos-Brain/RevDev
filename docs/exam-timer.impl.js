/* exam-timer.impl.js — loads gzipped timer from chunk files */
(async function () {
  var parts = [];
  for (var i = 0; i < 4; i++) {
    var res = await fetch("./et_c" + i + ".txt?v=t11");
    if (!res.ok) throw new Error("Missing et_c" + i + ".txt");
    parts.push((await res.text()).replace(/\s+/g, ""));
  }
  var b64 = parts.join("");
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  var ds = new DecompressionStream("gzip");
  var stream = new Blob([bytes]).stream().pipeThrough(ds);
  var buf = await new Response(stream).arrayBuffer();
  var code = new TextDecoder().decode(buf);
  var blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  await import(blobUrl);
})();
