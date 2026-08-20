# Solidity Gas Lens

Live gas-cost inlay hints for Solidity function signatures, measured
against a local [Anvil](https://book.getfoundry.sh/anvil/) node — no
manual `forge test --gas-report` round-trip.

![demo](images/demo.gif)

## Features

- **Save a `.sol` file, see gas numbers.** Every public/external function
  gets an inlay hint showing its measured gas cost at the end of the
  signature line, with a hover tooltip breaking down base vs. execution
  gas and the inputs used.
- **Increase/decrease coloring.** Gas that goes up more than the
  configured threshold since the last measurement shows 🟠; a decrease
  shows 🟢.
- **Foundry mode.** If a matching `*.t.sol` test file exists next to your
  contract, real argument values are extracted from it and used instead of
  zero-value placeholders — functions that revert under a placeholder
  input (e.g. anything behind a `require(amount > 0)`) get measured using
  values you already know are valid.
- **Local and ephemeral.** Anvil runs as a child process on your machine
  only; nothing leaves localhost.

## Requirements

[Foundry](https://book.getfoundry.sh/getting-started/installation) must be
installed — specifically the `anvil` binary, which this extension spawns
(or connects to, if you're already running one) to measure gas:

```
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `gasLens.enabled` | `true` | Turn gas measurement on save off entirely. |
| `gasLens.anvilPort` | `8545` | Port to spawn or connect to Anvil on. |
| `gasLens.foundryMode` | `true` | Extract real argument values from a matching Foundry `*.t.sol` test file instead of zero-value placeholders, where possible. |
| `gasLens.gasIncreaseThreshold` | `5` | Percent gas increase required to show the increase glyph on a hint. |
| `gasLens.gasDecreaseThreshold` | `5` | Percent gas decrease required to show the decrease glyph on a hint. |
| `gasLens.showOnlyPublic` | `false` | Only measure `public` functions, skipping `external`. |

## How it works

On save, the extension parses the file's function signatures, compiles it
with `solc`, deploys it to a local Anvil instance, and calls
`eth_estimateGas` for each function — using real inputs extracted from a
Foundry test file when available, zero-value placeholders otherwise. View
functions and precondition-heavy functions with no usable input source may
not be measurable.
