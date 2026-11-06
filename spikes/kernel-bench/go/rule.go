package main

import (
	_ "embed"
	"fmt"

	"go.starlark.net/starlark"
	"go.starlark.net/syntax"
)

// NativeRule mirrors ../ts/src/rule.js in Go.
func NativeRule(x *RuleInput) RuleOutput {
	h := x.Hand
	tanyao := true
	for k := 0; k < Kinds; k++ {
		if h[k] > 0 && (k >= 27 || k%9 == 0 || k%9 == 8) {
			tanyao = false
			break
		}
	}
	yakuhai := 0
	for _, k := range [...]int{31, 32, 33, x.SeatWind, x.RoundWind} {
		if h[k] >= 3 {
			yakuhai++
		}
	}
	furiten := false
	for _, w := range x.Waits {
		for _, d := range x.Discards {
			if w == d {
				furiten = true
				break
			}
		}
		if furiten {
			break
		}
	}
	canRon := x.RonDecomps > 0 && !furiten && (tanyao || yakuhai > 0)
	return RuleOutput{Furiten: furiten, Tanyao: tanyao, Yakuhai: yakuhai, CanRon: canRon}
}

//go:embed rule.star
var ruleStar string

// StarlarkRule compiles rule.star once and calls evaluate() per input.
// Conversion of inputs and outputs is included in the cost, like JSON for QuickJS.
type StarlarkRule struct {
	thread *starlark.Thread
	fn     starlark.Callable
}

func NewStarlarkRule() (*StarlarkRule, error) {
	thread := &starlark.Thread{Name: "rule"}
	globals, err := starlark.ExecFileOptions(&syntax.FileOptions{}, thread, "rule.star", ruleStar, nil)
	if err != nil {
		return nil, err
	}
	fn, ok := globals["evaluate"].(starlark.Callable)
	if !ok {
		return nil, fmt.Errorf("rule.star: evaluate is not callable")
	}
	return &StarlarkRule{thread: thread, fn: fn}, nil
}

func intList(xs []int) *starlark.List {
	vals := make([]starlark.Value, len(xs))
	for i, v := range xs {
		vals[i] = starlark.MakeInt(v)
	}
	return starlark.NewList(vals)
}

func (s *StarlarkRule) Evaluate(x *RuleInput) (RuleOutput, error) {
	hand := make([]starlark.Value, Kinds)
	for k := 0; k < Kinds; k++ {
		hand[k] = starlark.MakeInt(int(x.Hand[k]))
	}
	d := starlark.NewDict(6)
	_ = d.SetKey(starlark.String("hand"), starlark.NewList(hand))
	_ = d.SetKey(starlark.String("waits"), intList(x.Waits))
	_ = d.SetKey(starlark.String("discards"), intList(x.Discards))
	_ = d.SetKey(starlark.String("seatWind"), starlark.MakeInt(x.SeatWind))
	_ = d.SetKey(starlark.String("roundWind"), starlark.MakeInt(x.RoundWind))
	_ = d.SetKey(starlark.String("ronDecomps"), starlark.MakeInt(x.RonDecomps))

	res, err := starlark.Call(s.thread, s.fn, starlark.Tuple{d}, nil)
	if err != nil {
		return RuleOutput{}, err
	}
	out, ok := res.(*starlark.Dict)
	if !ok {
		return RuleOutput{}, fmt.Errorf("evaluate returned %s", res.Type())
	}
	get := func(key string) starlark.Value {
		v, _, _ := out.Get(starlark.String(key))
		return v
	}
	yakuhai, _ := starlark.AsInt32(get("yakuhai"))
	return RuleOutput{
		Furiten: bool(get("furiten").Truth()),
		Tanyao:  bool(get("tanyao").Truth()),
		Yakuhai: yakuhai,
		CanRon:  bool(get("canRon").Truth()),
	}, nil
}
