Three 2-second HLS segments with synthetic blue frames. The browser test varies the
number of segments listed in the manifest to simulate a growing conversion.

```sh
ffmpeg -f lavfi -i color=blue:size=64x64:rate=12 -t 6 -c:v libx264 \
  -pix_fmt yuv420p -preset ultrafast -g 24 -sc_threshold 0 -an \
  -hls_time 2 -hls_list_size 0 -hls_playlist_type event \
  -hls_flags independent_segments -hls_segment_filename 'segment-%d.bin' index.m3u8
```

The binary files contain MPEG transport streams. The extension keeps them out of
TypeScript tooling.
