# @universe/chains

Shared interfaces for Ethers.js and viem

## Background

Ethers.js + viem = etheim

This project provides a shared interface for interacting with the Ethereum
blockchain. We provide it to make migration from Ethers.js -\> viem easier,
test differences between both dependencies during that transition, and mock
implementations in consumer-based tests. When migration is completed, only this
package in the monorepo will depend on Ethers.js and viem directly.
