package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sort"
)

const (
	seed  = 12345
	total = 20_000
	reps  = 5
)

type ruleFn func(*RuleInput) RuleOutput

type passResult struct {
	checksum int
	perSec   float64
	p50us    float64
	p99us    float64
}

func runPass(rule ruleFn, sits []Situation, n int) passResult {
	lat := make([]float64, n)
	checksum := 0
	t0 := nowNs()
	for i := 0; i < n; i++ {
		s := nowNs()
		sit := &sits[i]
		var cores [3]CoreResult
		for j, p := range Responders(sit) {
			cores[j] = EvaluateCore(sit, p)
		}
		for j := range cores {
			checksum += ChecksumOf(&cores[j], rule(&cores[j].Input))
		}
		lat[i] = float64(nowNs() - s)
	}
	elapsed := float64(nowNs()-t0) / 1e9
	sort.Float64s(lat)
	pct := func(p float64) float64 {
		i := int(float64(n) * p)
		if i >= n {
			i = n - 1
		}
		return lat[i] / 1e3
	}
	return passResult{checksum, float64(n) / elapsed, pct(0.5), pct(0.99)}
}

func median(xs []float64) float64 {
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	return s[len(s)/2]
}

type result struct {
	Variant         string  `json:"variant"`
	N               int     `json:"n"`
	Checksum        int     `json:"checksum"`
	DecisionsPerSec float64 `json:"decisionsPerSec"`
	P50us           float64 `json:"p50us"`
	P99us           float64 `json:"p99us"`
	ChecksumOk      bool    `json:"checksumOk"`
}

func measure(name string, rule ruleFn, sits []Situation, n int) result {
	runPass(rule, sits, min(n, 2000)) // warmup
	var per, p50, p99 []float64
	checksum := -1
	for r := 0; r < reps; r++ {
		pr := runPass(rule, sits, n)
		if checksum != -1 && pr.checksum != checksum {
			panic(name + ": checksum differs between reps")
		}
		checksum = pr.checksum
		per = append(per, pr.perSec)
		p50 = append(p50, pr.p50us)
		p99 = append(p99, pr.p99us)
	}
	return result{name, n, checksum, median(per), median(p50), median(p99), true}
}

func micro(sits []Situation) map[string]float64 {
	var hands []Counts
	for i := range sits {
		for _, p := range sits[i].Players {
			hands = append(hands, p.Counts)
		}
	}
	for i := 0; i < 5000; i++ {
		Waits(&hands[i])
	}
	var w []float64
	for r := 0; r < reps; r++ {
		t0 := nowNs()
		for i := range hands {
			Waits(&hands[i])
		}
		w = append(w, float64(len(hands))/(float64(nowNs()-t0)/1e9))
	}
	rng := NewRng(1)
	var sink uint8
	for i := 0; i < 2000; i++ {
		sink ^= BuildWall(rng)[0]
	}
	var walls []float64
	for r := 0; r < reps; r++ {
		t0 := nowNs()
		for i := 0; i < 100_000; i++ {
			sink ^= BuildWall(rng)[0]
		}
		walls = append(walls, 100_000/(float64(nowNs()-t0)/1e9))
	}
	_ = sink
	return map[string]float64{"waitsPerSec": median(w), "wallsPerSec": median(walls)}
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "mem" {
		memMain()
		return
	}
	sits := GenerateSituations(NewRng(seed), total)

	reference := map[int]int{}
	for _, n := range []int{total, 5_000, 2_000, 1_000} {
		reference[n] = runPass(NativeRule, sits, n).checksum
	}

	star, err := NewStarlarkRule()
	if err != nil {
		panic(err)
	}
	starFn := func(x *RuleInput) RuleOutput {
		out, err := star.Evaluate(x)
		if err != nil {
			panic(err)
		}
		return out
	}

	var results []result
	add := func(r result, verify bool) {
		if verify {
			r.ChecksumOk = r.Checksum == reference[r.N]
		}
		results = append(results, r)
		mark := ""
		if !r.ChecksumOk {
			mark = " MISMATCH"
		}
		fmt.Fprintf(os.Stderr, "%-58s %9.0f/s  p50 %8.1fus  p99 %8.1fus  checksum %d%s\n",
			r.Variant, r.DecisionsPerSec, r.P50us, r.P99us, r.Checksum, mark)
	}

	add(measure("core-only (no rule)", func(*RuleInput) RuleOutput { return RuleOutput{} }, sits, total), false)
	add(measure("go native", NativeRule, sits, total), true)
	add(measure("go + Starlark in-process", starFn, sits, total), true)

	out := map[string]any{
		"language":  "go",
		"runtime":   runtime.Version(),
		"seed":      seed,
		"reference": reference,
		"micro":     micro(sits),
		"results":   results,
	}
	fmt.Fprintln(os.Stderr, "micro", out["micro"])
	b, _ := json.MarshalIndent(out, "", "  ")
	if err := os.WriteFile("../results/go.json", b, 0o644); err != nil {
		panic(err)
	}
	for _, r := range results {
		if !r.ChecksumOk {
			os.Exit(1)
		}
	}
}
