import type { Contract as End } from '../../snapshots/c31314ca769d51eb9d3717da46a91b6050cc6117ce284f2a69dc5d996e324af8/contract';
import endContract from '../../snapshots/c31314ca769d51eb9d3717da46a91b6050cc6117ce284f2a69dc5d996e324af8/contract.json' with {
  type: 'json',
};

export const contracts = { start: null, end: endContract };
export type Contracts = { start: never; end: End };
