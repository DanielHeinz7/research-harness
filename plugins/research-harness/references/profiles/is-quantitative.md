# Profile: is-quantitative

Information systems, hypothetico-deductive work: experiments and surveys that
test hypotheses derived from prior theory. A sibling of `is-qualitative.md`;
copy, change, open a pull request. Mixed methods is not covered; it would be a
third profile.

A profile owns three things: which elements carry weight and how their
questions are read; the dependency graph; and which modules attach where. It
states its commitments in prose a researcher can dispute. It produces no score.

## Emphasis

The canvas's authors note that the theoretical framework is "either driving the
research (in quantitative studies) or emerging from it (in qualitative ones)"
(Dorobantu et al. 2024). This profile takes the first reading:

- **Element 2 (Prior Research) drives the question.** The gap, conflict or
  silence in prior findings is where the question comes from.
- **Element 4 (Constructs) holds the hypotheses**, each with its constructs and
  the theory behind it, firm before data exist. Read with Sparrowe & Mayer
  (2011), *Publishing in AMJ — Part 4*.
- **Element 6 (Design) holds manipulations, measures, the analysis plan and the
  power argument.** Read with Bono & McNamara (2011), *Publishing in AMJ —
  Part 2*.
- **Element 5 (Setting) is the population and the sample** the theory applies
  to.
- **Element 9 (Boundaries) is the scope of the generalization**, judged against
  the sample and the findings.

## Dependency graph

An element may not be `[accepted]` while an element it depends on is not.
Reported by `canvas-review`, never enforced. This is the order in which the
canvas presents its elements, which `is-qualitative.md` names as the
hypothetico-deductive one. Each edge is a design proposal, not settled method.

```graph
1 <-
2 <- 1
3 <- 1, 2
4 <- 2, 3
5 <- 3, 4
6 <- 4, 5
7 <- 6
9 <- 5, 7
8 <- 2, 4, 7
```

- `3 ← 2`: the question comes out of prior research, not from the phenomenon
  alone.
- `4 ← 2, 3`: hypotheses are derived from theory and answer the question.
- `5 ← 4`: the sample is chosen where the hypotheses apply.
- `6 ← 4, 5`: the design operationalizes the constructs in that sample.
- `9 ← 5, 7`: how far the result generalizes depends on the sample and on what
  was found.

## Modules

| Element | Module |
|---|---|
| 4, 6 | `references/preregistration.md` — hypotheses and analysis plan before data |
| all | `references/amj-map.md` — which part of *Publishing in AMJ* to read for each element |

```checks
hypotheses-before-data
```
