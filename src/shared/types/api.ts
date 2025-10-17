export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

export type BossStatusResponse = {
  type: 'boss_status';
  bossId: string;
  hp: number;
  maxHp: number;
};

export type BossAttackResponse = {
  type: 'boss_attack';
  bossId: string;
  hp: number;
  maxHp: number;
  amount: number;
};
