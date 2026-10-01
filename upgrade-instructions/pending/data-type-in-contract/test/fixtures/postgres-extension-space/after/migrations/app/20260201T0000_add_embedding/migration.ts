import type { Contract as End } from '../../snapshots/9949c9a4de52c984c90357d7db67bb7eb88e6e98ec18df4a007c33b96527f15f/contract';
import endContract from '../../snapshots/9949c9a4de52c984c90357d7db67bb7eb88e6e98ec18df4a007c33b96527f15f/contract.json' with {
  type: 'json',
};
import type { Contract as Start } from '../../snapshots/c31314ca769d51eb9d3717da46a91b6050cc6117ce284f2a69dc5d996e324af8/contract';
import startContract from '../../snapshots/c31314ca769d51eb9d3717da46a91b6050cc6117ce284f2a69dc5d996e324af8/contract.json' with {
  type: 'json',
};

export const contracts = { start: startContract, end: endContract };
export type Contracts = { start: Start; end: End };
