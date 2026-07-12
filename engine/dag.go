package meergine

import "github.com/hasimyerli/meergine/model"

type DAG struct {
	nodes     []int
	edges     map[int][]int
	nameToIdx map[string]int
}

func BuildDAG(steps []model.TestStep) *DAG {
	d := &DAG{
		edges:     make(map[int][]int),
		nameToIdx: make(map[string]int),
	}

	for i, s := range steps {
		d.nodes = append(d.nodes, i)
		d.nameToIdx[s.Name] = i
	}

	for i, s := range steps {
		for _, dep := range s.DependsOn {
			if depIdx, ok := d.nameToIdx[dep]; ok {
				d.edges[depIdx] = append(d.edges[depIdx], i)
			}
		}
	}

	return d
}

func (d *DAG) TopologicalBatches() [][]int {
	inDegree := make(map[int]int)
	for _, n := range d.nodes {
		inDegree[n] = 0
	}
	for _, targets := range d.edges {
		for _, t := range targets {
			inDegree[t]++
		}
	}

	var batches [][]int
	remaining := make(map[int]bool)
	for _, n := range d.nodes {
		remaining[n] = true
	}

	for len(remaining) > 0 {
		var batch []int
		for n := range remaining {
			if inDegree[n] == 0 {
				batch = append(batch, n)
			}
		}

		if len(batch) == 0 {
			// Cycle detected, add remaining
			for n := range remaining {
				batch = append(batch, n)
			}
			batches = append(batches, batch)
			break
		}

		batches = append(batches, batch)
		for _, n := range batch {
			delete(remaining, n)
			for _, t := range d.edges[n] {
				inDegree[t]--
			}
		}
	}

	return batches
}
