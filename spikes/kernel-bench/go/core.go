// Kernel hot-path primitives. Must produce results identical to ../ts/src/core.ts.
package main

const Kinds = 34

type Counts [Kinds]int8

// Rng is mulberry32 with uint32 wraparound, identical to the TS createRng.
type Rng struct{ state uint32 }

func NewRng(seed uint32) *Rng { return &Rng{state: seed} }

func (r *Rng) Next() uint32 {
	r.state += 0x6d2b79f5
	t := r.state
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + (t^(t>>7))*(t|61)
	return t ^ (t >> 14)
}

// Intn returns Next() % n, matching the TS `rng() % n`.
func (r *Rng) Intn(n int) int { return int(r.Next() % uint32(n)) }

func BuildWall(r *Rng) [136]uint8 {
	var wall [136]uint8
	for i := range wall {
		wall[i] = uint8(i)
	}
	for i := 135; i > 0; i-- {
		j := r.Intn(i + 1)
		wall[i], wall[j] = wall[j], wall[i]
	}
	return wall
}

func countMelds(c *Counts, start int) int {
	i := start
	for i < Kinds && c[i] == 0 {
		i++
	}
	if i == Kinds {
		return 1
	}
	ways := 0
	if c[i] >= 3 {
		c[i] -= 3
		ways += countMelds(c, i)
		c[i] += 3
	}
	if i < 27 && i%9 <= 6 && c[i+1] > 0 && c[i+2] > 0 {
		c[i]--
		c[i+1]--
		c[i+2]--
		ways += countMelds(c, i)
		c[i]++
		c[i+1]++
		c[i+2]++
	}
	return ways
}

func hasMelds(c *Counts, start int) bool {
	i := start
	for i < Kinds && c[i] == 0 {
		i++
	}
	if i == Kinds {
		return true
	}
	if c[i] >= 3 {
		c[i] -= 3
		ok := hasMelds(c, i)
		c[i] += 3
		if ok {
			return true
		}
	}
	if i < 27 && i%9 <= 6 && c[i+1] > 0 && c[i+2] > 0 {
		c[i]--
		c[i+1]--
		c[i+2]--
		ok := hasMelds(c, i)
		c[i]++
		c[i+1]++
		c[i+2]++
		if ok {
			return true
		}
	}
	return false
}

var terminalsHonors = [...]int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}

func isChiitoi(c *Counts) bool {
	pairs := 0
	for k := 0; k < Kinds; k++ {
		if c[k] == 2 {
			pairs++
		} else if c[k] != 0 {
			return false
		}
	}
	return pairs == 7
}

func isKokushi(c *Counts) bool {
	total, hasPair := 0, false
	for _, k := range terminalsHonors {
		if c[k] == 0 {
			return false
		}
		if c[k] == 2 {
			hasPair = true
		}
		total += int(c[k])
	}
	return total == 14 && hasPair
}

// CountDecompositions counts decompositions of a 14-tile hand (standard + chiitoi + kokushi).
func CountDecompositions(c *Counts) int {
	total := 0
	for p := 0; p < Kinds; p++ {
		if c[p] >= 2 {
			c[p] -= 2
			total += countMelds(c, 0)
			c[p] += 2
		}
	}
	if isChiitoi(c) {
		total++
	}
	if isKokushi(c) {
		total++
	}
	return total
}

func IsComplete(c *Counts) bool {
	for p := 0; p < Kinds; p++ {
		if c[p] >= 2 {
			c[p] -= 2
			ok := hasMelds(c, 0)
			c[p] += 2
			if ok {
				return true
			}
		}
	}
	return isChiitoi(c) || isKokushi(c)
}

// Waits returns the kinds that complete a 13-tile hand.
func Waits(c *Counts) []int {
	out := make([]int, 0, 13)
	for k := 0; k < Kinds; k++ {
		if c[k] >= 4 {
			continue
		}
		c[k]++
		if IsComplete(c) {
			out = append(out, k)
		}
		c[k]--
	}
	return out
}

// ParseHand parses "123m456p789s11122z". z: 1-4 winds, 5-7 dragons.
func ParseHand(text string) Counts {
	var c Counts
	var digits []int
	for _, ch := range text {
		if ch >= '0' && ch <= '9' {
			digits = append(digits, int(ch-'0'))
			continue
		}
		base := map[rune]int{'m': 0, 'p': 9, 's': 18, 'z': 27}[ch]
		for _, d := range digits {
			c[base+d-1]++
		}
		digits = digits[:0]
	}
	return c
}
