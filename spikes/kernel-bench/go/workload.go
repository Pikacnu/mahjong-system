package main

// Mirrors ../ts/src/workload.ts. Same RNG call order, so the same situations.

type Responder struct {
	Seat     int
	Counts   Counts
	Discards []int
}

type Situation struct {
	Discarder   int
	DiscardKind int
	Players     [4]Responder
}

type RuleInput struct {
	Hand       *Counts
	Waits      []int
	Discards   []int
	SeatWind   int
	RoundWind  int
	RonDecomps int
}

type RuleOutput struct {
	Furiten bool
	Tanyao  bool
	Yakuhai int
	CanRon  bool
}

func randomHand(r *Rng) Counts {
	var c Counts
	for n := 0; n < 13; {
		k := r.Intn(Kinds)
		if c[k] < 4 {
			c[k]++
			n++
		}
	}
	return c
}

func tenpaiHand(r *Rng) Counts {
	var c Counts
	c[r.Intn(Kinds)] += 2
	for m := 0; m < 4; m++ {
		for {
			if r.Intn(2) == 0 {
				k := r.Intn(Kinds)
				if c[k]+3 <= 4 {
					c[k] += 3
					break
				}
			} else {
				k := r.Intn(3)*9 + r.Intn(7)
				if c[k] < 4 && c[k+1] < 4 && c[k+2] < 4 {
					c[k]++
					c[k+1]++
					c[k+2]++
					break
				}
			}
		}
	}
	tiles := make([]int, 0, 14)
	for k := 0; k < Kinds; k++ {
		for i := 0; i < int(c[k]); i++ {
			tiles = append(tiles, k)
		}
	}
	c[tiles[r.Intn(14)]]--
	return c
}

func GenerateSituations(r *Rng, count int) []Situation {
	out := make([]Situation, count)
	for s := range out {
		sit := &out[s]
		sit.Discarder = r.Intn(4)
		sit.DiscardKind = r.Intn(Kinds)
		for seat := 0; seat < 4; seat++ {
			var c Counts
			if r.Intn(2) == 0 {
				c = randomHand(r)
			} else {
				c = tenpaiHand(r)
			}
			n := r.Intn(13)
			discards := make([]int, n)
			for i := range discards {
				discards[i] = r.Intn(Kinds)
			}
			sit.Players[seat] = Responder{Seat: seat, Counts: c, Discards: discards}
		}
	}
	return out
}

type CoreResult struct {
	CanPon bool
	CanChi bool
	Input  RuleInput
}

func EvaluateCore(sit *Situation, p *Responder) CoreResult {
	c := &p.Counts
	d := sit.DiscardKind
	ron := 0
	if c[d] < 4 {
		c[d]++
		ron = CountDecompositions(c)
		c[d]--
	}
	canPon := c[d] >= 2
	canChi := false
	if p.Seat == (sit.Discarder+1)%4 && d < 27 {
		r := d % 9
		canChi = (r >= 2 && c[d-2] > 0 && c[d-1] > 0) ||
			(r >= 1 && r <= 7 && c[d-1] > 0 && c[d+1] > 0) ||
			(r <= 6 && c[d+1] > 0 && c[d+2] > 0)
	}
	return CoreResult{
		CanPon: canPon,
		CanChi: canChi,
		Input: RuleInput{
			Hand: c, Waits: Waits(c), Discards: p.Discards,
			SeatWind: 27 + p.Seat, RoundWind: 27, RonDecomps: ron,
		},
	}
}

func Responders(sit *Situation) [3]*Responder {
	return [3]*Responder{
		&sit.Players[(sit.Discarder+1)%4],
		&sit.Players[(sit.Discarder+2)%4],
		&sit.Players[(sit.Discarder+3)%4],
	}
}

func ChecksumOf(cr *CoreResult, r RuleOutput) int {
	sum := cr.Input.RonDecomps + len(cr.Input.Waits)*7
	if cr.CanPon {
		sum += 3
	}
	if cr.CanChi {
		sum += 5
	}
	if r.Furiten {
		sum += 11
	}
	if r.Tanyao {
		sum += 13
	}
	sum += r.Yakuhai * 17
	if r.CanRon {
		sum += 19
	}
	return sum
}
