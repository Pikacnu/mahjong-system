package main

import "time"

// Run the benchmark on Linux: Windows' monotonic clock has ~0.5ms resolution,
// which makes per-decision percentiles meaningless there.
var clockStart = time.Now()

func nowNs() int64 { return int64(time.Since(clockStart)) }
