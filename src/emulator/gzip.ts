/** Gzip in the browser. GBA SRAM is mostly 0xFF padding, so 128 KB saves shrink to a
 * few KB, which keeps unload-time uploads under the 64 KB keepalive limit. */
export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
