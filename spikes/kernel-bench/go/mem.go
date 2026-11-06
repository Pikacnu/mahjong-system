package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
)

// rssMb reads VmRSS from /proc (Linux only; the benchmark runs in a container).
func rssMb() float64 {
	f, err := os.Open("/proc/self/status")
	if err != nil {
		return -1
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		if strings.HasPrefix(s.Text(), "VmRSS:") {
			kb, _ := strconv.ParseFloat(strings.Fields(s.Text())[1], 64)
			return kb / 1024
		}
	}
	return -1
}

// memMain measures memory per game for one Starlark rule instance (compiled module + thread).
// Usage: go run . mem <count>
func memMain() {
	count := 300
	if len(os.Args) > 2 {
		count, _ = strconv.Atoi(os.Args[2])
	}
	runtime.GC()
	debug.FreeOSMemory()
	before := rssMb()
	keep := make([]*StarlarkRule, 0, count)
	for i := 0; i < count; i++ {
		r, err := NewStarlarkRule()
		if err != nil {
			panic(err)
		}
		keep = append(keep, r)
	}
	runtime.GC()
	debug.FreeOSMemory()
	after := rssMb()
	b, _ := json.Marshal(map[string]any{
		"mode": "starlark", "count": len(keep),
		"rssBeforeMb": before, "rssAfterMb": after,
		"perUnitMb": (after - before) / float64(count),
	})
	fmt.Println(string(b))
	runtime.KeepAlive(keep)
}
